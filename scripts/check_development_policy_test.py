#!/usr/bin/env python3
"""Negative/self-tests for the hosted development policy guard."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from check_development_policy import package_errors, secret_path_errors, workflow_errors


class WorkflowPolicyTests(unittest.TestCase):
    def test_full_sha_read_only_workflow_is_allowed(self) -> None:
        text = """permissions:\n  contents: read\njobs:\n  validate:\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n"""
        self.assertEqual(workflow_errors(text), [])

    def test_mutable_action_ref_is_rejected(self) -> None:
        text = """permissions:\n  contents: read\njobs:\n  validate:\n    steps:\n      - uses: actions/checkout@v7\n"""
        self.assertTrue(any("full commit SHA" in error for error in workflow_errors(text)))

    def test_pull_request_target_is_rejected(self) -> None:
        text = """on:\n  pull_request_target:\npermissions:\n  contents: read\njobs:\n  validate:\n    steps: []\n"""
        self.assertTrue(any("pull_request_target" in error for error in workflow_errors(text)))

    def test_write_permission_is_rejected(self) -> None:
        text = """permissions:\n  contents: write\njobs:\n  validate:\n    steps: []\n"""
        errors = workflow_errors(text)
        self.assertTrue(any("write permission" in error for error in errors))


class PackagePolicyTests(unittest.TestCase):
    def test_package_requires_lockfile(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "package.json").write_text('{"private": true}', encoding="utf-8")
            self.assertTrue(package_errors(root / "package.json", root / "package-lock.json"))

    def test_direct_versions_must_be_exact(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "package.json").write_text(
                json.dumps({"private": True, "devDependencies": {"wrangler": "^4.129.0"}}),
                encoding="utf-8",
            )
            (root / "package-lock.json").write_text("{}", encoding="utf-8")
            self.assertTrue(any("exact direct version" in error for error in package_errors(root / "package.json", root / "package-lock.json")))

    def test_private_exact_package_is_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "package.json").write_text(
                json.dumps({"private": True, "devDependencies": {"wrangler": "4.129.0"}}),
                encoding="utf-8",
            )
            (root / "package-lock.json").write_text("{}", encoding="utf-8")
            self.assertEqual(package_errors(root / "package.json", root / "package-lock.json"), [])


class SecretPathTests(unittest.TestCase):
    def test_secret_files_are_rejected_but_example_is_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            secret = root / ".dev.vars"
            example = root / ".env.example"
            secret.write_text("TOKEN=x", encoding="utf-8")
            example.write_text("TOKEN=", encoding="utf-8")
            errors = secret_path_errors([secret, example])
            self.assertEqual(len(errors), 1)
            self.assertIn(".dev.vars", errors[0])


if __name__ == "__main__":
    unittest.main()
