from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.services.agent.article_feedback import FeedbackProfile
from app.services.agent.llm import DigestLLMClient, check_ollama_health
from app.services.agent.psych_queries import PSYCH_QUERY_BLOCKS, PsychQuerySelection
from app.services.agent.psych_relevance import PSYCH_TRUSTED_DOMAINS, is_safe_psych_search_query
from app.services.agent.state import load_digest_state, save_psych_tuned_queries
from app.services.ai.base import AIUnavailableError

PSYCH_QUERY_TUNER_PROMPT = """You tune DuckDuckGo search queries for psychology reading recommendations.
The reader prefers English articles about CBT, schema therapy, cognitive distortions, self-worth, ACT, and relationships.
Avoid clinical diagnosis content, forums, ads, and unrelated self-help spam.

Return JSON only:
{{"queries":[{{"tier":"guides|popsci|science","query":"English DuckDuckGo query with required site: filter"}}]}}

Rules:
- Return exactly 3 queries: one per tier (guides, popsci, science).
- Every query MUST contain one allowed site: filter: {allowed_domains}.
- Keep to CBT, self-worth/self-criticism, schema therapy, attachment/relationships, or ACT.
- Do not use filetype:pdf without an allowed site: filter.
- Learn from rejected articles: avoid similar topics and article types.
- Queries must be valid DuckDuckGo English search strings.
- Do not repeat the exact same queries from the current set unless still optimal.

Current static query examples by tier:
{static_examples}

Rejected articles (do NOT recommend similar topics):
{rejected_examples}
"""


@dataclass(frozen=True)
class PsychQueryTuneResult:
    status: str
    queries: list[str]
    message: str
    source: str


def _static_examples_text() -> str:
    lines: list[str] = []
    for tier, queries in PSYCH_QUERY_BLOCKS.items():
        sample = queries[:2]
        lines.append(f"- {tier}: {json.dumps(sample, ensure_ascii=False)}")
    return "\n".join(lines)


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


def _tuned_queries_fresh(state_tuned_at: str | None) -> bool:
    if not state_tuned_at:
        return False
    try:
        tuned_at = datetime.fromisoformat(state_tuned_at)
    except ValueError:
        return False
    if tuned_at.tzinfo is None:
        tuned_at = tuned_at.replace(tzinfo=UTC)
    max_age = timedelta(days=max(settings.psych_digest_tuned_queries_max_age_days, 1))
    return datetime.now(UTC) - tuned_at.astimezone(UTC) < max_age


def get_active_psych_query_source(user_id: uuid.UUID) -> str:
    state = load_digest_state(user_id, "psychology")
    if state.tuned_queries and _tuned_queries_fresh(state.tuned_at):
        return "ollama"
    if settings.psych_digest_queries:
        return "config"
    return "static"


def tune_psych_queries(feedback_profile: FeedbackProfile, *, user_id: uuid.UUID) -> PsychQueryTuneResult:
    if len(feedback_profile.examples) < settings.psych_digest_tune_min_feedback:
        return PsychQueryTuneResult(
            status="skipped",
            queries=[],
            message=(
                f"Need at least {settings.psych_digest_tune_min_feedback} rejected articles "
                "before tuning queries"
            ),
            source="static",
        )

    if not check_ollama_health():
        return PsychQueryTuneResult(
            status="unavailable",
            queries=[],
            message="Ollama is not reachable for query tuning",
            source=get_active_psych_query_source(user_id),
        )

    llm = DigestLLMClient()
    if not llm.is_configured():
        return PsychQueryTuneResult(
            status="unavailable",
            queries=[],
            message="Digest LLM is not configured for query tuning",
            source=get_active_psych_query_source(user_id),
        )

    system_prompt = PSYCH_QUERY_TUNER_PROMPT.format(
        allowed_domains=", ".join(sorted(PSYCH_TRUSTED_DOMAINS)),
        static_examples=_static_examples_text(),
        rejected_examples=_rejected_examples_text(feedback_profile),
    )
    user_prompt = "Generate 3 improved DuckDuckGo queries based on the rejection history."

    try:
        payload = llm.complete_json(system_prompt=system_prompt, user_prompt=user_prompt)
    except (AIUnavailableError, Exception) as exc:
        return PsychQueryTuneResult(
            status="error",
            queries=[],
            message=str(exc) or exc.__class__.__name__,
            source=get_active_psych_query_source(user_id),
        )

    raw_queries = payload.get("queries")
    if not isinstance(raw_queries, list):
        return PsychQueryTuneResult(
            status="error",
            queries=[],
            message="LLM response did not contain queries array",
            source=get_active_psych_query_source(user_id),
        )

    selections_by_tier: dict[str, PsychQuerySelection] = {}
    for item in raw_queries:
        if not isinstance(item, dict):
            continue
        query = str(item.get("query") or "").strip()
        tier = str(item.get("tier") or "custom").strip()
        if tier not in {"guides", "popsci", "science"}:
            continue
        if not is_safe_psych_search_query(query):
            continue
        selections_by_tier.setdefault(tier, PsychQuerySelection(query=query, tier=tier))

    if set(selections_by_tier) != {"guides", "popsci", "science"}:
        return PsychQueryTuneResult(
            status="error",
            queries=[],
            message="LLM returned invalid queries outside the allowed sources or topics",
            source=get_active_psych_query_source(user_id),
        )

    queries = [selections_by_tier[tier].query for tier in ("guides", "popsci", "science")]
    save_psych_tuned_queries(user_id, queries)
    return PsychQueryTuneResult(
        status="ok",
        queries=queries,
        message=f"Tuned {len(queries)} psychology search queries",
        source="ollama",
    )
