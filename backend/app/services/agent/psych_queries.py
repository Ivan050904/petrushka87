from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.services.agent.state import load_digest_state

PSYCH_QUERY_BLOCKS: dict[str, list[str]] = {
    "guides": [
        '"thought record" site:nhs.uk/every-mind-matters',
        '"reframing unhelpful thoughts" site:nhs.uk/every-mind-matters',
        '"self help CBT techniques" site:nhs.uk/every-mind-matters',
        '"challenging unhelpful thoughts" site:nhs.uk/every-mind-matters',
        '"worry time" CBT site:nhs.uk/every-mind-matters',
    ],
    "popsci": [
        '"cognitive behavioural therapy" site:nhs.uk',
        '"self esteem" site:mind.org.uk/information-support',
        '"self criticism" site:mind.org.uk/information-support',
        '"boundaries" relationships site:mind.org.uk/information-support',
        '"attachment" relationships site:mind.org.uk/information-support',
        '"cognitive distortions" site:apa.org',
    ],
    "science": [
        '"schema therapy" systematic review site:pmc.ncbi.nlm.nih.gov',
        '"self-esteem" anxiety site:pmc.ncbi.nlm.nih.gov',
        'ACT "experiential avoidance" site:contextualscience.org',
        '"attachment" relationships site:pubmed.ncbi.nlm.nih.gov',
    ],
}


@dataclass(frozen=True)
class PsychQuerySelection:
    query: str
    tier: str


def _tuned_queries_fresh(tuned_at: str | None) -> bool:
    if not tuned_at:
        return False
    try:
        parsed = datetime.fromisoformat(tuned_at)
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    max_age = timedelta(days=max(settings.psych_digest_tuned_queries_max_age_days, 1))
    return datetime.now(UTC) - parsed.astimezone(UTC) < max_age


def _tuned_query_selections() -> list[PsychQuerySelection] | None:
    state = load_digest_state("psychology")
    if not state.tuned_queries or not _tuned_queries_fresh(state.tuned_at):
        return None
    tiers = ["guides", "popsci", "science"]
    selections: list[PsychQuerySelection] = []
    for index, query in enumerate(state.tuned_queries[:3]):
        tier = tiers[index] if index < len(tiers) else "custom"
        cleaned = query.strip()
        if cleaned:
            selections.append(PsychQuerySelection(query=cleaned, tier=tier))
    return selections or None


def configured_psych_queries() -> list[PsychQuerySelection]:
    override = [item.strip() for item in settings.psych_digest_queries if item.strip()]
    if override:
        return [PsychQuerySelection(query=item, tier="custom") for item in override]

    tuned = _tuned_query_selections()
    if tuned:
        return tuned

    return select_rotated_psych_queries()


def uses_configured_psych_queries(topics: list[str]) -> bool:
    override = [item.strip() for item in settings.psych_digest_queries if item.strip()]
    return bool(override) and topics == override


def select_rotated_psych_queries() -> list[PsychQuerySelection]:
    selections: list[PsychQuerySelection] = []
    for tier, queries in PSYCH_QUERY_BLOCKS.items():
        if queries:
            selections.append(PsychQuerySelection(query=random.choice(queries), tier=tier))
    return selections
