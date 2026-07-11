from __future__ import annotations

from datetime import date, datetime

import pytest

from app.schemas.workout import WorkoutSet
from app.services.workouts.analytics import (
    exercise_progress_points,
    max_set_weight,
    muscle_group_progress_points,
)


def test_max_set_weight_empty():
    assert max_set_weight([]) is None


def test_max_set_weight_from_dicts():
    sets = [{"weight": 80, "reps": 10}, {"weight": 100, "reps": 5}]
    assert max_set_weight(sets) == 100


def test_max_set_weight_from_pydantic():
    sets = [WorkoutSet(weight=60, reps=12), WorkoutSet(weight=70, reps=8)]
    assert max_set_weight(sets) == 70


def test_exercise_progress_points_aggregates_by_date():
    rows = [
        (datetime(2026, 1, 10, 18, 0), [{"weight": 80, "reps": 10}]),
        (datetime(2026, 1, 10, 19, 0), [{"weight": 90, "reps": 8}]),
        (datetime(2026, 1, 15, 18, 0), [{"weight": 85, "reps": 10}]),
    ]
    points = exercise_progress_points(rows)
    assert len(points) == 2
    assert points[0].date == date(2026, 1, 10)
    assert points[0].max_weight == 90
    assert points[1].date == date(2026, 1, 15)
    assert points[1].max_weight == 85


def test_muscle_group_progress_points():
    rows = [
        (datetime(2026, 2, 1, 10, 0), [{"weight": 50, "reps": 10}, {"weight": 70, "reps": 8}]),
        (datetime(2026, 2, 8, 10, 0), [{"weight": 60, "reps": 10}]),
    ]
    points = muscle_group_progress_points(rows)
    assert len(points) == 2
    assert points[0].max_weight == 70
    assert points[1].max_weight == 60
