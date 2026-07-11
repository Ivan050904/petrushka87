"""Collect repository metrics for Folio-One audit."""

from __future__ import annotations

import json
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {
    "node_modules",
    ".venv",
    ".next",
    "__pycache__",
    ".git",
    ".pytest_cache",
    "dist",
    "build",
}
CODE_EXTENSIONS = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".css": "css",
    ".html": "html",
    ".md": "markdown",
    ".json": "json",
    ".bat": "batch",
    ".ini": "ini",
    ".toml": "toml",
}
ZONE_PREFIXES = [
    ("backend/app", "backend_app"),
    ("backend/transcription", "transcription"),
    ("backend/tests", "backend_tests"),
    ("backend/scripts", "backend_scripts"),
    ("backend/alembic", "backend_alembic"),
    ("frontend/src", "frontend_src"),
    ("yt_trans", "yt_trans"),
    ("docs", "docs"),
    ("design-system", "design_system"),
    (".claude", "claude"),
]


def git_head() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return "unknown"


def should_skip(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def zone_for(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    for prefix, name in ZONE_PREFIXES:
        if rel.startswith(prefix):
            return name
    top = rel.split("/", 1)[0] if "/" in rel else rel
    return top or "root"


def analyze_file(path: Path) -> dict:
    ext = path.suffix.lower()
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {}

    lines = text.splitlines()
    blank = sum(1 for line in lines if not line.strip())
    comment = 0
    if ext == ".py":
        comment = sum(1 for line in lines if line.strip().startswith("#"))
    elif ext in {".ts", ".tsx", ".js", ".css"}:
        comment = sum(1 for line in lines if line.strip().startswith("//"))

    stats = {
        "total_lines": len(lines),
        "blank_lines": blank,
        "comment_lines": comment,
        "code_lines": max(0, len(lines) - blank - comment),
    }

    if ext == ".py":
        stats["functions"] = len(re.findall(r"^\s*def\s+\w+", text, re.MULTILINE))
        stats["classes"] = len(re.findall(r"^\s*class\s+\w+", text, re.MULTILINE))
    elif ext in {".ts", ".tsx"}:
        stats["functions"] = len(
            re.findall(
                r"(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+\w+|"
                r"(?:^|\n)\s*(?:export\s+)?const\s+\w+\s*=\s*(?:async\s*)?\(",
                text,
            )
        )
        stats["classes"] = len(re.findall(r"^\s*(?:export\s+)?class\s+\w+", text, re.MULTILINE))
        if ext == ".tsx":
            stats["components"] = len(
                re.findall(
                    r"export\s+(?:default\s+)?function\s+\w+|export\s+const\s+\w+\s*=",
                    text,
                )
            )

    if path.name.startswith("test_") and ext == ".py":
        stats["is_test"] = True
    if path.name.endswith(".test.ts") or path.name.endswith(".test.tsx"):
        stats["is_test"] = True

    return stats


def collect() -> dict:
    by_ext: dict[str, int] = defaultdict(int)
    by_zone: dict[str, dict] = defaultdict(
        lambda: {
            "files": 0,
            "total_lines": 0,
            "code_lines": 0,
            "blank_lines": 0,
            "comment_lines": 0,
            "functions": 0,
            "classes": 0,
            "components": 0,
            "test_files": 0,
        }
    )
    large_files: list[dict] = []

    for path in ROOT.rglob("*"):
        if not path.is_file() or should_skip(path):
            continue
        rel = path.relative_to(ROOT)
        if rel.parts and rel.parts[0] in SKIP_DIRS:
            continue

        ext = path.suffix.lower()
        size = path.stat().st_size
        if size > 100_000:
            large_files.append({"path": rel.as_posix(), "bytes": size})

        if ext in CODE_EXTENSIONS or ext in {".db", ".docx", ".pdf", ".png", ".lock"}:
            by_ext[ext or "no_ext"] += 1

        if ext not in CODE_EXTENSIONS:
            continue

        stats = analyze_file(path)
        if not stats:
            continue

        zone = zone_for(path)
        bucket = by_zone[zone]
        bucket["files"] += 1
        for key in ("total_lines", "code_lines", "blank_lines", "comment_lines", "functions", "classes", "components"):
            bucket[key] += stats.get(key, 0)
        if stats.get("is_test"):
            bucket["test_files"] += 1

    totals = {
        "files": sum(z["files"] for z in by_zone.values()),
        "total_lines": sum(z["total_lines"] for z in by_zone.values()),
        "code_lines": sum(z["code_lines"] for z in by_zone.values()),
        "functions": sum(z["functions"] for z in by_zone.values()),
        "classes": sum(z["classes"] for z in by_zone.values()),
        "components": sum(z["components"] for z in by_zone.values()),
        "test_files": sum(z["test_files"] for z in by_zone.values()),
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "commit": git_head(),
        "root": str(ROOT),
        "by_extension": dict(sorted(by_ext.items(), key=lambda x: -x[1])),
        "by_zone": dict(sorted(by_zone.items())),
        "totals": totals,
        "large_files_over_100kb": sorted(large_files, key=lambda x: -x["bytes"])[:50],
    }


def main() -> None:
    out_dir = ROOT / "docs" / "audit"
    out_dir.mkdir(parents=True, exist_ok=True)
    data = collect()
    out_path = out_dir / "metrics.json"
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path}")
    print(json.dumps(data["totals"], indent=2))


if __name__ == "__main__":
    main()
