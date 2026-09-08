#!/usr/bin/env python3
"""Negative/self-tests for the hosted development policy guard."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from check_development_policy import (
    BOOTSTRAP_TRACKED_FILES,
    bootstrap_manifest_errors,
    licensing_errors,
    package_errors,
    package_manifest_errors,
    parse_tracked_manifest,
    secret_path_errors,
    workflow_errors,
)

CHECKOUT_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1"
PROJECT_ROOT = Path(__file__).resolve().parents[1]

VALID_WORKFLOW = f"""name: Validate Runethread Hosted

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  quality:
    name: quality
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@{CHECKOUT_SHA} # v7
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Check patch whitespace
        shell: bash
        env:
          BASE_SHA: ${{{{ github.event.pull_request.base.sha }}}}
        run: |
          set -euo pipefail
          if [ "$GITHUB_EVENT_NAME" = "pull_request" ]; then
            git diff --check "$BASE_SHA"...HEAD
          elif git rev-parse HEAD^ >/dev/null 2>&1; then
            git diff --check HEAD^ HEAD
          else
            git diff-tree --check --root HEAD
          fi

      - name: Test development policy guard
        run: |
          python3 -m py_compile scripts/check_development_policy.py scripts/check_development_policy_test.py
          python3 scripts/check_development_policy_test.py

      - name: Enforce development policy
        run: python3 scripts/check_development_policy.py

  validate:
    name: validate
    if: always()
    needs: [quality]
    runs-on: ubuntu-latest
    steps:
      - name: Require every validation gate
        env:
          QUALITY_RESULT: ${{{{ needs.quality.result }}}}
        run: test "$QUALITY_RESULT" = "success"
"""


def replace_once(text: str, old: str, new: str) -> str:
    count = text.count(old)
    if count != 1:
        raise AssertionError(f"expected exactly one mutation target, got {count}: {old!r}")
    return text.replace(old, new, 1)


class WorkflowPolicyTests(unittest.TestCase):
    def test_exact_bootstrap_workflow_is_allowed(self) -> None:
        self.assertEqual(workflow_errors(VALID_WORKFLOW), [])

    def test_any_executable_or_structural_mutation_is_rejected(self) -> None:
        mutations = {
            "mutable action": replace_once(VALID_WORKFLOW, f"actions/checkout@{CHECKOUT_SHA}", "actions/checkout@v7"),
            "quoted uses": replace_once(VALID_WORKFLOW, "        uses: actions/checkout@", '        "uses": actions/checkout@'),
            "unreviewed action": replace_once(VALID_WORKFLOW, "actions/checkout@", "actions/setup-node@"),
            "local action": replace_once(VALID_WORKFLOW, f"actions/checkout@{CHECKOUT_SHA}", "./.github/actions/local"),
            "pull request target": replace_once(VALID_WORKFLOW, "  pull_request:\n", "  pull_request_target:\n"),
            "write permissions": replace_once(VALID_WORKFLOW, "permissions:\n  contents: read", "permissions:\n  contents: read\n  issues: write"),
            "persist credentials": replace_once(VALID_WORKFLOW, "persist-credentials: false", "persist-credentials: true"),
            "shallow checkout": replace_once(VALID_WORKFLOW, "fetch-depth: 0", "fetch-depth: 1"),
            "self hosted quality": replace_once(VALID_WORKFLOW, "  quality:\n    name: quality\n    runs-on: ubuntu-latest", "  quality:\n    name: quality\n    runs-on: self-hosted"),
            "skip whitespace": replace_once(VALID_WORKFLOW, "          set -euo pipefail\n", "          exit 0\n          set -euo pipefail\n"),
            "skip policy tests": replace_once(VALID_WORKFLOW, "          python3 -m py_compile", "          exit 0\n          python3 -m py_compile"),
            "remove policy guard": replace_once(VALID_WORKFLOW, "      - name: Enforce development policy\n        run: python3 scripts/check_development_policy.py\n", ""),
            "weaken validate dependency": replace_once(VALID_WORKFLOW, "    needs: [quality]", "    needs: []"),
            "weaken validate result": replace_once(VALID_WORKFLOW, '        run: test "$QUALITY_RESULT" = "success"', "        run: true"),
        }
        for name, text in mutations.items():
            with self.subTest(name=name):
                self.assertTrue(workflow_errors(text))

    def test_substring_spoofing_does_not_restore_acceptance(self) -> None:
        text = replace_once(VALID_WORKFLOW, "    needs: [quality]", "    needs: []")
        text = replace_once(text, '        run: test "$QUALITY_RESULT" = "success"', "        run: true")
        text = replace_once(
            text,
            "          set -euo pipefail\n",
            "          set -euo pipefail\n"
            '          echo "    needs: [quality]" >/dev/null\n'
            "          echo 'run: test \\\"$QUALITY_RESULT\\\" = \\\"success\\\"' >/dev/null\n",
        )
        self.assertTrue(workflow_errors(text))

    def test_command_relocation_spoofing_does_not_restore_acceptance(self) -> None:
        text = replace_once(
            VALID_WORKFLOW,
            "      - name: Enforce development policy\n        run: python3 scripts/check_development_policy.py\n",
            "",
        )
        text = replace_once(
            text,
            "      - name: Test development policy guard\n",
            "      - name: Test development policy guard run: python3 scripts/check_development_policy.py\n",
        )
        self.assertTrue(workflow_errors(text))


class PackagePolicyTests(unittest.TestCase):
    def _errors_for(self, version: str) -> list[str]:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "package.json").write_text(json.dumps({"private": True, "devDependencies": {"wrangler": version}}), encoding="utf-8")
            (root / "package-lock.json").write_text("{}", encoding="utf-8")
            return package_errors(root / "package.json", root / "package-lock.json")

    def test_package_requires_lockfile(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "package.json").write_text('{"private": true}', encoding="utf-8")
            self.assertTrue(package_errors(root / "package.json", root / "package-lock.json"))

    def test_exact_semver_is_allowed(self) -> None:
        self.assertEqual(self._errors_for("4.129.0"), [])
        self.assertEqual(self._errors_for("4.129.0-rc.1+build.7"), [])

    def test_ranges_and_nonregistry_specifiers_are_rejected(self) -> None:
        for version in ("^4.129.0", "~4.129.0", "latest", "workspace:*", "file:../x", "1", "1.2", "1.2.3-01"):
            with self.subTest(version=version):
                self.assertTrue(self._errors_for(version))

    def test_invalid_lockfile_json_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "package.json").write_text('{"private": true}', encoding="utf-8")
            (root / "package-lock.json").write_text("{", encoding="utf-8")
            self.assertTrue(any("package-lock.json" in error for error in package_errors(root / "package.json", root / "package-lock.json")))

    def test_package_and_lock_must_share_membership(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "package.json").write_text('{"private": true}', encoding="utf-8")
            (root / "package-lock.json").write_text('{"lockfileVersion": 3}', encoding="utf-8")
            self.assertTrue(package_manifest_errors(root, {"package.json"}))
            self.assertTrue(package_manifest_errors(root, {"package-lock.json"}))


class BootstrapManifestPolicyTests(unittest.TestCase):
    def test_exact_manifest_is_allowed(self) -> None:
        self.assertEqual(bootstrap_manifest_errors(set(BOOTSTRAP_TRACKED_FILES)), [])

    def test_unexpected_runtime_and_provider_files_are_rejected(self) -> None:
        for relative in ("src/index.ts", "wrangler.jsonc", "src/worker.js", "package.json"):
            with self.subTest(relative=relative):
                tracked = set(BOOTSTRAP_TRACKED_FILES) | {relative}
                self.assertTrue(any("unexpected tracked file" in e for e in bootstrap_manifest_errors(tracked)))

    def test_licensing_files_are_required(self) -> None:
        for relative in ("LICENSE", "LICENSE-MIT", "LICENSING.md"):
            with self.subTest(relative=relative):
                tracked = set(BOOTSTRAP_TRACKED_FILES) - {relative}
                self.assertTrue(any(relative in e for e in bootstrap_manifest_errors(tracked)))


class TrackedManifestTests(unittest.TestCase):
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
            raw = b"120000 " + b"a" * 40 + b" 0\tlink\0" + b"160000 " + b"b" * 40 + b" 0\tsubmodule\0" + b"100644 " + b"c" * 40 + b" 2\tconflict.txt\0"
            _paths, errors = parse_tracked_manifest(raw, root)
            self.assertEqual(len(errors), 3)


class SecretPathTests(unittest.TestCase):
    def test_secret_files_are_case_insensitive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            paths = []
            for name in (".env", ".ENV", ".Env.local", ".dev.vars", ".DEV.VARS.prod", "id_rsa", "service.PPK"):
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


class LicensingPolicyTests(unittest.TestCase):
    def _copy_authority(self, root: Path) -> set[str]:
        needed = {"LICENSE", "LICENSE-MIT", "LICENSING.md", "README.md", "AGENTS.md", "docs/CURRENT_MILESTONE.md", "docs/DEVELOPMENT_PIPELINE.md", "docs/ENGINEERING_PROCESS.md"}
        for relative in needed:
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(PROJECT_ROOT / relative, target)
        return needed

    def test_current_licensing_authority_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tracked = self._copy_authority(root)
            self.assertEqual(licensing_errors(root, tracked), [])

    def test_exact_legal_and_policy_bytes_are_locked(self) -> None:
        for relative in ("LICENSE", "LICENSE-MIT", "LICENSING.md"):
            with self.subTest(relative=relative), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                tracked = self._copy_authority(root)
                path = root / relative
                path.write_bytes(path.read_bytes() + b"\n")
                self.assertTrue(any(relative in e and "sha256" in e for e in licensing_errors(root, tracked)))

    def test_current_hosted_mit_claim_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tracked = self._copy_authority(root)
            path = root / "README.md"
            stale_claim = "Runethread Hosted is " + "licensed under " + "MIT."
            path.write_text(path.read_text(encoding="utf-8") + "\n" + stale_claim + "\n", encoding="utf-8")
            self.assertTrue(any("stale/current MIT claim" in e for e in licensing_errors(root, tracked)))

    def test_missing_no_exception_marker_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tracked = self._copy_authority(root)
            path = root / "docs/ENGINEERING_PROCESS.md"
            text = path.read_text(encoding="utf-8")
            text = replace_once(text, "Hosted has no prospective MIT exception", "Hosted licensing boundary")
            path.write_text(text, encoding="utf-8")
            self.assertTrue(any("missing licensing invariant marker" in e for e in licensing_errors(root, tracked)))


if __name__ == "__main__":
    unittest.main()
