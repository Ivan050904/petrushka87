"""Разбиение длинного текста на куски для map/reduce."""

CHUNK_CHARS = 3000


def split_text(text: str, size: int = CHUNK_CHARS) -> list[str]:
    words = text.split()
    chunks: list[str] = []
    current: list[str] = []
    length = 0
    for word in words:
        if length + len(word) + 1 > size and current:
            chunks.append(" ".join(current))
            current = []
            length = 0
        current.append(word)
        length += len(word) + 1
    if current:
        chunks.append(" ".join(current))
    return chunks
