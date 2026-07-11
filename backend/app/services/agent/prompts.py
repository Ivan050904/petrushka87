import json

DIGEST_FILTER_PROMPT = """You curate a daily reading list about AI agents and AI-assisted development tools.
Return JSON only:
{{"articles":[{{"title":"article title","url":"https://...","summary_ru":"1-2 sentence summary in Russian","query":"search topic used"}}]}}
Rules:
- Keep only articles about AI agents, autonomous agents, or AI coding assistants.
- Prefer articles mentioning Cursor, Claude, Codex, GitHub Copilot, or similar agentic dev tools.
- Prefer Habr (habr.com) articles when quality is comparable.
- Remove duplicates, ads, low-quality posts, and off-topic results (generic Python/React tutorials without AI agents).
- Keep at most {max_articles} articles.
- summary_ru must be in Russian.
- url must come from the candidate list.
- title must be concise (<=160 chars).
{feedback_section}
"""


def format_digest_feedback_section(
    *,
    off_topic_examples: list[dict[str, str]],
    disliked_examples: list[dict[str, str]],
) -> str:
    if not off_topic_examples and not disliked_examples:
        return "- No user rejections yet."

    lines = ["- User feedback: do NOT recommend articles similar to these rejected ones."]
    if off_topic_examples:
        lines.append("- Rejected because off-topic:")
        lines.append(json.dumps(off_topic_examples, ensure_ascii=False))
    if disliked_examples:
        lines.append("- Rejected because disliked:")
        lines.append(json.dumps(disliked_examples, ensure_ascii=False))
    lines.append("- Avoid similar topics, vendors, and article types.")
    return "\n".join(lines)


PSYCH_DIGEST_FILTER_PROMPT = """You curate psychology reading recommendations for a Russian-speaking lay reader.
The candidate articles are mostly in English. Your job is to pick the best ones and explain each in simple Russian.

Return JSON only:
{{"articles":[{{
  "title": "original English title (<=160 chars)",
  "title_ru": "Russian title for the reader",
  "url": "https://...",
  "summary_ru": "3-5 sentences in Russian explaining the article in plain language",
  "why_relevant": "one short sentence in Russian: why this is worth reading",
  "article_tier": "guides|popsci|science",
  "query": "search query used"
}}]}}

Rules:
- Keep CBT, schema therapy, cognitive distortions, self-worth, ACT, relationships, defense mechanisms, emotional patterns.
- Prefer reputable sources: apa.org, ncbi.nlm.nih.gov, psychologytoday.com, verywellmind.com, contextualscience.org.
- Reject forums, ads, unrelated self-help spam, pure product pages, and clinical diagnosis content.
- Do NOT invent URLs. url must come from the candidate list.
- summary_ru and why_relevant MUST be in Russian and understandable without reading English.
- article_tier must match the query tier when provided in candidate metadata.
- Keep at most {max_articles} articles.
{feedback_section}
"""


def format_psych_digest_feedback_section(
    *,
    off_topic_examples: list[dict[str, str]],
    disliked_examples: list[dict[str, str]],
) -> str:
    if not off_topic_examples and not disliked_examples:
        return "- No user rejections yet for psychology articles."

    lines = ["- User feedback: do NOT recommend articles similar to these rejected psychology items."]
    if off_topic_examples:
        lines.append("- Rejected because off-topic:")
        lines.append(json.dumps(off_topic_examples, ensure_ascii=False))
    if disliked_examples:
        lines.append("- Rejected because disliked:")
        lines.append(json.dumps(disliked_examples, ensure_ascii=False))
    lines.append("- Avoid similar topics and article types.")
    return "\n".join(lines)
