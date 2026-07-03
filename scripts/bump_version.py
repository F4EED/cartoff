#!/usr/bin/env python3
"""Met à jour version.json (semver, hash git, date). Appelé par le hook pre-commit."""

import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "version.json"


def git_short_hash() -> str:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0:
            return r.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return "unknown"


def git_commit_count() -> int:
    try:
        r = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0:
            return int(r.stdout.strip())
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    return 0


def parse_version(v: str) -> tuple[int, int, int]:
    parts = v.strip().split(".")
    if len(parts) != 3:
        raise ValueError(f"Version semver invalide : {v}")
    return int(parts[0]), int(parts[1]), int(parts[2])


def format_version(major: int, minor: int, patch: int) -> str:
    return f"{major}.{minor}.{patch}"


def bump(current: str, level: str) -> str:
    major, minor, patch = parse_version(current)
    if level == "major":
        return format_version(major + 1, 0, 0)
    if level == "minor":
        return format_version(major, minor + 1, 0)
    return format_version(major, minor, patch + 1)


def load_or_default() -> dict:
    if VERSION_FILE.is_file():
        return json.loads(VERSION_FILE.read_text(encoding="utf-8"))
    count = git_commit_count()
    patch = count if count > 0 else 0
    return {
        "version": f"1.0.{patch}",
        "commit": git_short_hash(),
        "date": date.today().isoformat(),
        "build": date.today().isoformat(),
    }


def write_version(data: dict) -> None:
    VERSION_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    init_only = "--init" in sys.argv
    data = load_or_default()

    if not init_only:
        level = os.environ.get("BUMP", "patch").lower()
        if level not in ("patch", "minor", "major"):
            level = "patch"
        data["version"] = bump(data["version"], level)

    data["commit"] = git_short_hash()
    data["date"] = date.today().isoformat()
    data["build"] = date.today().isoformat()

    write_version(data)
    print(f"version.json -> v{data['version']} ({data['commit']}, {data['date']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
