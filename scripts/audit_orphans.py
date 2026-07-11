#!/usr/bin/env python3
"""Find likely orphan TypeScript modules under frontend/src."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "frontend" / "src"
SKIP = {"node_modules", ".next"}


def all_ts_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if path.suffix not in {".ts", ".tsx"}:
            continue
        if any(p in SKIP for p in path.parts):
            continue
        if path.name.endswith(".test.ts") or path.name.endswith(".test.tsx"):
            continue
        files.append(path)
    return files


def import_targets(text: str) -> set[str]:
    targets: set[str] = set()
    for match in re.finditer(r"from ['\"](@/[^'\"]+|\./[^'\"]+|\.\./[^'\"]+)['\"]", text):
        targets.add(match.group(1))
    return targets


def resolve_import(source: Path, target: str) -> str | None:
    if target.startswith("@/"):
        rel = target[2:]
        base = ROOT / rel
    elif target.startswith("."):
        base = (source.parent / target).resolve()
        try:
            base = base.relative_to(ROOT.resolve())
        except ValueError:
            return None
        base = ROOT / base
    else:
        return None

    candidates = [
        base.with_suffix(".ts"),
        base.with_suffix(".tsx"),
        base / "index.ts",
        base / "index.tsx",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate.relative_to(ROOT).as_posix()
    return None


def main() -> None:
    files = all_ts_files()
    importers: dict[str, set[str]] = {f.relative_to(ROOT).as_posix(): set() for f in files}

    for path in files:
        text = path.read_text(encoding="utf-8", errors="replace")
        source_key = path.relative_to(ROOT).as_posix()
        for target in import_targets(text):
            resolved = resolve_import(path, target)
            if resolved and resolved in importers and resolved != source_key:
                importers[resolved].add(source_key)

    orphans = []
    skip_orphans = {"middleware.ts"}
    for key, refs in sorted(importers.items()):
        if not refs and not key.startswith("app/") and key not in skip_orphans:
            orphans.append(key)

    out = Path(__file__).resolve().parents[1] / "docs" / "audit" / "orphan-files.txt"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(orphans) + ("\n" if orphans else ""), encoding="utf-8")
    print(f"Orphans: {len(orphans)}")
    for line in orphans:
        print(line)


if __name__ == "__main__":
    main()
