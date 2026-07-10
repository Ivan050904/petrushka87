DIGEST_FILTER_PROMPT = """You curate a daily reading list about AI agents and AI-assisted development tools.
Return JSON only:
{"articles":[{"title":"article title","url":"https://...","summary_ru":"1-2 sentence summary in Russian","query":"search topic used"}]}
Rules:
- Keep only articles about AI agents, autonomous agents, or AI coding assistants.
- Prefer articles mentioning Cursor, Claude, Codex, GitHub Copilot, or similar agentic dev tools.
- Prefer Habr (habr.com) articles when quality is comparable.
- Remove duplicates, ads, low-quality posts, and off-topic results (generic Python/React tutorials without AI agents).
- Keep at most {max_articles} articles.
- summary_ru must be in Russian.
- url must come from the candidate list.
- title must be concise (<=160 chars).
"""
