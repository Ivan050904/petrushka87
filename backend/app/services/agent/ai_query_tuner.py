from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

from app.core.config import settings
from app.services.agent.ai_queries import AI_TUNED_QUERY_COUNT, get_active_ai_query_source
from app.services.agent.ai_relevance import is_safe_ai_search_query
from app.services.agent.article_feedback import FeedbackProfile
from app.services.agent.llm import DigestLLMClient, check_ollama_health
from app.services.agent.state import save_ai_tuned_queries
from app.services.ai.base import AIUnavailableError

AI_QUERY_TUNER_PROMPT = """You tune DuckDuckGo search queries for a Russian-speaking reader interested in AI agents and AI-assisted development.
Articles should come from Habr (habr.com) when possible.

Return JSON only:
{{"queries":[{{"query":"DuckDuckGo query string with required site:habr.com filter"}}]}}

Rules:
- Return exactly {query_count} queries.
- Every query MUST contain site:habr.com.
- Focus on AI agents, autonomous agents, Cursor, Claude, Codex, GitHub Copilot, MCP, and agentic coding workflows.
- Avoid generic Python/React tutorials without AI agents, ads, and off-topic vendor spam.
- Learn from rejected articles: avoid similar topics, vendors, and article types.
- Queries may mix Russian and English terms.
- Do not repeat the exact same queries from the current set unless still optimal.

Current default topic examples:
{static_examples}

Rejected articles (do NOT recommend similar topics):
{rejected_examples}
"""


@dataclass(frozen=True)
class AiQueryTuneResult:
    status: str
    queries: list[str]
    message: str
    source: str


def _static_examples_text() -> str:
    return json.dumps(list(settings.digest_topics), ensure_ascii=False)


def _rejected_examples_text(profile: FeedbackProfile) -> str:
    if not profile.examples:
        return "- No rejections yet."
    compact = [
        {
            "title": item.title,
            "summary": item.summary[:240],
            "feedback": item.feedback,
            "query": item.query,
        }
        for item in profile.examples[:15]
    ]
    return json.dumps(compact, ensure_ascii=False)


def tune_ai_queries(feedback_profile: FeedbackProfile, *, user_id: uuid.UUID) -> AiQueryTuneResult:
    if len(feedback_profile.examples) < settings.ai_digest_tune_min_feedback:
        return AiQueryTuneResult(
            status="skipped",
            queries=[],
            message=(
                f"Need at least {settings.ai_digest_tune_min_feedback} rejected articles "
                "before tuning queries"
            ),
            source=get_active_ai_query_source(user_id),
        )

    if not check_ollama_health():
        return AiQueryTuneResult(
            status="unavailable",
            queries=[],
            message="Ollama is not reachable for query tuning",
            source=get_active_ai_query_source(user_id),
        )

    llm = DigestLLMClient()
    if not llm.is_configured():
        return AiQueryTuneResult(
            status="unavailable",
            queries=[],
            message="Digest LLM is not configured for query tuning",
            source=get_active_ai_query_source(user_id),
        )

    system_prompt = AI_QUERY_TUNER_PROMPT.format(
        query_count=AI_TUNED_QUERY_COUNT,
        static_examples=_static_examples_text(),
        rejected_examples=_rejected_examples_text(feedback_profile),
    )
    user_prompt = "Generate improved DuckDuckGo queries for Habr based on the rejection history."

    try:
        payload = llm.complete_json(system_prompt=system_prompt, user_prompt=user_prompt)
    except (AIUnavailableError, Exception) as exc:
        return AiQueryTuneResult(
            status="error",
            queries=[],
            message=str(exc) or exc.__class__.__name__,
            source=get_active_ai_query_source(user_id),
        )

    raw_queries = payload.get("queries")
    if not isinstance(raw_queries, list):
        return AiQueryTuneResult(
            status="error",
            queries=[],
            message="LLM response did not contain queries array",
            source=get_active_ai_query_source(user_id),
        )

    queries: list[str] = []
    seen: set[str] = set()
    for item in raw_queries:
        if not isinstance(item, dict):
            continue
        query = str(item.get("query") or "").strip()
        if not query or query in seen:
            continue
        if not is_safe_ai_search_query(query):
            continue
        seen.add(query)
        queries.append(query)
        if len(queries) >= AI_TUNED_QUERY_COUNT:
            break

    if len(queries) < AI_TUNED_QUERY_COUNT:
        return AiQueryTuneResult(
            status="error",
            queries=[],
            message="LLM returned invalid queries outside allowed Habr AI topics",
            source=get_active_ai_query_source(user_id),
        )

    save_ai_tuned_queries(user_id, queries)
    return AiQueryTuneResult(
        status="ok",
        queries=queries,
        message=f"Tuned {len(queries)} AI search queries",
        source="ollama",
    )
