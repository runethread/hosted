#!/usr/bin/env python3
"""Fail-closed repository policy checks for runethread/hosted."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Iterable

REQUIRED_FILES = (
    "AGENTS.md",
    "README.md",
    "docs/ARCHITECTURE_BASELINE.md",
    "docs/ENGINEERING_PROCESS.md",
    "docs/DEVELOPMENT_PIPELINE.md",
    "docs/CURRENT_MILESTONE.md",
    ".gitattributes",
    ".gitignore",
    ".github/CODEOWNERS",
    ".github/dependabot.yml",
    ".github/pull_request_template.md",
    ".github/workflows/validate.yml",
    "scripts/check_development_policy.py",
    "scripts/check_development_policy_test.py",
)

ACTION_RE = re.compile(r"^\s*(?:-\s*)?uses:\s*([^\s@]+)@([^\s#]+)", re.MULTILINE)
FULL_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
WRITE_PERMISSION_RE = re.compile(r"^\s*[A-Za-z0-9_-]+:\s*write\s*(?:#.*)?$", re.MULTILINE)
MUTABLE_VERSION_PREFIXES = ("^", "~", "*", ">", "<", "=")
SECRET_NAMES = {".env", ".dev.vars"}
SECRET_SUFFIXES = {".pem", ".key", ".p12", ".pfx"}


def workflow_errors(text: str) -> list[str]:
    errors: list[str] = []
    if "pull_request_target" in text:
        errors.append("ordinary validation must not use pull_request_target")
    if "permissions:\n  contents: read" not in text:
        errors.append("workflow must declare repository-level contents: read")
    if "permissions: write-all" in text:
        errors.append("workflow must not request write-all")
    if WRITE_PERMISSION_RE.search(text):
        errors.append("validation workflow must not request write permission")
    if re.search(r"persist-credentials:\s*true", text):
        errors.append("checkout persist-credentials must not be true")
    if not re.search(r"^\s{2}validate:\s*$", text, re.MULTILINE):
        errors.append("workflow must retain a final job id named validate")
    for action, ref in ACTION_RE.findall(text):
        if not FULL_SHA_RE.fullmatch(ref):
            errors.append(f"Action {action}@{ref} is not pinned to a full commit SHA")
    return errors


def package_errors(package_path: Path, lock_path: Path) -> list[str]:
    errors: list[str] = []
    if package_path.exists() != lock_path.exists():
        errors.append("package.json and package-lock.json must be introduced/removed together")
        return errors
    if not package_path.exists():
        return errors

    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"cannot parse package.json: {exc}"]

    if package.get("private") is not True:
        errors.append("service package must set private: true")

    for section in ("dependencies", "devDependencies", "optionalDependencies"):
        values = package.get(section, {})
        if not isinstance(values, dict):
            errors.append(f"{section} must be an object")
            continue
        for name, version in values.items():
            if not isinstance(version, str) or not version:
                errors.append(f"{section}.{name} has invalid version")
                continue
            if version == "latest" or version.startswith(MUTABLE_VERSION_PREFIXES):
                errors.append(f"{section}.{name} must use an exact direct version, got {version!r}")
    return errors


def secret_path_errors(paths: Iterable[Path]) -> list[str]:
    errors: list[str] = []
    for path in paths:
        if not path.is_file():
            continue
        name = path.name
        if name in SECRET_NAMES or any(name.startswith(prefix + ".") for prefix in SECRET_NAMES):
            if name.endswith(".example"):
                continue
            errors.append(f"tracked/local secret file is forbidden: {path}")
        if path.suffix.lower() in SECRET_SUFFIXES:
            errors.append(f"private key/certificate material is forbidden in source: {path}")
    return errors


def crlf_errors(paths: Iterable[Path]) -> list[str]:
    errors: list[str] = []
    text_suffixes = {".md", ".py", ".yml", ".yaml", ".json", ".jsonc", ".ts", ".js", ".txt"}
    text_names = {".gitattributes", ".gitignore", ".editorconfig"}
    for path in paths:
        if not path.is_file() or (path.suffix.lower() not in text_suffixes and path.name not in text_names):
            continue
        try:
            data = path.read_bytes()
        except OSError as exc:
            errors.append(f"cannot read {path}: {exc}")
            continue
        if b"\r\n" in data:
            errors.append(f"CRLF is forbidden in project-controlled text: {path}")
    return errors


def check_repository(root: Path) -> list[str]:
    errors: list[str] = []
    for relative in REQUIRED_FILES:
        if not (root / relative).is_file():
            errors.append(f"required file missing: {relative}")

    workflows = sorted((root / ".github" / "workflows").glob("*.y*ml"))
    if not workflows:
        errors.append("at least one validation workflow is required")
    for workflow in workflows:
        try:
            errors.extend(f"{workflow.relative_to(root)}: {err}" for err in workflow_errors(workflow.read_text(encoding="utf-8")))
        except OSError as exc:
            errors.append(f"cannot read {workflow}: {exc}")

    errors.extend(package_errors(root / "package.json", root / "package-lock.json"))

    project_paths = [p for p in root.rglob("*") if ".git" not in p.parts]
    errors.extend(secret_path_errors(project_paths))
    errors.extend(crlf_errors(project_paths))

    baseline = root / "docs" / "ARCHITECTURE_BASELINE.md"
    if baseline.is_file():
        text = baseline.read_text(encoding="utf-8")
        required = (
            "22995a7cf7d1c6c0f4ce548fd83667468b356f42",
            "ef1d3c6a4e8a783cc0657b15a61703a5fa52d6d9",
            "ADR-025",
        )
        for token in required:
            if token not in text:
                errors.append(f"architecture baseline missing bootstrap authority token: {token}")

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
