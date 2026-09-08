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
        for relative in ("package-lock.json", "worker-configuration.d.ts", ".github/workflows/validate.yml"):
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

    def test_generated_types_are_env_only(self) -> None:
        self.assertEqual(generated_types_errors(PROJECT_ROOT / "worker-configuration.d.ts"), [])
        text = (PROJECT_ROOT / "worker-configuration.d.ts").read_text(encoding="utf-8")
        self.assertIn("--include-runtime=false", text)
        self.assertNotIn("Copyright Microsoft", text)

    def test_generated_runtime_declaration_marker_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "worker-configuration.d.ts"
            path.write_text(
                (PROJECT_ROOT / "worker-configuration.d.ts").read_text(encoding="utf-8")
                + "\n// Runtime APIs\n// Copyright Microsoft\n",
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
            "LICENSING.md",
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

    def test_current_licensing_authority_and_dependency_metadata_pass(self) -> None:
        tracked = self._authority_paths()
        self.assertEqual(licensing_errors(PROJECT_ROOT, tracked), [])
        lock_text = (PROJECT_ROOT / "package-lock.json").read_text(encoding="utf-8")
        self.assertIsNotNone(LICENSE_VOCAB_RE.search(lock_text))

    def test_exact_legal_and_governance_bytes_are_locked(self) -> None:
        for relative in (
            "LICENSE",
            "LICENSE-MIT",
            "LICENSING.md",
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

    def test_unclassified_licensing_vocabulary_is_rejected_but_lock_metadata_is_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tracked = self._copy_authority(root)
            note = root / "notes.txt"
            note.write_text("Dual licensing policy.\n", encoding="utf-8")
            tracked.add("notes.txt")
            errors = licensing_errors(root, tracked)
            self.assertTrue(any("outside the exact reviewed Hosted licensing authority surfaces" in e for e in errors))
            self.assertFalse(any("package-lock.json contains licensing" in e for e in errors))

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
        self.assertEqual(git_blob_sha1(data), "e4acd67aa4ae51c7a46ade52b8b9850b48d5aacb")


if __name__ == "__main__":
    unittest.main()
