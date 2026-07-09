"""Проверка распознавания речи: скачиваем короткое аудио и транскрибируем."""
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import os

os.environ["WHISPER_MODEL"] = "tiny"  # быстрая модель для теста

from transcription.config import settings
from transcription.pipeline import subtitles, transcribe

URL = sys.argv[1] if len(sys.argv) > 1 else "https://www.youtube.com/watch?v=aircAruvnKk"

print("Скачиваю аудио...")
audio = subtitles.download_audio(URL)
print("Аудио:", audio, "существует:", audio.exists())

clip = settings.tmp_path / "clip.mp3"
subprocess.run(
    ["ffmpeg", "-y", "-i", str(audio), "-t", "30", "-acodec", "copy", str(clip)],
    check=True,
    capture_output=True,
)
print("Обрезал до 30 сек:", clip.exists())

print("Распознаю (модель tiny)...")
text = transcribe.transcribe_audio(clip, lang="en")
print("Длина текста:", len(text))
print("Начало:", text[:300])

audio.unlink(missing_ok=True)
clip.unlink(missing_ok=True)
