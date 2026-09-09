#!/usr/bin/env python3
"""Negative/self-tests for the Hosted development policy guard."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from check_development_policy import (
    EXPECTED_DEV_DEPENDENCIES,
    EXPECTED_SCRIPTS,
    LICENSE_VOCAB_RE,
    NPM_VERSION,
    NODE_VERSION,
    TOOLCHAIN_SURFACE_SHA256,
    TRACKED_FILES,
    generated_types_errors,
    git_blob_sha1,
    licensing_errors,
    package_errors,
    package_manifest_errors,
    parse_tracked_manifest,
    secret_path_errors,
    sha256_bytes,
    tracked_manifest_errors,
    workflow_errors,
    wrangler_errors,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str) -> str:
    count = text.count(old)
    if count != 1:
        raise AssertionError(f"expected exactly one mutation target, got {count}: {old!r}")
    return text.replace(old, new, 1)


class WorkflowPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workflow = (PROJECT_ROOT / ".github/workflows/validate.yml").read_text(encoding="utf-8")

    def test_exact_required_workflow_is_allowed(self) -> None:
        self.assertEqual(workflow_errors(self.workflow), [])

    def test_any_workflow_byte_mutation_is_rejected(self) -> None:
        mutations = {
            "write permission": replace_once(self.workflow, "permissions:\n  contents: read", "permissions:\n  contents: write"),
            "mutable setup-node": replace_once(
                self.workflow,
                "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
                "actions/setup-node@v7",
            ),
            "enable install scripts": replace_once(
                self.workflow,
                "npm ci --ignore-scripts --no-audit --no-fund",
                "npm ci --no-audit --no-fund",
            ),
            "weaken aggregate dependency": replace_once(
                self.workflow,
                "needs: [quality, toolchain]",
                "needs: [quality]",
            ),
            "remove Windows": replace_once(
                self.workflow,
                "os: [ubuntu-latest, macos-latest, windows-latest]",
                "os: [ubuntu-latest, macos-latest]",
            ),
        }
        for name, mutated in mutations.items():
            with self.subTest(name=name):
                self.assertTrue(workflow_errors(mutated))


class ManifestPolicyTests(unittest.TestCase):
    def test_exact_manifest_is_allowed(self) -> None:
        self.assertEqual(tracked_manifest_errors(set(TRACKED_FILES)), [])

    def test_unexpected_runtime_or_temporary_file_is_rejected(self) -> None:
        for relative in (
            ".github/workflows/materialize-generated-files.yml",
            "src/auth.ts",
            "src/publisher.ts",
            ".dev.vars",
            "dist/worker.js",
        ):
            with self.subTest(relative=relative):
                tracked = set(TRACKED_FILES) | {relative}
                self.assertTrue(any("unexpected tracked file" in e for e in tracked_manifest_errors(tracked)))

    def test_missing_required_surface_is_rejected(self) -> None:
        for relative in (
            "package-lock.json",
            "worker-configuration.d.ts",
            "LICENSE-APACHE-2.0",
            "THIRD_PARTY_NOTICES.md",
            ".github/workflows/validate.yml",
        ):
            with self.subTest(relative=relative):
                self.assertTrue(tracked_manifest_errors(set(TRACKED_FILES) - {relative}))


class PackagePolicyTests(unittest.TestCase):
    def _copy_pair(self, root: Path) -> tuple[Path, Path]:
        package = root / "package.json"
        lock = root / "package-lock.json"
        shutil.copyfile(PROJECT_ROOT / "package.json", package)
        shutil.copyfile(PROJECT_ROOT / "package-lock.json", lock)
        return package, lock

    def test_exact_package_and_lock_are_allowed(self) -> None:
        self.assertEqual(
            package_errors(PROJECT_ROOT / "package.json", PROJECT_ROOT / "package-lock.json"),
            [],
        )

    def test_package_requires_lockfile(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shutil.copyfile(PROJECT_ROOT / "package.json", root / "package.json")
            self.assertTrue(package_errors(root / "package.json", root / "package-lock.json"))

    def test_runtime_dependencies_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package, lock = self._copy_pair(root)
            data = json.loads(package.read_text(encoding="utf-8"))
            data["dependencies"] = {"example": "1.0.0"}
            package.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            self.assertTrue(any("dependencies" in e for e in package_errors(package, lock)))

    def test_deploy_script_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package, lock = self._copy_pair(root)
            data = json.loads(package.read_text(encoding="utf-8"))
            data["scripts"]["deploy"] = "wrangler deploy"
            package.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            self.assertTrue(any("scripts" in e for e in package_errors(package, lock)))

    def test_direct_version_range_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package, lock = self._copy_pair(root)
            data = json.loads(package.read_text(encoding="utf-8"))
            data["devDependencies"]["wrangler"] = "^4.129.1"
            package.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            errors = package_errors(package, lock)
            self.assertTrue(any("devDependencies" in e or "exact" in e for e in errors))

    def test_node_and_npm_identity_drift_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package, lock = self._copy_pair(root)
            data = json.loads(package.read_text(encoding="utf-8"))
            data["packageManager"] = "npm@99.0.0"
            data["engines"] = {"node": "99.0.0"}
            package.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            errors = package_errors(package, lock)
            self.assertTrue(any("packageManager" in e for e in errors))
            self.assertTrue(any("engines.node" in e for e in errors))

    def test_lockfile_nondev_package_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package, lock = self._copy_pair(root)
            data = json.loads(lock.read_text(encoding="utf-8"))
            key = next(k for k in data["packages"] if k)
            data["packages"][key]["dev"] = False
            lock.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            self.assertTrue(any("development-only" in e for e in package_errors(package, lock)))

    def test_lockfile_nonregistry_resolution_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package, lock = self._copy_pair(root)
            data = json.loads(lock.read_text(encoding="utf-8"))
            key = next(k for k in data["packages"] if k)
            data["packages"][key]["resolved"] = "https://example.invalid/pkg.tgz"
            lock.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            self.assertTrue(any("registry.npmjs.org" in e for e in package_errors(package, lock)))

    def test_package_and_lock_tracking_must_match(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._copy_pair(root)
            self.assertTrue(package_manifest_errors(root, {"package.json"}))
            self.assertTrue(package_manifest_errors(root, {"package-lock.json"}))

    def test_expected_identity_constants_match_manifest(self) -> None:
        package = json.loads((PROJECT_ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(package["devDependencies"], EXPECTED_DEV_DEPENDENCIES)
        self.assertEqual(package["scripts"], EXPECTED_SCRIPTS)
        self.assertEqual(package["engines"], {"node": NODE_VERSION})
        self.assertEqual(package["packageManager"], f"npm@{NPM_VERSION}")


class ToolchainSurfaceTests(unittest.TestCase):
    def test_exact_surface_hashes_match(self) -> None:
        for relative, digest in TOOLCHAIN_SURFACE_SHA256.items():
            with self.subTest(relative=relative):
                self.assertEqual(sha256_bytes((PROJECT_ROOT / relative).read_bytes()), digest)

    def test_wrangler_configuration_is_resource_free(self) -> None:
        self.assertEqual(wrangler_errors(PROJECT_ROOT / "wrangler.jsonc"), [])

    def test_wrangler_binding_or_workers_dev_drift_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "wrangler.jsonc"
            config = json.loads((PROJECT_ROOT / "wrangler.jsonc").read_text(encoding="utf-8"))
            config["workers_dev"] = True
            config["vars"] = {"TOKEN": "x"}
            path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
            self.assertTrue(wrangler_errors(path))

    def test_generated_types_include_compatibility_locked_runtime(self) -> None:
        self.assertEqual(generated_types_errors(PROJECT_ROOT / "worker-configuration.d.ts"), [])
        text = (PROJECT_ROOT / "worker-configuration.d.ts").read_text(encoding="utf-8")
        self.assertIn("Runtime types generated with workerd@", text)
        self.assertIn("cloudflare:workers", text)
        self.assertNotIn("--include-runtime=false", text)

    def test_missing_runtime_declaration_marker_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "worker-configuration.d.ts"
            text = (PROJECT_ROOT / "worker-configuration.d.ts").read_text(encoding="utf-8")
            path.write_text(
                replace_once(text, "// Begin runtime types", "// Runtime types omitted"),
                encoding="utf-8",
            )
            self.assertTrue(generated_types_errors(path))


class TrackedManifestParsingTests(unittest.TestCase):
    def test_regular_modes_are_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ("a.txt", "b.py"):
                (root / name).write_text("x", encoding="utf-8")
            raw = b"100644 " + b"a" * 40 + b" 0\ta.txt\0" + b"100755 " + b"b" * 40 + b" 0\tb.py\0"
            paths, errors = parse_tracked_manifest(raw, root)
            self.assertEqual(errors, [])
            self.assertEqual({p.name for p in paths}, {"a.txt", "b.py"})

    def test_symlink_gitlink_and_nonzero_stage_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "conflict.txt").write_text("x", encoding="utf-8")
            raw = (
                b"120000 " + b"a" * 40 + b" 0\tlink\0"
                + b"160000 " + b"b" * 40 + b" 0\tsubmodule\0"
                + b"100644 " + b"c" * 40 + b" 2\tconflict.txt\0"
            )
            _paths, errors = parse_tracked_manifest(raw, root)
            self.assertEqual(len(errors), 3)


class SecretPathTests(unittest.TestCase):
    def test_secret_files_are_case_insensitive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            paths = []
            for name in (".env", ".ENV", ".Env.local", ".dev.vars", ".DEV.VARS.prod"):
                path = root / name
                path.write_text("TOKEN=x", encoding="utf-8")
                paths.append(path)
            self.assertEqual(len(secret_path_errors(paths)), len(paths))

    def test_env_examples_are_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            paths = []
            for name in (".env.example", ".dev.vars.example", ".ENV.EXAMPLE"):
                path = root / name
                path.write_text("TOKEN=", encoding="utf-8")
                paths.append(path)
            self.assertEqual(secret_path_errors(paths), [])

    def test_private_key_names_and_suffixes_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            paths = []
            for name in ("id_rsa", "ID_ED25519", "service.PPK", "tls.PEM"):
                path = root / name
                path.write_text("x", encoding="utf-8")
                paths.append(path)
            self.assertEqual(len(secret_path_errors(paths)), len(paths))


@unittest.skipUnless((PROJECT_ROOT / "LICENSE").exists(), "full licensing fixture requires repository checkout")
class LicensingPolicyTests(unittest.TestCase):
    def _authority_paths(self) -> set[str]:
        return {
            "LICENSE",
            "LICENSE-MIT",
            "LICENSE-APACHE-2.0",
            "LICENSING.md",
            "THIRD_PARTY_NOTICES.md",
            "README.md",
            "AGENTS.md",
            "docs/CURRENT_MILESTONE.md",
            "docs/DEVELOPMENT_PIPELINE.md",
            "docs/ENGINEERING_PROCESS.md",
            "docs/ARCHITECTURE_BASELINE.md",
            ".github/pull_request_template.md",
            "package-lock.json",
        }

    def _copy_authority(self, root: Path) -> set[str]:
        tracked = self._authority_paths()
        for relative in tracked:
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(PROJECT_ROOT / relative, target)
        return set(tracked)

    def test_current_licensing_authority_and_admitted_third_party_distribution_pass(self) -> None:
        tracked = self._authority_paths() | {"worker-configuration.d.ts"}
        self.assertEqual(licensing_errors(PROJECT_ROOT, tracked), [])
        lock_text = (PROJECT_ROOT / "package-lock.json").read_text(encoding="utf-8")
        worker_types = (PROJECT_ROOT / "worker-configuration.d.ts").read_text(encoding="utf-8")
        self.assertIsNotNone(LICENSE_VOCAB_RE.search(lock_text))
        self.assertIn("Licensed under the Apache License, Version 2.0", worker_types)

    def test_exact_legal_and_governance_bytes_are_locked(self) -> None:
        for relative in (
            "LICENSE",
            "LICENSE-MIT",
            "LICENSE-APACHE-2.0",
            "LICENSING.md",
            "THIRD_PARTY_NOTICES.md",
            "README.md",
            "AGENTS.md",
            "docs/CURRENT_MILESTONE.md",
            "docs/DEVELOPMENT_PIPELINE.md",
            "docs/ENGINEERING_PROCESS.md",
            "docs/ARCHITECTURE_BASELINE.md",
            ".github/pull_request_template.md",
        ):
            with self.subTest(relative=relative), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                tracked = self._copy_authority(root)
                path = root / relative
                path.write_bytes(path.read_bytes() + b"\n")
                self.assertTrue(any(relative in e for e in licensing_errors(root, tracked)))

    def test_current_hosted_mit_claim_variants_are_rejected(self) -> None:
        claims = (
            "Runethread Hosted is " + "licensed under " + "MIT.",
            "Hosted source is " + "distributed under " + "MIT.",
            "This repository is " + "available under " + "MIT.",
            "Runethread Hosted uses the " + "MIT License.",
        )
        for claim in claims:
            with self.subTest(claim=claim), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                tracked = self._copy_authority(root)
                note = root / "NOTE"
                note.write_text(claim + "\n", encoding="utf-8")
                tracked.add("NOTE")
                self.assertTrue(any("stale/current MIT claim" in e for e in licensing_errors(root, tracked)))

    def test_unclassified_licensing_vocabulary_is_rejected_but_admitted_third_party_text_is_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tracked = self._copy_authority(root)
            generated = root / "worker-configuration.d.ts"
            generated.write_text(
                "Licensed under Apache-2.0. This generated declaration contains third-party rights notices.\n",
                encoding="utf-8",
            )
            tracked.add("worker-configuration.d.ts")
            note = root / "notes.txt"
            note.write_text("Dual licensing policy.\n", encoding="utf-8")
            tracked.add("notes.txt")
            errors = licensing_errors(root, tracked)
            self.assertTrue(any("outside the exact reviewed Hosted licensing authority surfaces" in e for e in errors))
            self.assertFalse(any("package-lock.json contains licensing" in e for e in errors))
            self.assertFalse(any("worker-configuration.d.ts contains licensing" in e for e in errors))

    def test_third_party_license_copy_is_required(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tracked = self._copy_authority(root)
            tracked.remove("LICENSE-APACHE-2.0")
            errors = licensing_errors(root, tracked)
            self.assertTrue(any("LICENSE-APACHE-2.0" in e for e in errors))

    def test_invalid_utf8_and_nul_are_rejected(self) -> None:
        for payload, expected in ((b"\xffopaque", "invalid UTF-8"), (b"opaque\x00data", "contains NUL bytes")):
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                tracked = self._copy_authority(root)
                path = root / "OPAQUE"
                path.write_bytes(payload)
                tracked.add("OPAQUE")
                self.assertTrue(any(expected in e for e in licensing_errors(root, tracked)))

    def test_git_blob_helper_matches_known_worker_types_blob(self) -> None:
        data = (PROJECT_ROOT / "worker-configuration.d.ts").read_bytes()
        self.assertEqual(git_blob_sha1(data), "9c6b72e232be65f6405baa77ffbb7b7515ade72d")


if __name__ == "__main__":
    unittest.main()


class ReleaseIdentityPolicyTests(unittest.TestCase):
    def _copy_surfaces(self, root: Path) -> set[str]:
        tracked = {"release/identity-policy.json", "scripts/release_identity.mjs"}
        for relative in tracked:
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(PROJECT_ROOT / relative, target)
        return tracked

    def test_exact_release_identity_policy_is_allowed(self) -> None:
        from check_development_policy import release_identity_errors
        self.assertEqual(release_identity_errors(PROJECT_ROOT, set(TRACKED_FILES)), [])

    def test_missing_release_identity_surface_is_rejected(self) -> None:
        from check_development_policy import release_identity_errors
        for missing in ("release/identity-policy.json", "scripts/release_identity.mjs"):
            with self.subTest(missing=missing):
                self.assertTrue(release_identity_errors(PROJECT_ROOT, set(TRACKED_FILES) - {missing}))

    def test_versioning_authority_and_authority_capability_drift_are_rejected(self) -> None:
        from check_development_policy import release_identity_errors
        mutations = (
            ("versioning", "scheme", "calendar"),
            ("versioning", "authority_git_commit", "0" * 40),
            ("versioning", "authority_git_blob", "0" * 40),
            ("versioning", "release_identifier_prefix", "x"),
            ("protocols", "hosted_api", "1"),
            ("capabilities", "publication", True),
        )
        for section, key, value in mutations:
            with self.subTest(section=section, key=key), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                tracked = self._copy_surfaces(root)
                policy_path = root / "release/identity-policy.json"
                policy = json.loads(policy_path.read_text(encoding="utf-8"))
                policy[section][key] = value
                policy_path.write_text(json.dumps(policy, indent=2) + "\n", encoding="utf-8")
                self.assertTrue(release_identity_errors(root, tracked))

    def test_publication_enable_is_rejected(self) -> None:
        from check_development_policy import release_identity_errors
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tracked = self._copy_surfaces(root)
            policy_path = root / "release/identity-policy.json"
            policy = json.loads(policy_path.read_text(encoding="utf-8"))
            policy["publication_enabled"] = True
            policy_path.write_text(json.dumps(policy, indent=2) + "\n", encoding="utf-8")
            self.assertTrue(release_identity_errors(root, tracked))

    def test_release_verifier_contains_semver_and_exact_manifest_boundaries(self) -> None:
        text = (PROJECT_ROOT / "scripts/release_identity.mjs").read_text(encoding="utf-8")
        for marker in (
            "SEMVER_2_0_0",
            "verifySemverImplementation",
            'release_identifier_prefix !== "v"',
            "semver: semverValue",
            "publication_enabled !== false",
            "--x-provision=false",
            "--x-auto-create=false",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, text)
