from __future__ import annotations

import subprocess
from pathlib import Path


def probe_audio_duration_sec(audio_path: Path) -> int:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(audio_path),
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        value = float(result.stdout.strip())
        return max(0, int(value))
    except (OSError, subprocess.SubprocessError, ValueError):
        return 0
