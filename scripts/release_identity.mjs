#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const POLICY_PATH = join(ROOT, "release", "identity-policy.json");
const SEMVER_2_0_0 = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const HEX40 = /^[0-9a-f]{40}$/;

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
  const parsed = { mode: "ci", version: null, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mode") parsed.mode = argv[++i];
    else if (arg === "--version") parsed.version = argv[++i];
    else if (arg === "--output") parsed.output = argv[++i];
    else fail(`unknown argument ${arg}`);
  }
  if (!parsed.version) fail("--version is required");
  if (!new Set(["ci", "candidate"]).has(parsed.mode)) fail(`unsupported mode ${parsed.mode}`);
  return parsed;
}

function verifySemverImplementation() {
  const valid = [
    "0.0.0",
    "1.2.3",
    "1.2.3-rc.1",
    "1.2.3+build.7",
    "1.2.3-alpha+001",
    "1.0.0-x.7.z.92",
  ];
  const invalid = [
    "01.0.0",
    "1.01.0",
    "1.0.01",
    "1.0",
    "1.0.0-01",
    "1.0.0-",
    "v1.0.0",
    "1.0.0+",
  ];
  for (const value of valid) {
    if (!SEMVER_2_0_0.test(value)) fail(`internal SemVer parser rejects valid value ${value}`);
  }
  for (const value of invalid) {
    if (SEMVER_2_0_0.test(value)) fail(`internal SemVer parser admits invalid value ${value}`);
  }
}

function parseReleaseIdentifier(policy, identifier) {
  const versioning = policy.versioning;
  if (!versioning || versioning.scheme !== "semver-2.0.0") {
    fail("release versioning scheme must be semver-2.0.0");
  }
  if (versioning.release_identifier_prefix !== "v") {
    fail("Runethread release identifier prefix must be exactly v");
  }
  if (!HEX40.test(versioning.authority_git_commit) || !HEX40.test(versioning.authority_git_blob)) {
    fail("versioning authority commit/blob identities must be immutable 40-hex Git identities");
  }
  if (versioning.authority_repository !== "runethread/core" || versioning.authority_path !== "docs/runethread/VERSIONING.md") {
    fail("release versioning authority must be the reviewed Core VERSIONING.md authority");
  }

  const prefix = versioning.release_identifier_prefix;
  if (!identifier.startsWith(prefix)) fail(`release identifier must start with ${prefix}`);
  const semver = identifier.slice(prefix.length);
  if (!SEMVER_2_0_0.test(semver)) fail(`invalid SemVer 2.0.0 value in release identifier ${identifier}`);
  return semver;
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

function collectFiles(root) {
  const files = {};
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const metadata = lstatSync(absolute, { throwIfNoEntry: true });
      const key = relative(root, absolute).replaceAll("\\", "/");
      if (metadata.isSymbolicLink()) fail(`symlink build output is forbidden: ${key}`);
      if (metadata.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!metadata.isFile()) fail(`non-regular build artifact ${key}`);
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

function exactPathSet(policy, files) {
  const deploy = [...policy.build.deploy_artifact_paths].sort();
  const auxiliary = [...policy.build.dry_run_auxiliary_paths].sort();
  const expectedPaths = [...deploy, ...auxiliary].sort();
  if (new Set(expectedPaths).size !== expectedPaths.length) {
    fail("deploy and dry-run auxiliary path sets overlap or contain duplicates");
  }
  const actualPaths = Object.keys(files).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    fail(`dry-run output path set changed: ${JSON.stringify({ expected: expectedPaths, actual: actualPaths })}`);
  }
  return deploy;
}

function deployArtifacts(policy, files) {
  const deployPaths = exactPathSet(policy, files);
  return sortedObject(Object.fromEntries(deployPaths.map((path) => [path, files[path]])));
}

function lockedWrangler(policy) {
  const packagePath = join(ROOT, "node_modules", "wrangler", "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (packageJson.version !== policy.worker.wrangler) {
    fail(`installed Wrangler ${packageJson.version} does not match ${policy.worker.wrangler}`);
  }
  const bin = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.wrangler;
  if (!bin) fail("installed Wrangler package has no wrangler CLI entrypoint");
  const cli = resolve(dirname(packagePath), bin);
  const metadata = lstatSync(cli, { throwIfNoEntry: true });
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail("Wrangler CLI entrypoint must be a regular file");
  return cli;
}

function buildOnce(policy, wranglerCli, label) {
  const outdir = mkdtempSync(join(tmpdir(), `runethread-hosted-${label}-`));
  const env = {
    ...process.env,
    NODE_ENV: policy.build.node_env,
    WRANGLER_SEND_METRICS: "false",
  };
  for (const key of [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY",
    "CLOUDFLARE_EMAIL",
    "CLOUDFLARE_ACCOUNT_ID",
  ]) delete env[key];

  try {
    run(process.execPath, [wranglerCli, ...policy.build.wrangler_args, "--outdir", outdir], { env });
    return collectFiles(outdir);
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

function main() {
  verifySemverImplementation();

  const args = parseArgs(process.argv.slice(2));
  const policyBytes = readFileSync(POLICY_PATH);
  const policy = JSON.parse(policyBytes.toString("utf8"));
  if (policy.publication_enabled !== false) fail("release identity baseline must remain non-publishing");
  if (process.version !== `v${policy.build.node}`) {
    fail(`Node ${process.version} does not match v${policy.build.node}`);
  }

  const semverValue = parseReleaseIdentifier(policy, args.version);
  const reservedSemver = parseReleaseIdentifier(policy, policy.release_version.ci_reserved);
  if (args.mode === "ci" && args.version !== policy.release_version.ci_reserved) {
    fail(`CI mode requires reserved version ${policy.release_version.ci_reserved}`);
  }
  if (args.mode === "candidate" && args.version === policy.release_version.ci_reserved) {
    fail("candidate mode cannot use the reserved CI version");
  }
  if (reservedSemver !== "0.0.0-ci") fail("reserved CI SemVer value must remain 0.0.0-ci");

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

  const wranglerCli = lockedWrangler(policy);
  const firstAll = buildOnce(policy, wranglerCli, "a");
  const secondAll = buildOnce(policy, wranglerCli, "b");
  const first = deployArtifacts(policy, firstAll);
  const second = deployArtifacts(policy, secondAll);
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    fail(`two clean dry-run deploy artifacts differ: ${JSON.stringify({ first, second })}`);
  }
  if (!Object.keys(first).length) fail("dry-run build produced no deploy artifacts");

  const expected = sortedObject(policy.build.expected_deploy_artifacts);
  if (JSON.stringify(first) !== JSON.stringify(expected)) {
    fail(`deploy artifact identity mismatch: ${JSON.stringify({ expected, actual: first })}`);
  }

  const manifest = {
    schema: 1,
    component: policy.component,
    versioning: policy.versioning,
    release_version: {
      identifier: args.version,
      semver: semverValue,
    },
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
      deploy_artifacts: first,
      deploy_artifact_set_sha256: sha256(Buffer.from(JSON.stringify(first))),
    },
    protocols: policy.protocols,
    capabilities: policy.capabilities,
    distribution: {
      required_files_sha256: sortedObject(policy.distribution.required_files_sha256),
    },
  };

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  if (args.output) writeFileSync(resolve(ROOT, args.output), manifestText, "utf8");
  console.log(`release_identity_sha256=${sha256(Buffer.from(manifestText))}`);

  const finalTrackedStatus = git("status", "--porcelain", "--untracked-files=no");
  if (finalTrackedStatus) fail("release verification changed tracked source");
}

main();
