#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const POLICY_PATH = join(ROOT, "release", "identity-policy.json");

function fail(message) {
  console.error(`release identity error: ${message}`);
  process.exit(1);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: options.env ?? process.env,
  });
  if (result.error) fail(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout || ""}` : "";
    fail(`${command} exited with status ${result.status}${detail}`);
  }
  return options.capture ? result.stdout.trim() : "";
}

function git(...args) {
  return run("git", args, { capture: true });
}

function parseArgs(argv) {
  const parsed = { mode: "ci", version: null, output: null, probe: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mode") parsed.mode = argv[++i];
    else if (arg === "--version") parsed.version = argv[++i];
    else if (arg === "--output") parsed.output = argv[++i];
    else if (arg === "--probe") parsed.probe = true;
    else fail(`unknown argument ${arg}`);
  }
  if (!parsed.version) fail("--version is required");
  if (!new Set(["ci", "candidate"]).has(parsed.mode)) fail(`unsupported mode ${parsed.mode}`);
  return parsed;
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

function collectFiles(root) {
  const files = {};
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const metadata = statSync(absolute, { throwIfNoEntry: true });
      if (metadata.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!metadata.isFile()) fail(`non-regular build artifact ${relative(root, absolute)}`);
      const key = relative(root, absolute).replaceAll("\\", "/");
      files[key] = sha256(readFileSync(absolute));
    }
  }
  walk(root);
  return sortedObject(files);
}

function verifyExactFiles(entries) {
  for (const [relativePath, expected] of Object.entries(entries)) {
    const actual = sha256(readFileSync(join(ROOT, relativePath)));
    if (actual !== expected) fail(`${relativePath} sha256 ${actual} does not match ${expected}`);
  }
}

function buildOnce(policy, label) {
  const outdir = mkdtempSync(join(tmpdir(), `runethread-hosted-${label}-`));
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const env = { ...process.env, NODE_ENV: policy.build.node_env };
  for (const key of [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY",
    "CLOUDFLARE_EMAIL",
    "CLOUDFLARE_ACCOUNT_ID",
  ]) delete env[key];

  run(
    npx,
    ["--no-install", "wrangler", ...policy.build.wrangler_args, "--outdir", outdir],
    { env },
  );
  const files = collectFiles(outdir);
  rmSync(outdir, { recursive: true, force: true });
  return files;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const policyBytes = readFileSync(POLICY_PATH);
  const policy = JSON.parse(policyBytes.toString("utf8"));
  const versionPattern = new RegExp(policy.release_version.format);
  if (!versionPattern.test(args.version)) fail(`invalid version ${args.version}`);
  if (args.mode === "ci" && args.version !== policy.release_version.ci_reserved) {
    fail(`CI mode requires reserved version ${policy.release_version.ci_reserved}`);
  }

  const trackedStatus = git("status", "--porcelain", "--untracked-files=no");
  if (trackedStatus) fail("tracked working tree is not clean");

  const sourceCommit = git("rev-parse", "HEAD");
  const sourceTree = git("rev-parse", "HEAD^{tree}");
  if (args.mode === "candidate") {
    const branch = git("branch", "--show-current");
    if (branch !== policy.source.release_branch) {
      fail(`candidate mode requires branch ${policy.source.release_branch}, got ${branch || "detached HEAD"}`);
    }
  }

  verifyExactFiles({
    "package-lock.json": policy.build.package_lock_sha256,
    "worker-configuration.d.ts": policy.worker.generated_types_sha256,
    "wrangler.jsonc": policy.worker.wrangler_config_sha256,
    ...policy.distribution.required_files_sha256,
  });

  const first = buildOnce(policy, "a");
  const second = buildOnce(policy, "b");
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    fail(`two clean dry-run builds differ: ${JSON.stringify({ first, second })}`);
  }
  if (!Object.keys(first).length) fail("dry-run build produced no files");

  const expected = sortedObject(policy.build.expected_artifacts);
  if (!args.probe && JSON.stringify(first) !== JSON.stringify(expected)) {
    fail(`artifact identity mismatch: ${JSON.stringify({ expected, actual: first })}`);
  }

  const manifest = {
    schema: 1,
    component: policy.component,
    release_version: args.version,
    source: {
      repository: policy.source.repository,
      commit: sourceCommit,
      tree: sourceTree,
    },
    identity_policy_sha256: sha256(policyBytes),
    core: policy.core,
    worker: policy.worker,
    build: {
      node: policy.build.node,
      npm: policy.build.npm,
      package_lock_sha256: policy.build.package_lock_sha256,
      node_env: policy.build.node_env,
      artifacts: first,
      artifact_set_sha256: sha256(Buffer.from(JSON.stringify(first))),
    },
    protocols: policy.protocols,
    capabilities: policy.capabilities,
    distribution: {
      required_files_sha256: sortedObject(policy.distribution.required_files_sha256),
    },
  };

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  if (args.output) writeFileSync(resolve(ROOT, args.output), manifestText, "utf8");
  if (args.probe) {
    console.log(`release_probe_artifacts=${JSON.stringify(first)}`);
    console.log(`release_probe_artifact_set_sha256=${manifest.build.artifact_set_sha256}`);
  } else {
    console.log(`release_identity_sha256=${sha256(Buffer.from(manifestText))}`);
  }

  const finalTrackedStatus = git("status", "--porcelain", "--untracked-files=no");
  if (finalTrackedStatus) fail("release verification changed tracked source");
}

main();
