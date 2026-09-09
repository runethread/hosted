#!/usr/bin/env python3
"""Fail-closed repository policy checks for runethread/hosted."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterable

TRACKED_FILES = (
    "AGENTS.md",
    "README.md",
    "LICENSE",
    "LICENSE-MIT",
    "LICENSE-APACHE-2.0",
    "LICENSING.md",
    "THIRD_PARTY_NOTICES.md",
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    ".nvmrc",
    ".github/CODEOWNERS",
    ".github/dependabot.yml",
    ".github/pull_request_template.md",
    ".github/workflows/validate.yml",
    "docs/ARCHITECTURE_BASELINE.md",
    "docs/API_BOUNDARY.md",
    "docs/CURRENT_MILESTONE.md",
    "docs/DEVELOPMENT_PIPELINE.md",
    "docs/ENGINEERING_PROCESS.md",
    "package.json",
    "package-lock.json",
    "release/identity-policy.json",
    "scripts/check_development_policy.py",
    "scripts/check_development_policy_test.py",
    "scripts/release_identity.mjs",
    "src/api.ts",
    "src/index.ts",
    "test/api.test.ts",
    "test/index.test.ts",
    "test/tsconfig.json",
    "tsconfig.json",
    "vitest.config.ts",
    "worker-configuration.d.ts",
    "wrangler.jsonc",
)

WORKFLOWS = (".github/workflows/validate.yml",)
WORKFLOW_SHA256 = "3db585a413edb82a26af19ba166ea188d09af8f75ee7a0c396ab1b9f36abec35"
DEPENDABOT_SHA256 = "72f781d2d2aba8161ef5cc6148c64ff9fa520239bab7e23de686282293b68cf9"
PERIMETER_LICENSE_SHA256 = "bb1d1de338bdbe282f151bf54d6bb6ad98ad37b9592539461fb51ff4bcd4e1c3"
HISTORICAL_MIT_LICENSE_SHA256 = "273538c6ad97c94dc4230b1b66211a1ebf2769d86fa0bc93cbe2d6670eca88bd"
LICENSING_POLICY_SHA256 = "2e24408e4bd928115148b1c82afde94547af6e250b427fe2c0b5b8357b6d53aa"
APACHE_2_LICENSE_SHA256 = "0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594"
THIRD_PARTY_NOTICES_SHA256 = "0bf7a5673ef4e293106453896d0fa826aef2ed1903589cd39590e44604657bcb"
PACKAGE_LOCK_SHA256 = "dafea88d811a42ccb96a6b1f4cee69212732adb4f8e7b28ab4efb7997db13eb2"
RELEASE_IDENTITY_GIT_BLOBS = {
    "release/identity-policy.json": "19c3f087817f92468c4a7bf552f634ee0a06c194",
    "scripts/release_identity.mjs": "6751380c8a7230eb7c0be1d0710fbb38ed894e81",
}
RELEASE_VERSIONING_IDENTITY = {
    "scheme": "semver-2.0.0",
    "authority_repository": "runethread/core",
    "authority_git_commit": "60a5f5c83ac740e26d4f11db99de66fa7b8c914d",
    "authority_path": "docs/runethread/VERSIONING.md",
    "authority_git_blob": "d4c49b67892cfe769a7b25adf3f4efb21d95ed9a",
    "release_identifier_prefix": "v",
}
RELEASE_CORE_IDENTITY = {
    "runtime_release": "v0.9.0",
    "runtime_git_commit": "7f5cf86f23604426c7e8f69086fdcbe27fb86226",
    "contract_release": "v0.9.0",
    "contract_version": 9,
    "repository_format": 2,
    "memory_schema": 1,
    "index_format": 2,
    "trust_lock_version": 2,
    "bootstrap_protocol": 1,
    "bootstrap_verifier": "v0.6.0",
}
RELEASE_WORKER_IDENTITY = {
    "wrangler": "4.129.1",
    "compatibility_date": "2026-09-09",
    "compatibility_flags": ["no_nodejs_compat", "no_nodejs_compat_v2"],
    "generated_runtime_types_workerd": "1.20260907.1",
    "generated_types_sha256": "d67a9e9d72dd0d155fcfd187a64d83ab062db80f20b585dfa36904ee0c778b44",
    "wrangler_config_sha256": "5edbb90b6d53027f4e24ed2589c43b3eee7638f6d1bc016179bbdd8a879eb039",
}
RELEASE_BUILD_IDENTITY = {
    "node": "24.20.0",
    "npm": "11.19.0",
    "package_lock_sha256": PACKAGE_LOCK_SHA256,
    "node_env": "production",
    "wrangler_args": [
        "deploy",
        "--dry-run",
        "--config",
        "wrangler.jsonc",
        "--x-provision=false",
        "--x-auto-create=false",
    ],
    "deploy_artifact_paths": ["index.js"],
    "dry_run_auxiliary_paths": ["README.md"],
    "expected_deploy_artifacts": {
        "index.js": "905ab7b489f99893812b422862dc8dd527790fe9cdd1a9f730e2514d552bf0cf"
    },
}
RELEASE_PROTOCOL_IDENTITIES = {
    "hosted_api": "not_implemented",
    "repository_runtime": "not_implemented",
    "candidate_envelope": "not_implemented",
    "finalization_evidence": "not_implemented",
    "audit_conformance": "not_implemented",
    "terminal_success_verification": "not_implemented",
    "terminal_disposition": "not_implemented",
    "safety_journal": "not_implemented",
    "publication": "not_implemented",
    "reconciliation": "not_implemented",
}
RELEASE_CAPABILITIES = {
    "authenticated_api": False,
    "repository_binding": False,
    "durable_state": False,
    "semantic_mutation": False,
    "publication": False,
    "deployment": False,
}
RELEASE_DISTRIBUTION_IDENTITIES = {
    "LICENSE": PERIMETER_LICENSE_SHA256,
    "LICENSE-MIT": HISTORICAL_MIT_LICENSE_SHA256,
    "LICENSE-APACHE-2.0": APACHE_2_LICENSE_SHA256,
    "LICENSING.md": LICENSING_POLICY_SHA256,
    "THIRD_PARTY_NOTICES.md": THIRD_PARTY_NOTICES_SHA256,
}

NODE_VERSION = "24.20.0"
NPM_VERSION = "11.19.0"
EXPECTED_DEV_DEPENDENCIES = {
    "@cloudflare/vitest-plugin": "1.1.5",
    "typescript": "5.8.3",
    "vitest": "4.1.11",
    "wrangler": "4.129.1",
}
EXPECTED_SCRIPTS = {
    "types:check": "wrangler types --check",
    "typecheck": "tsc --noEmit && tsc -p test/tsconfig.json --noEmit",
    "test": "vitest run",
    "release:verify-ci": "node scripts/release_identity.mjs --mode ci --version v0.0.0-ci",
    "check": "npm run types:check && npm run typecheck && npm test && npm run release:verify-ci",
}

# Exact byte tripwires for the current non-operational shell/toolchain gate.
# These are implementation-gate identities, not permanent Runethread invariants.
TOOLCHAIN_SURFACE_SHA256 = {
    ".gitattributes": "fdf103a524864b292f70b2f1bb3013d14964036fa2da47c90cba1232baa0054a",
    ".nvmrc": "5b9d0e73029969ae9000117cb877f17bb9841c1279bfe8024e294acfcf017800",
    "package.json": "7167e5c7f333d716ea43e8b492a110283312d57416893bc7d090c77c4cfe9aa3",
    "package-lock.json": PACKAGE_LOCK_SHA256,
    "src/index.ts": "e705ae5df6f90d4ac2e0c17205b9aa8435161403ced8fbcbcc52614580522882",
    "test/index.test.ts": "242591d0b8356583fca337fec0ca98abe019bf599da2e02b33488851331106f6",
    "test/tsconfig.json": "95d5e81f279f22af644f8bdf99935473bf19d037789e07116cbbdf5799fcdb60",
    "tsconfig.json": "329463c9460980c0cbe9a46ed658cbc341375089d48632a8f73c42affde7b03e",
    "vitest.config.ts": "f9ce78ff32af4bf1dc236554849a2d3f7313f14eefaf0051e7eaf642d8e4e701",
    "worker-configuration.d.ts": "d67a9e9d72dd0d155fcfd187a64d83ab062db80f20b585dfa36904ee0c778b44",
    "wrangler.jsonc": "5edbb90b6d53027f4e24ed2589c43b3eee7638f6d1bc016179bbdd8a879eb039",
}

# Secondary licensing/governance entrypoints are exact-locked. These Git blob
# object IDs are byte-change tripwires; the legal texts and LICENSING.md remain
# independently SHA-256 locked. Exact-head review is still required because a
# PR can modify this guard and its expectations together.
LICENSING_AUTHORITY_GIT_BLOBS = {
    "README.md": "4f664836ed9629d04473a7d582bc7e693f57c6d0",
    "AGENTS.md": "c8df303ca14b57ecc22b79d2a46f97d4db9f309a",
    "docs/CURRENT_MILESTONE.md": "fe97af16b7426443b12ffbfb50f0d4ca82f92e97",
    "docs/DEVELOPMENT_PIPELINE.md": "d72f89483478242ba11759ac61f27a1bec196dd9",
    "docs/ENGINEERING_PROCESS.md": "d794ae76136e48e5e920bcb39e5e8f5d24534e60",
    "docs/ARCHITECTURE_BASELINE.md": "5a2576b62da1843dc5c6f810e5ca7528c0530687",
    ".github/pull_request_template.md": "2883de95af5d586c4c0096ecdd870f34dadf9e7a",
}

LICENSING_AUTHORITY_PATHS = frozenset(
    {"LICENSE", "LICENSE-MIT", "LICENSING.md"} | set(LICENSING_AUTHORITY_GIT_BLOBS)
)
LICENSING_GUARD_IMPLEMENTATION_PATHS = frozenset(
    {"scripts/check_development_policy.py", "scripts/check_development_policy_test.py"}
)
NON_AUTHORITY_LICENSE_METADATA_PATHS = frozenset({"package-lock.json", "release/identity-policy.json"})
THIRD_PARTY_DISTRIBUTION_PATHS = frozenset(
    {"LICENSE-APACHE-2.0", "THIRD_PARTY_NOTICES.md", "worker-configuration.d.ts"}
)
NON_AUTHORITY_LICENSE_TEXT_PATHS = (
    NON_AUTHORITY_LICENSE_METADATA_PATHS | THIRD_PARTY_DISTRIBUTION_PATHS
)

LICENSING_REQUIRED_MARKERS = {
    "LICENSING.md": (
        "This repository has no prospective MIT interoperability exception of its own",
        "fd4928859aaa0ff7105330686daa10217f2952f2",
        "ca2282eafca03573ac9c88277125cc6973234959",
        "User data",
        "Distribution notices",
        "LICENSE-APACHE-2.0",
        "THIRD_PARTY_NOTICES.md",
        "every `Required Notice:`",
        "explicit inbound-rights policy",
    ),
    "THIRD_PARTY_NOTICES.md": (
        "worker-configuration.d.ts",
        "workerd@1.20260907.1",
        "Cloudflare",
        "Microsoft",
        "Apache License 2.0",
        "LICENSE-APACHE-2.0",
    ),
    "README.md": (
        "PolyForm Perimeter 1.0.1 as the prospective Hosted implementation default",
        "Hosted has no prospective MIT interoperability exception of its own",
        "LICENSE-MIT",
        "LICENSING.md",
    ),
    "AGENTS.md": (
        "ADR-026 is the settled licensing decision",
        "Hosted has no prospective MIT exception",
        "user-owned data is outside Runethread's software-license grants",
    ),
    "docs/CURRENT_MILESTONE.md": (
        "Hosted has no prospective MIT exception",
        "Core's exact MIT interoperability boundary does not automatically extend into Hosted",
        "user-owned data remains outside Runethread's software-license grants",
    ),
    "docs/DEVELOPMENT_PIPELINE.md": (
        "ADR-026 is the accepted project licensing/commercial-model decision",
        "Hosted has **no prospective MIT exception**",
        "User-authored memories/projects/imports/attachments/data remain outside Runethread's software-license grants",
        "Self-protection limitation",
        "Green CI therefore cannot attest to its own integrity",
        "every `Required Notice:`",
        "No Hosted release artifact may be published until its applicable notice/rights packaging is proven",
    ),
    "docs/ENGINEERING_PROCESS.md": (
        "ADR-026 settles the Hosted licensing/commercial model",
        "Hosted has no prospective MIT exception",
        "`LICENSING.md` is the current Hosted licensing authority",
    ),
    "docs/ARCHITECTURE_BASELINE.md": (
        "ADR-026 was accepted in `runethread/core` after this bootstrap architecture pin",
        "[`../LICENSING.md`](../LICENSING.md)",
        "does not rewrite the historical ADR-012 through ADR-025 architecture pin",
    ),
    ".github/pull_request_template.md": (
        "ADR-026 and `LICENSING.md` were checked",
        "PolyForm Perimeter 1.0.1",
        "does not create a prospective Hosted MIT exception",
        "User-authored memories, projects, imports, attachments, and other user-owned data",
        "explicit inbound-rights policy",
        "every `Required Notice:`",
        "green CI was not treated as self-attestation",
    ),
}

CURRENT_MIT_CLAIM_RE = re.compile(
    r"\b(?:runethread\s+hosted|hosted(?:\s+(?:implementation|source|material))?|this\s+repository)"
    r"\s+(?:(?:is|are|remains?)\s+(?:currently\s+)?(?:licensed\s+under\s+)?(?:the\s+)?MIT\b"
    r"|(?:is|are)\s+available\s+under\s+(?:the\s+)?MIT\b"
    r"|(?:is|are)\s+distributed\s+under\s+(?:the\s+)?MIT\b"
    r"|uses\s+(?:the\s+)?MIT\s+License\b)",
    re.IGNORECASE,
)
LICENSE_VOCAB_RE = re.compile(
    r"(?i)(?:"
    r"\b(?:license|licensed|licenses|licensing|licensor|licensee|licence|licenced|licences|licencing)\b|"
    r"\brightsholder\b|\bcopyright\b|\bcopyleft\b|\bpolyform\b|\bperimeter\b|\bMIT\b|"
    r"\bpatents?\b|\btrademarks?\b|\bsource[- ]available\b|\bopen[- ]source\b|"
    r"\bnon[- ]?commercial\b|\bcommercial(?:ly|ization|isation)?\b|"
    r"\bdual[- ]licens(?:e|ed|ing)\b|\brelicens(?:e|ed|ing)\b|"
    r"\bproprietary\b|\bpublic domain\b|\ball rights reserved\b|"
    r"SPDX-License-Identifier"
    r")"
)
EXACT_SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)
SECRET_NAMES = (".env", ".dev.vars")
SECRET_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".ppk"}
PRIVATE_KEY_NAMES = {"id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"}
TEXT_SUFFIXES = {".md", ".py", ".yml", ".yaml", ".json", ".jsonc", ".ts", ".js", ".txt"}
TEXT_NAMES = {
    ".gitattributes",
    ".gitignore",
    ".editorconfig",
    ".nvmrc",
    "LICENSE",
    "LICENSE-MIT",
    "LICENSE-APACHE-2.0",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob_sha1(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def exact_file_errors(root: Path, expected: dict[str, str], label: str) -> list[str]:
    errors: list[str] = []
    for relative, digest in expected.items():
        path = root / relative
        try:
            actual = sha256_bytes(path.read_bytes())
        except OSError as exc:
            errors.append(f"cannot read {label} file {relative}: {exc}")
            continue
        if actual != digest:
            errors.append(
                f"{label} file {relative} must match exact reviewed bytes: expected sha256 {digest}, got {actual}"
            )
    return errors


def release_identity_errors(root: Path, tracked_relatives: set[str]) -> list[str]:
    errors: list[str] = []
    for relative, expected_blob in RELEASE_IDENTITY_GIT_BLOBS.items():
        if relative not in tracked_relatives:
            errors.append(f"required release identity surface missing: {relative}")
            continue
        try:
            data = (root / relative).read_bytes()
        except OSError as exc:
            errors.append(f"cannot read release identity surface {relative}: {exc}")
            continue
        actual_blob = git_blob_sha1(data)
        if actual_blob != expected_blob:
            errors.append(
                f"{relative} must match exact reviewed release identity bytes: "
                f"expected git blob {expected_blob}, got {actual_blob}"
            )

    policy_path = root / "release/identity-policy.json"
    try:
        policy = json.loads(policy_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        errors.append(f"cannot parse release identity policy: {exc}")
        return errors
    if not isinstance(policy, dict):
        errors.append("release identity policy root must be an object")
        return errors

    expected_root = {
        "schema",
        "component",
        "publication_enabled",
        "versioning",
        "release_version",
        "source",
        "core",
        "worker",
        "build",
        "protocols",
        "capabilities",
        "distribution",
    }
    if set(policy) != expected_root:
        errors.append("release identity policy root keys must match the reviewed baseline")
    if policy.get("schema") != 1 or policy.get("component") != "runethread/hosted":
        errors.append("release identity policy schema/component mismatch")
    if policy.get("publication_enabled") is not False:
        errors.append("release identity baseline must remain non-publishing")
    if policy.get("versioning") != RELEASE_VERSIONING_IDENTITY:
        errors.append("release versioning authority must match the immutable ADR-028/Core VERSIONING.md pin")
    if policy.get("release_version") != {"ci_reserved": "v0.0.0-ci"}:
        errors.append("release CI identity must remain exactly v0.0.0-ci")
    if policy.get("source") != {
        "repository": "runethread/hosted",
        "release_branch": "main",
        "require_clean_tracked_tree": True,
        "require_protected_validate": True,
    }:
        errors.append("release source eligibility policy must match the reviewed protected-main baseline")
    if policy.get("core") != RELEASE_CORE_IDENTITY:
        errors.append("release Core/runtime/contract identity must match the immutable reviewed baseline")
    if policy.get("worker") != RELEASE_WORKER_IDENTITY:
        errors.append("release Worker/provider identity must match the reviewed baseline")
    if policy.get("build") != RELEASE_BUILD_IDENTITY:
        errors.append("release build/artifact identity must match the reviewed dry-run baseline")
    if policy.get("protocols") != RELEASE_PROTOCOL_IDENTITIES:
        errors.append("unimplemented Hosted protocols must remain explicit not_implemented identities")
    if policy.get("capabilities") != RELEASE_CAPABILITIES:
        errors.append("unimplemented Hosted capabilities must remain false")
    if policy.get("distribution") != {"required_files_sha256": RELEASE_DISTRIBUTION_IDENTITIES}:
        errors.append("release distribution notice identities must match current licensing policy")
    return errors


def workflow_errors(text: str) -> list[str]:
    digest = sha256_bytes(text.encode("utf-8"))
    if digest != WORKFLOW_SHA256:
        return [
            "required workflow must match the exact reviewed contract: "
            f"expected sha256 {WORKFLOW_SHA256}, got {digest}"
        ]
    return []


def tracked_manifest_errors(tracked_relatives: set[str]) -> list[str]:
    errors: list[str] = []
    expected = set(TRACKED_FILES)
    for relative in sorted(expected - tracked_relatives):
        errors.append(f"required tracked file missing: {relative}")
    for relative in sorted(tracked_relatives - expected):
        errors.append(
            f"unexpected tracked file during the non-operational shell gate: {relative}; "
            "extend the reviewed manifest deliberately under the owning milestone"
        )
    return errors


def package_manifest_errors(root: Path, tracked_relatives: set[str]) -> list[str]:
    package_path = root / "package.json"
    lock_path = root / "package-lock.json"
    package_tracked = "package.json" in tracked_relatives
    lock_tracked = "package-lock.json" in tracked_relatives
    if package_tracked != lock_tracked:
        return ["package.json and package-lock.json must either both be Git-tracked or both be absent"]
    if not package_tracked:
        if package_path.exists() or lock_path.exists():
            return ["package.json/package-lock.json must not exist untracked"]
        return []
    return package_errors(package_path, lock_path)


def package_errors(package_path: Path, lock_path: Path) -> list[str]:
    errors: list[str] = []
    if package_path.exists() != lock_path.exists():
        return ["package.json and package-lock.json must be introduced/removed together"]
    if not package_path.exists():
        return []
    try:
        package_bytes = package_path.read_bytes()
        package = json.loads(package_bytes.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return [f"cannot parse package.json: {exc}"]
    try:
        lock_bytes = lock_path.read_bytes()
        lock = json.loads(lock_bytes.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return [f"cannot parse package-lock.json: {exc}"]

    if not isinstance(package, dict):
        return ["package.json root must be an object"]
    if not isinstance(lock, dict):
        return ["package-lock.json root must be an object"]

    if sha256_bytes(package_bytes) != TOOLCHAIN_SURFACE_SHA256["package.json"]:
        errors.append("package.json must match the exact reviewed non-operational toolchain manifest")
    if sha256_bytes(lock_bytes) != PACKAGE_LOCK_SHA256:
        errors.append("package-lock.json must match the exact reviewed generated lockfile")

    if package.get("name") != "@runethread/hosted":
        errors.append("package name must remain @runethread/hosted")
    if package.get("private") is not True:
        errors.append("service package must set private: true")
    if package.get("type") != "module":
        errors.append("service package must remain an ES module package")
    if package.get("packageManager") != f"npm@{NPM_VERSION}":
        errors.append(f"packageManager must be exactly npm@{NPM_VERSION}")
    if package.get("engines") != {"node": NODE_VERSION}:
        errors.append(f"package engines.node must be exactly {NODE_VERSION}")
    if package.get("scripts") != EXPECTED_SCRIPTS:
        errors.append("package scripts must match the exact non-operational validation-only script set")
    if package.get("devDependencies") != EXPECTED_DEV_DEPENDENCIES:
        errors.append("direct devDependencies must match the exact reviewed toolchain versions")

    for section in ("dependencies", "optionalDependencies", "peerDependencies"):
        values = package.get(section)
        if values not in (None, {}):
            errors.append(f"{section} is not admitted by the non-operational shell gate")
    for name, version in package.get("devDependencies", {}).items():
        if not isinstance(version, str) or EXACT_SEMVER_RE.fullmatch(version) is None:
            errors.append(f"devDependencies.{name} must use an exact SemVer version, got {version!r}")

    if lock.get("lockfileVersion") != 3:
        errors.append("package-lock.json must use lockfileVersion 3")
    if lock.get("requires") is not True:
        errors.append("package-lock.json must set requires: true")
    packages = lock.get("packages")
    if not isinstance(packages, dict):
        errors.append("package-lock.json packages must be an object")
        return errors
    root = packages.get("")
    if not isinstance(root, dict):
        errors.append("package-lock.json must contain the root package entry")
        return errors
    if root.get("name") != "@runethread/hosted":
        errors.append("lockfile root package name mismatch")
    if root.get("devDependencies") != EXPECTED_DEV_DEPENDENCIES:
        errors.append("lockfile root devDependencies do not match package.json")
    if root.get("engines") != {"node": NODE_VERSION}:
        errors.append("lockfile root Node engine mismatch")
    if root.get("dependencies") not in (None, {}):
        errors.append("lockfile root runtime dependencies are not admitted")

    for relative, metadata in packages.items():
        if relative == "":
            continue
        if not isinstance(metadata, dict):
            errors.append(f"lockfile package entry must be an object: {relative}")
            continue
        if metadata.get("dev") is not True:
            errors.append(f"all current lockfile packages must remain development-only: {relative}")
        resolved = metadata.get("resolved")
        if not isinstance(resolved, str) or not resolved.startswith("https://registry.npmjs.org/"):
            errors.append(f"lockfile package must resolve from registry.npmjs.org: {relative}")
        integrity = metadata.get("integrity")
        if not isinstance(integrity, str) or not integrity.startswith("sha512-"):
            errors.append(f"lockfile package must carry sha512 integrity metadata: {relative}")
        if metadata.get("link") is True:
            errors.append(f"lockfile link/workspace package is not admitted: {relative}")

    return errors


def wrangler_errors(path: Path) -> list[str]:
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return [f"cannot parse wrangler.jsonc: {exc}"]
    expected = {
        "$schema": "./node_modules/wrangler/config-schema.json",
        "name": "runethread-hosted",
        "main": "src/index.ts",
        "compatibility_date": "2026-09-09",
        "compatibility_flags": ["no_nodejs_compat", "no_nodejs_compat_v2"],
        "workers_dev": False,
        "preview_urls": False,
        "minify": False,
        "upload_source_maps": False,
        "find_additional_modules": False,
        "send_metrics": False,
        "dependencies_instrumentation": {"enabled": False},
    }
    if config != expected:
        return [
            "wrangler.jsonc must remain the exact resource-free non-operational shell configuration; "
            "bindings/routes/resources/compatibility changes require the owning later gate"
        ]
    return []


def generated_types_errors(path: Path) -> list[str]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return [f"cannot read generated Worker types: {exc}"]
    required = (
        "Generated by Wrangler by running `wrangler types`",
        'mainModule: typeof import("./src/index")',
        "interface Env extends __BaseEnv_Env {}",
        "Runtime types generated with workerd@",
        "2026-09-09 no_nodejs_compat,no_nodejs_compat_v2",
        "// Begin runtime types",
        "cloudflare:workers",
    )
    errors = [f"generated Worker types missing required marker: {marker}" for marker in required if marker not in text]
    if "--include-runtime=false" in text:
        errors.append("generated Worker types must include compatibility-locked runtime declarations")
    return errors


def parse_tracked_manifest(raw: bytes, root: Path) -> tuple[list[Path], list[str]]:
    """Parse `git ls-files --stage -z`, accepting only tracked regular files."""
    paths: list[Path] = []
    errors: list[str] = []
    for entry in raw.split(b"\0"):
        if not entry:
            continue
        try:
            header, raw_path = entry.split(b"\t", 1)
            mode_b, _object_b, stage_b = header.split(b" ", 2)
            mode = mode_b.decode("ascii")
            stage = stage_b.decode("ascii")
            relative = raw_path.decode("utf-8")
        except (ValueError, UnicodeDecodeError) as exc:
            errors.append(f"cannot parse tracked Git entry: {exc}")
            continue
        if stage != "0":
            errors.append(f"tracked path has unresolved/non-stage-0 index entry: {relative}")
            continue
        if mode not in {"100644", "100755"}:
            errors.append(f"unsupported tracked Git mode {mode} for {relative}")
            continue
        path = root / relative
        if path.is_symlink() or not path.is_file():
            errors.append(f"tracked regular file is missing or has unexpected filesystem type: {relative}")
            continue
        paths.append(path)
    return paths, errors


def tracked_regular_files(root: Path) -> tuple[list[Path], list[str]]:
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "ls-files", "--stage", "-z"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except OSError as exc:
        return [], [f"cannot enumerate Git-tracked files: {exc}"]
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        return [], [f"cannot enumerate Git-tracked files: {detail or 'git ls-files failed'}"]
    return parse_tracked_manifest(result.stdout, root)


def secret_path_errors(paths: Iterable[Path]) -> list[str]:
    errors: list[str] = []
    for path in paths:
        lower_name = path.name.lower()
        is_env_secret = any(lower_name == prefix or lower_name.startswith(prefix + ".") for prefix in SECRET_NAMES)
        if is_env_secret and not lower_name.endswith(".example"):
            errors.append(f"tracked secret file is forbidden: {path}")
        if lower_name in PRIVATE_KEY_NAMES or path.suffix.lower() in SECRET_SUFFIXES:
            errors.append(f"private key/certificate material is forbidden in source: {path}")
    return errors


def crlf_errors(paths: Iterable[Path]) -> list[str]:
    errors: list[str] = []
    for path in paths:
        if path.suffix.lower() not in TEXT_SUFFIXES and path.name not in TEXT_NAMES:
            continue
        try:
            data = path.read_bytes()
        except OSError as exc:
            errors.append(f"cannot read {path}: {exc}")
            continue
        if b"\r\n" in data:
            errors.append(f"CRLF is forbidden in project-controlled text: {path}")
    return errors


def _read_utf8(path: Path) -> tuple[str | None, str | None]:
    try:
        data = path.read_bytes()
    except OSError as exc:
        return None, str(exc)
    if b"\0" in data:
        return None, "contains NUL bytes"
    try:
        return data.decode("utf-8"), None
    except UnicodeDecodeError as exc:
        return None, f"invalid UTF-8: {exc}"


def licensing_errors(root: Path, tracked_relatives: set[str]) -> list[str]:
    errors: list[str] = []

    exact_hashes = {
        "LICENSE": PERIMETER_LICENSE_SHA256,
        "LICENSE-MIT": HISTORICAL_MIT_LICENSE_SHA256,
        "LICENSE-APACHE-2.0": APACHE_2_LICENSE_SHA256,
        "LICENSING.md": LICENSING_POLICY_SHA256,
        "THIRD_PARTY_NOTICES.md": THIRD_PARTY_NOTICES_SHA256,
    }
    for relative, expected in exact_hashes.items():
        if relative not in tracked_relatives:
            errors.append(f"required licensing file missing: {relative}")
            continue
        path = root / relative
        try:
            actual = sha256_bytes(path.read_bytes())
        except OSError as exc:
            errors.append(f"cannot read licensing file {relative}: {exc}")
            continue
        if actual != expected:
            errors.append(
                f"{relative} must match exact reviewed licensing bytes: expected sha256 {expected}, got {actual}"
            )

    for relative, expected_blob in LICENSING_AUTHORITY_GIT_BLOBS.items():
        if relative not in tracked_relatives:
            errors.append(f"licensing authority surface missing: {relative}")
            continue
        path = root / relative
        try:
            data = path.read_bytes()
        except OSError as exc:
            errors.append(f"cannot read licensing authority surface {relative}: {exc}")
            continue
        actual_blob = git_blob_sha1(data)
        if actual_blob != expected_blob:
            errors.append(
                f"{relative} must match exact reviewed governance bytes: expected git blob {expected_blob}, got {actual_blob}"
            )

    for relative, markers in LICENSING_REQUIRED_MARKERS.items():
        if relative not in tracked_relatives:
            errors.append(f"licensing authority surface missing: {relative}")
            continue
        text, read_error = _read_utf8(root / relative)
        if read_error is not None or text is None:
            errors.append(f"cannot read licensing authority surface {relative}: {read_error}")
            continue
        for marker in markers:
            if marker not in text:
                errors.append(f"{relative} missing licensing invariant marker: {marker}")

    # All current tracked files are intentional text. Dependency metadata plus
    # exact-hash-locked third-party distribution surfaces may contain third-party
    # license/rights notices. Those bytes are not Hosted licensing authority and
    # are exempt from prose claim/vocabulary classification only; their exact,
    # toolchain, and third-party-license checks remain mandatory.
    for relative in sorted(tracked_relatives):
        path = root / relative
        text, read_error = _read_utf8(path)
        if read_error is not None or text is None:
            errors.append(f"cannot scan licensing claims in {relative}: {read_error}")
            continue

        if (
            relative not in NON_AUTHORITY_LICENSE_TEXT_PATHS
            and relative != "LICENSE-MIT"
            and CURRENT_MIT_CLAIM_RE.search(text)
        ):
            errors.append(
                f"{relative} makes a stale/current MIT claim for Hosted; historical MIT belongs only to the historical-grant context"
            )

        if (
            relative not in LICENSING_AUTHORITY_PATHS
            and relative not in LICENSING_GUARD_IMPLEMENTATION_PATHS
            and relative not in NON_AUTHORITY_LICENSE_TEXT_PATHS
            and LICENSE_VOCAB_RE.search(text)
        ):
            errors.append(
                f"{relative} contains licensing/rights vocabulary outside the exact reviewed Hosted licensing authority surfaces"
            )

    return errors


def check_repository(root: Path) -> list[str]:
    errors: list[str] = []
    project_paths, manifest_parse_errors = tracked_regular_files(root)
    errors.extend(manifest_parse_errors)
    tracked_relatives = {path.relative_to(root).as_posix() for path in project_paths}

    errors.extend(tracked_manifest_errors(tracked_relatives))

    workflows = tuple(
        sorted(
            relative
            for relative in tracked_relatives
            if relative.startswith(".github/workflows/") and Path(relative).suffix.lower() in {".yml", ".yaml"}
        )
    )
    if workflows != WORKFLOWS:
        errors.append(f"workflow manifest must be exactly {WORKFLOWS!r}, got {workflows!r}")
    for relative in workflows:
        try:
            text = (root / relative).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            errors.append(f"cannot read {relative}: {exc}")
            continue
        errors.extend(f"{relative}: {err}" for err in workflow_errors(text))

    dependabot = root / ".github" / "dependabot.yml"
    try:
        actual_dependabot = sha256_bytes(dependabot.read_bytes())
    except OSError as exc:
        errors.append(f"cannot read .github/dependabot.yml: {exc}")
    else:
        if actual_dependabot != DEPENDABOT_SHA256:
            errors.append(".github/dependabot.yml must match the reviewed Actions+npm maintenance policy")

    errors.extend(package_manifest_errors(root, tracked_relatives))
    errors.extend(exact_file_errors(root, TOOLCHAIN_SURFACE_SHA256, "toolchain/shell"))
    errors.extend(release_identity_errors(root, tracked_relatives))
    errors.extend(wrangler_errors(root / "wrangler.jsonc"))
    errors.extend(generated_types_errors(root / "worker-configuration.d.ts"))
    errors.extend(secret_path_errors(project_paths))
    errors.extend(crlf_errors(project_paths))
    errors.extend(licensing_errors(root, tracked_relatives))

    baseline = root / "docs" / "ARCHITECTURE_BASELINE.md"
    if "docs/ARCHITECTURE_BASELINE.md" in tracked_relatives:
        try:
            text = baseline.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            errors.append(f"cannot read architecture baseline: {exc}")
        else:
            required = (
                "22995a7cf7d1c6c0f4ce548fd83667468b356f42",
                "ef1d3c6a4e8a783cc0657b15a61703a5fa52d6d9",
                "ADR-025",
                "ADR-026",
                "non-authoritative",
                "runethread/core",
                "../LICENSING.md",
            )
            for token in required:
                if token not in text:
                    errors.append(f"architecture baseline missing bootstrap/governance reference token: {token}")

    return errors


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    errors = check_repository(root)
    if errors:
        for error in errors:
            print(f"policy error: {error}", file=sys.stderr)
        return 1
    print("hosted development policy: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
