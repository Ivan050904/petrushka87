from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.agent.llm import DigestLLMClient, check_ollama_health


def main() -> int:
    print("Ollama reachable:", check_ollama_health())
    client = DigestLLMClient()
    print("Model:", client.model)
    result = client.complete_json(
        system_prompt='Return JSON only: {"ok": true, "message": "short test"}',
        user_prompt="ping",
    )
    print("LLM test:", result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
