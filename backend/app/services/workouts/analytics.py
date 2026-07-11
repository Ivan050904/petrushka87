from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from uuid import UUID

from app.schemas.workout import (
    ExerciseProgressPoint,
    MuscleGroup,
    MuscleGroupProgressPoint,
    WorkoutSet,
)


def max_set_weight(sets: list[WorkoutSet] | list[dict]) -> float | None:
    weights: list[float] = []
    for item in sets:
        if isinstance(item, WorkoutSet):
            weights.append(item.weight)
        elif isinstance(item, dict) and "weight" in item:
            weights.append(float(item["weight"]))
    return max(weights) if weights else None


def exercise_progress_points(
    rows: list[tuple[datetime, list[WorkoutSet] | list[dict]]],
) -> list[ExerciseProgressPoint]:
    """Aggregate max weight per session date for one exercise."""
    by_date: dict[date, float] = {}
    for session_date, sets in rows:
        day = session_date.date() if isinstance(session_date, datetime) else session_date
        weight = max_set_weight(sets)
        if weight is None:
            continue
        by_date[day] = max(by_date.get(day, 0.0), weight)
    return [
        ExerciseProgressPoint(date=day, max_weight=weight)
        for day, weight in sorted(by_date.items(), key=lambda item: item[0])
    ]


def muscle_group_progress_points(
    rows: list[tuple[datetime, list[WorkoutSet] | list[dict]]],
) -> list[MuscleGroupProgressPoint]:
    """Aggregate max weight across all exercises in a muscle group per session date."""
    by_date: dict[date, float] = {}
    for session_date, sets in rows:
        day = session_date.date() if isinstance(session_date, datetime) else session_date
        weight = max_set_weight(sets)
        if weight is None:
            continue
        by_date[day] = max(by_date.get(day, 0.0), weight)
    return [
        MuscleGroupProgressPoint(date=day, max_weight=weight)
        for day, weight in sorted(by_date.items(), key=lambda item: item[0])
    ]


def aggregate_muscle_group_session_max(
    session_exercises: list[tuple[MuscleGroup | str, list[WorkoutSet] | list[dict]]],
) -> float | None:
    """Max set weight across all exercises in one session for a muscle group filter."""
    weights: list[float] = []
    for _group, sets in session_exercises:
        weight = max_set_weight(sets)
        if weight is not None:
            weights.append(weight)
    return max(weights) if weights else None


def group_exercises_by_session_date(
    rows: list[tuple[UUID, datetime, MuscleGroup | str, list[WorkoutSet] | list[dict]]],
    *,
    catalog_id: UUID | None = None,
    muscle_group: MuscleGroup | str | None = None,
) -> list[tuple[datetime, list[WorkoutSet] | list[dict]]]:
    """Filter workout exercise rows and group sets by session for analytics."""
    grouped: dict[date, list[list[WorkoutSet] | list[dict]]] = defaultdict(list)
    for row_catalog_id, session_date, row_group, sets in rows:
        if catalog_id is not None and row_catalog_id != catalog_id:
            continue
        if muscle_group is not None and row_group != muscle_group:
            continue
        day = session_date.date() if isinstance(session_date, datetime) else session_date
        grouped[day].append(sets)

    result: list[tuple[datetime, list[WorkoutSet] | list[dict]]] = []
    for day, sets_list in sorted(grouped.items(), key=lambda item: item[0]):
        if muscle_group is not None:
            # For muscle group: combine all sets from that day into one pseudo-list
            # Analytics uses max across all sets in the session
            combined: list[dict] = []
            for sets in sets_list:
                if isinstance(sets, list):
                    combined.extend(sets)
            result.append((datetime.combine(day, datetime.min.time()), combined))
        else:
            for sets in sets_list:
                result.append((datetime.combine(day, datetime.min.time()), sets))
    return result
