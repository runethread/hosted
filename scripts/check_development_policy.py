#!/usr/bin/env python3
"""Fail-closed repository policy checks for runethread/hosted."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterable

REQUIRED_FILES = (
    "AGENTS.md",
    "README.md",
    "LICENSE",
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    ".github/CODEOWNERS",
    ".github/dependabot.yml",
    ".github/pull_request_template.md",
    ".github/workflows/validate.yml",
    "docs/ARCHITECTURE_BASELINE.md",
    "docs/ENGINEERING_PROCESS.md",
    "docs/DEVELOPMENT_PIPELINE.md",
    "docs/CURRENT_MILESTONE.md",
    "scripts/check_development_policy.py",
    "scripts/check_development_policy_test.py",
)

BOOTSTRAP_WORKFLOWS = (".github/workflows/validate.yml",)
FULL_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
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
TEXT_NAMES = {".gitattributes", ".gitignore", ".editorconfig"}


def _active_yaml_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        if "\t" in raw:
            lines.append(raw.rstrip())
            continue
        code = raw.split("#", 1)[0].rstrip()
        if code.strip():
            lines.append(code)
    return lines


def _block_children(lines: list[str], index: int, indent: int) -> list[str]:
    children: list[str] = []
    for line in lines[index + 1 :]:
        if len(line) - len(line.lstrip(" ")) <= indent:
            break
        children.append(line)
    return children


def workflow_errors(text: str) -> list[str]:
    """Enforce the deliberately narrow dependency-free bootstrap workflow shape.

    This is not a general YAML parser. Security-sensitive YAML is required to
    stay in one canonical block style until a reviewed policy extension changes
    this guard.
    """

    errors: list[str] = []
    lines = _active_yaml_lines(text)

    if any("\t" in line for line in lines):
        errors.append("workflow must not contain tabs")

    if "pull_request_target" in text:
        errors.append("ordinary validation must not use pull_request_target")

    on_key = re.compile(r'(?<![A-Za-z0-9_-])(?:"on"|\'on\'|on)\s*:')
    on_lines = [(i, line) for i, line in enumerate(lines) if on_key.search(line)]
    if len(on_lines) != 1 or on_lines[0][1] != "on:":
        errors.append("workflow must use one canonical top-level on: block")
    else:
        trigger_children = _block_children(lines, on_lines[0][0], 0)
        if trigger_children != ["  push:", "  pull_request:"]:
            errors.append("bootstrap workflow must trigger canonically on push and pull_request only")

    permission_key = re.compile(r'(?:"permissions"|\'permissions\'|permissions)\s*:')
    permission_lines = [(i, line) for i, line in enumerate(lines) if permission_key.search(line)]
    if len(permission_lines) != 1 or permission_lines[0][1] != "permissions:":
        errors.append("workflow must declare one canonical top-level permissions block")
    else:
        permission_children = _block_children(lines, permission_lines[0][0], 0)
        if permission_children != ["  contents: read"]:
            errors.append("workflow permissions must be exactly repository-level contents: read")
    if re.search(r"\bwrite-all\b|:\s*write\b", "\n".join(lines)):
        errors.append("validation workflow must not request write permission")

    uses_key = re.compile(r'(?:"uses"|\'uses\'|uses)\s*:')
    canonical_uses = re.compile(
        r"^\s*(?:-\s*)?uses:\s*([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.\-/]+)?)@([0-9a-f]{40})$"
    )
    uses_lines = [line for line in lines if uses_key.search(line)]
    parsed_actions: list[tuple[str, str]] = []
    for line in uses_lines:
        match = canonical_uses.fullmatch(line)
        if match is None:
            errors.append(f"noncanonical or unpinned uses syntax is forbidden: {line.strip()}")
            continue
        action, ref = match.groups()
        if not FULL_SHA_RE.fullmatch(ref):
            errors.append(f"Action {action}@{ref} is not pinned to a full commit SHA")
            continue
        if action != "actions/checkout":
            errors.append(f"bootstrap workflow Action is not allowlisted: {action}")
            continue
        parsed_actions.append((action, ref))
    if len(parsed_actions) != 1:
        errors.append("bootstrap workflow must contain exactly one canonical actions/checkout step")

    persist_key = re.compile(r'(?:"persist-credentials"|\'persist-credentials\'|persist-credentials)\s*:')
    persist_lines = [line for line in lines if persist_key.search(line)]
    if persist_lines != ["          persist-credentials: false"]:
        errors.append("checkout must set exactly one canonical persist-credentials: false")

    fetch_depth_key = re.compile(r'(?:"fetch-depth"|\'fetch-depth\'|fetch-depth)\s*:')
    fetch_depth_lines = [line for line in lines if fetch_depth_key.search(line)]
    if fetch_depth_lines != ["          fetch-depth: 0"]:
        errors.append("checkout must set exactly one canonical fetch-depth: 0")

    with_lines = [(i, line) for i, line in enumerate(lines) if re.search(r'(?:"with"|\'with\'|with)\s*:', line)]
    if len(with_lines) != 1 or with_lines[0][1] != "        with:":
        errors.append("bootstrap checkout must use exactly one canonical with: block")
    else:
        with_children = _block_children(lines, with_lines[0][0], 8)
        if with_children != ["          fetch-depth: 0", "          persist-credentials: false"]:
            errors.append("checkout with: block must contain exactly fetch-depth: 0 and persist-credentials: false")

    normalized = "\n".join(lines)

    if sum(1 for line in lines if line == "jobs:") != 1:
        errors.append("workflow must contain exactly one canonical top-level jobs: block")
    if sum(1 for line in lines if line == "  quality:") != 1:
        errors.append("workflow must retain exactly one quality job")

    required_snippets = (
        'BASE_SHA: ${{ github.event.pull_request.base.sha }}',
        'git diff --check "$BASE_SHA"...HEAD',
        "git diff --check HEAD^ HEAD",
        "git diff-tree --check --root HEAD",
        "python3 -m py_compile scripts/check_development_policy.py scripts/check_development_policy_test.py",
        "python3 scripts/check_development_policy_test.py",
        "run: python3 scripts/check_development_policy.py",
        "  quality:",
        "  validate:",
        "    if: always()",
        "    needs: [quality]",
        'QUALITY_RESULT: ${{ needs.quality.result }}',
        'run: test "$QUALITY_RESULT" = "success"',
    )
    for snippet in required_snippets:
        if snippet not in normalized:
            errors.append(f"bootstrap validation invariant missing: {snippet}")

    if sum(1 for line in lines if line == "  validate:") != 1:
        errors.append("workflow must retain exactly one final job id named validate")

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
    try:
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"cannot parse package-lock.json: {exc}"]

    if not isinstance(package, dict):
        return ["package.json root must be an object"]
    if not isinstance(lock, dict):
        errors.append("package-lock.json root must be an object")

    if package.get("private") is not True:
        errors.append("service package must set private: true")

    for section in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
        values = package.get(section, {})
        if not isinstance(values, dict):
            errors.append(f"{section} must be an object")
            continue
        for name, version in values.items():
            if not isinstance(version, str) or EXACT_SEMVER_RE.fullmatch(version) is None:
                errors.append(f"{section}.{name} must use an exact SemVer version, got {version!r}")
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
        if not path.is_file():
            continue
        name = path.name
        lower_name = name.lower()

        is_env_secret = any(
            lower_name == prefix or lower_name.startswith(prefix + ".")
            for prefix in SECRET_NAMES
        )
        if is_env_secret and not lower_name.endswith(".example"):
            errors.append(f"tracked secret file is forbidden: {path}")

        if lower_name in PRIVATE_KEY_NAMES or path.suffix.lower() in SECRET_SUFFIXES:
            errors.append(f"private key/certificate material is forbidden in source: {path}")
    return errors


def crlf_errors(paths: Iterable[Path]) -> list[str]:
    errors: list[str] = []
    for path in paths:
        if not path.is_file() or (path.suffix.lower() not in TEXT_SUFFIXES and path.name not in TEXT_NAMES):
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

    project_paths, manifest_errors = tracked_regular_files(root)
    errors.extend(manifest_errors)
    tracked_relatives = {path.relative_to(root).as_posix() for path in project_paths}

    for relative in REQUIRED_FILES:
        if relative not in tracked_relatives:
            errors.append(f"required tracked file missing: {relative}")

    workflows = tuple(
        sorted(
            relative
            for relative in tracked_relatives
            if relative.startswith(".github/workflows/")
            and Path(relative).suffix.lower() in {".yml", ".yaml"}
        )
    )
    if workflows != BOOTSTRAP_WORKFLOWS:
        errors.append(
            "bootstrap workflow manifest must be exactly "
            f"{BOOTSTRAP_WORKFLOWS!r}, got {workflows!r}; extend policy deliberately before adding workflows"
        )

    for relative in workflows:
        workflow = root / relative
        try:
            text = workflow.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            errors.append(f"cannot read {relative}: {exc}")
            continue
        errors.extend(f"{relative}: {err}" for err in workflow_errors(text))

    package_path = root / "package.json"
    lock_path = root / "package-lock.json"
    if "package.json" in tracked_relatives or "package-lock.json" in tracked_relatives:
        errors.extend(package_errors(package_path, lock_path))
    elif package_path.exists() or lock_path.exists():
        errors.append("package.json/package-lock.json must not exist untracked")

    errors.extend(secret_path_errors(project_paths))
    errors.extend(crlf_errors(project_paths))

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
                "non-authoritative",
                "runethread/core",
            )
            for token in required:
                if token not in text:
                    errors.append(f"architecture baseline missing bootstrap reference token: {token}")

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
