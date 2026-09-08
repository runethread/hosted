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

BOOTSTRAP_TRACKED_FILES = (
    "AGENTS.md",
    "README.md",
    "LICENSE",
    "LICENSE-MIT",
    "LICENSING.md",
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
BOOTSTRAP_WORKFLOW_SHA256 = "52119d9fe135ff770243ae375bc16aa696b765106632ae2728857ca6e477823f"
PERIMETER_LICENSE_SHA256 = "bb1d1de338bdbe282f151bf54d6bb6ad98ad37b9592539461fb51ff4bcd4e1c3"
HISTORICAL_MIT_LICENSE_SHA256 = "273538c6ad97c94dc4230b1b66211a1ebf2769d86fa0bc93cbe2d6670eca88bd"
LICENSING_POLICY_SHA256 = "4e9fb83f34164b15ab9114e615b8a651c72c49cafb0a54e26d787d1825923db7"

LICENSING_REQUIRED_MARKERS = {
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
        "Hosted has **no prospective MIT exception**",
        "Core's exact MIT interoperability boundary does not automatically extend into Hosted",
        "no runtime/provider/toolchain file is admitted",
    ),
    "docs/DEVELOPMENT_PIPELINE.md": (
        "ADR-026 is the accepted project licensing/commercial-model decision",
        "Hosted has **no prospective MIT exception**",
        "user-authored memories/projects/imports/attachments/data remain outside Runethread's software-license grants",
    ),
    "docs/ENGINEERING_PROCESS.md": (
        "ADR-026 settles the Hosted licensing/commercial model",
        "Hosted has no prospective MIT exception",
        "`LICENSING.md` is the current Hosted licensing authority",
    ),
}

CURRENT_MIT_CLAIM_RE = re.compile(
    r"\b(?:runethread\s+hosted|hosted(?:\s+(?:implementation|source|material))?|this\s+repository)"
    r"\s+(?:is|are|remains?)\s+(?:currently\s+)?(?:licensed\s+under\s+)?(?:the\s+)?MIT\b",
    re.IGNORECASE,
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
TEXT_NAMES = {".gitattributes", ".gitignore", ".editorconfig", "LICENSE", "LICENSE-MIT"}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def workflow_errors(text: str) -> list[str]:
    digest = sha256_bytes(text.encode("utf-8"))
    if digest != BOOTSTRAP_WORKFLOW_SHA256:
        return [
            "bootstrap workflow must match the exact reviewed contract: "
            f"expected sha256 {BOOTSTRAP_WORKFLOW_SHA256}, got {digest}"
        ]
    return []


def bootstrap_manifest_errors(tracked_relatives: set[str]) -> list[str]:
    errors: list[str] = []
    expected = set(BOOTSTRAP_TRACKED_FILES)
    for relative in sorted(expected - tracked_relatives):
        errors.append(f"required bootstrap tracked file missing: {relative}")
    for relative in sorted(tracked_relatives - expected):
        errors.append(
            f"unexpected tracked file during dependency-free pre-runtime gate: {relative}; "
            "extend the reviewed manifest only after the licensing/toolchain gate permits it"
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
        name = path.name
        lower_name = name.lower()
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
        "LICENSING.md": LICENSING_POLICY_SHA256,
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
            errors.append(f"{relative} must match exact reviewed licensing bytes: expected sha256 {expected}, got {actual}")

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

    for relative in sorted(tracked_relatives):
        if relative == "LICENSE-MIT":
            continue
        path = root / relative
        if path.suffix.lower() not in TEXT_SUFFIXES and path.name not in TEXT_NAMES:
            continue
        text, read_error = _read_utf8(path)
        if read_error is not None or text is None:
            errors.append(f"cannot scan licensing claims in {relative}: {read_error}")
            continue
        if CURRENT_MIT_CLAIM_RE.search(text):
            errors.append(f"{relative} makes a stale/current MIT claim for Hosted; historical MIT belongs only to the historical-grant context")
    return errors


def check_repository(root: Path) -> list[str]:
    errors: list[str] = []
    project_paths, manifest_errors = tracked_regular_files(root)
    errors.extend(manifest_errors)
    tracked_relatives = {path.relative_to(root).as_posix() for path in project_paths}
    errors.extend(bootstrap_manifest_errors(tracked_relatives))
    workflows = tuple(sorted(relative for relative in tracked_relatives if relative.startswith(".github/workflows/") and Path(relative).suffix.lower() in {".yml", ".yaml"}))
    if workflows != BOOTSTRAP_WORKFLOWS:
        errors.append("bootstrap workflow manifest must be exactly " f"{BOOTSTRAP_WORKFLOWS!r}, got {workflows!r}; extend policy deliberately before adding workflows")
    for relative in workflows:
        workflow = root / relative
        try:
            text = workflow.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            errors.append(f"cannot read {relative}: {exc}")
            continue
        errors.extend(f"{relative}: {err}" for err in workflow_errors(text))
    errors.extend(package_manifest_errors(root, tracked_relatives))
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
            required = ("22995a7cf7d1c6c0f4ce548fd83667468b356f42", "ef1d3c6a4e8a783cc0657b15a61703a5fa52d6d9", "ADR-025", "non-authoritative", "runethread/core")
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
