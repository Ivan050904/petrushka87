from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.entry import Entry
from app.models.user import User
from app.models.workout import ExerciseCatalog, PersonalRecord, WorkoutExercise, WorkoutSession
from app.schemas.workout import (
    ExerciseCatalogCreate,
    ExerciseCatalogRead,
    ExerciseCatalogUpdate,
    ExerciseProgressPoint,
    MuscleGroup,
    MuscleGroupProgressPoint,
    PersonalRecordCreate,
    PersonalRecordRead,
    WorkoutExerciseCreate,
    WorkoutExerciseRead,
    WorkoutSessionCreate,
    WorkoutSessionListResponse,
    WorkoutSessionRead,
    WorkoutSessionUpdate,
    WorkoutSet,
)
from app.services.workouts.analytics import exercise_progress_points, muscle_group_progress_points
from app.services.workouts.entry_sync import sync_entry_for_session
from app.services.embeddings.indexer import index_entry

router = APIRouter()


def _serialize_exercise(item: WorkoutExercise) -> WorkoutExerciseRead:
    return WorkoutExerciseRead(
        id=item.id,
        exercise_catalog_id=item.exercise_catalog_id,
        sets=[WorkoutSet.model_validate(s) for s in (item.sets or [])],
        exercise_name=item.exercise.name if item.exercise else None,
        muscle_group=MuscleGroup(item.exercise.muscle_group) if item.exercise else None,
    )


def _serialize_session(session: WorkoutSession) -> WorkoutSessionRead:
    return WorkoutSessionRead(
        id=session.id,
        date=session.date,
        body_weight=session.body_weight,
        mood=session.mood,
        muscle_readiness=session.muscle_readiness,
        sleep_quality=session.sleep_quality,
        general_fatigue=session.general_fatigue,
        created_at=session.created_at,
        updated_at=session.updated_at,
        exercises=[_serialize_exercise(item) for item in session.exercises],
    )


def _get_catalog_item(db: Session, user_id: uuid.UUID, catalog_id: uuid.UUID) -> ExerciseCatalog:
    item = db.get(ExerciseCatalog, catalog_id)
    if item is None or item.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return item


def _get_session(db: Session, user_id: uuid.UUID, session_id: uuid.UUID) -> WorkoutSession:
    statement = (
        select(WorkoutSession)
        .options(joinedload(WorkoutSession.exercises).joinedload(WorkoutExercise.exercise))
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
    )
    session = db.execute(statement).unique().scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout session not found")
    return session


def _validate_catalog_ids(db: Session, user_id: uuid.UUID, exercises: list[WorkoutExerciseCreate]) -> None:
    if not exercises:
        return
    ids = {item.exercise_catalog_id for item in exercises}
    statement = select(ExerciseCatalog.id).where(
        ExerciseCatalog.user_id == user_id,
        ExerciseCatalog.id.in_(ids),
    )
    found = set(db.execute(statement).scalars().all())
    if found != ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown exercise in catalog")


def _apply_exercises(session: WorkoutSession, exercises: list[WorkoutExerciseCreate]) -> None:
    session.exercises.clear()
    for item in exercises:
        session.exercises.append(
            WorkoutExercise(
                exercise_catalog_id=item.exercise_catalog_id,
                sets=[s.model_dump() for s in item.sets],
            )
        )


def _sync_session_entry(db: Session, session: WorkoutSession) -> None:
    entry = sync_entry_for_session(db, session)
    index_entry(db, entry)


@router.get("/catalog", response_model=list[ExerciseCatalogRead])
def list_catalog(
    muscle_group: MuscleGroup | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ExerciseCatalogRead]:
    statement = select(ExerciseCatalog).where(ExerciseCatalog.user_id == current_user.id)
    if muscle_group is not None:
        statement = statement.where(ExerciseCatalog.muscle_group == muscle_group.value)
    statement = statement.order_by(ExerciseCatalog.muscle_group, ExerciseCatalog.name)
    items = db.execute(statement).scalars().all()
    return [ExerciseCatalogRead.model_validate(item) for item in items]


@router.post("/catalog", response_model=ExerciseCatalogRead, status_code=status.HTTP_201_CREATED)
def create_catalog_item(
    payload: ExerciseCatalogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExerciseCatalogRead:
    existing = db.execute(
        select(ExerciseCatalog).where(
            ExerciseCatalog.user_id == current_user.id,
            ExerciseCatalog.name == payload.name.strip(),
            ExerciseCatalog.muscle_group == payload.muscle_group.value,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Exercise already exists")
    item = ExerciseCatalog(
        user_id=current_user.id,
        name=payload.name.strip(),
        muscle_group=payload.muscle_group.value,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return ExerciseCatalogRead.model_validate(item)


@router.get("/catalog/{catalog_id}", response_model=ExerciseCatalogRead)
def get_catalog_item(
    catalog_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExerciseCatalogRead:
    return ExerciseCatalogRead.model_validate(_get_catalog_item(db, current_user.id, catalog_id))


@router.patch("/catalog/{catalog_id}", response_model=ExerciseCatalogRead)
def update_catalog_item(
    catalog_id: uuid.UUID,
    payload: ExerciseCatalogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExerciseCatalogRead:
    item = _get_catalog_item(db, current_user.id, catalog_id)
    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.muscle_group is not None:
        item.muscle_group = payload.muscle_group.value
    db.commit()
    db.refresh(item)
    return ExerciseCatalogRead.model_validate(item)


@router.delete("/catalog/{catalog_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_catalog_item(
    catalog_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    item = _get_catalog_item(db, current_user.id, catalog_id)
    usage_count = db.scalar(
        select(func.count())
        .select_from(WorkoutExercise)
        .where(WorkoutExercise.exercise_catalog_id == catalog_id)
    )
    if usage_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete exercise used in workout sessions",
        )
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sessions", response_model=WorkoutSessionRead, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: WorkoutSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkoutSessionRead:
    _validate_catalog_ids(db, current_user.id, payload.exercises)
    session = WorkoutSession(
        user_id=current_user.id,
        date=payload.date or datetime.now(UTC),
        body_weight=payload.body_weight,
        mood=payload.mood,
        muscle_readiness=payload.muscle_readiness,
        sleep_quality=payload.sleep_quality,
        general_fatigue=payload.general_fatigue,
    )
    _apply_exercises(session, payload.exercises)
    db.add(session)
    db.commit()
    full_session = _get_session(db, current_user.id, session.id)
    _sync_session_entry(db, full_session)
    db.commit()
    return _serialize_session(full_session)


@router.get("/sessions", response_model=WorkoutSessionListResponse)
def list_sessions(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkoutSessionListResponse:
    filters = [WorkoutSession.user_id == current_user.id]
    if date_from is not None:
        filters.append(func.date(WorkoutSession.date) >= date_from)
    if date_to is not None:
        filters.append(func.date(WorkoutSession.date) <= date_to)

    total = db.execute(select(func.count()).select_from(WorkoutSession).where(*filters)).scalar_one()
    statement = (
        select(WorkoutSession)
        .options(joinedload(WorkoutSession.exercises).joinedload(WorkoutExercise.exercise))
        .where(*filters)
        .order_by(WorkoutSession.date.desc())
        .offset(offset)
        .limit(limit)
    )
    items = db.execute(statement).unique().scalars().all()
    return WorkoutSessionListResponse(
        items=[_serialize_session(item) for item in items],
        total=total,
    )


@router.get("/sessions/{session_id}", response_model=WorkoutSessionRead)
def get_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkoutSessionRead:
    return _serialize_session(_get_session(db, current_user.id, session_id))


@router.patch("/sessions/{session_id}", response_model=WorkoutSessionRead)
def update_session(
    session_id: uuid.UUID,
    payload: WorkoutSessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkoutSessionRead:
    session = _get_session(db, current_user.id, session_id)
    if payload.date is not None:
        session.date = payload.date
    if payload.body_weight is not None:
        session.body_weight = payload.body_weight
    if payload.mood is not None:
        session.mood = payload.mood
    if payload.muscle_readiness is not None:
        session.muscle_readiness = payload.muscle_readiness
    if payload.sleep_quality is not None:
        session.sleep_quality = payload.sleep_quality
    if payload.general_fatigue is not None:
        session.general_fatigue = payload.general_fatigue
    if payload.exercises is not None:
        _validate_catalog_ids(db, current_user.id, payload.exercises)
        _apply_exercises(session, payload.exercises)
    db.commit()
    full_session = _get_session(db, current_user.id, session_id)
    _sync_session_entry(db, full_session)
    db.commit()
    return _serialize_session(full_session)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    session = _get_session(db, current_user.id, session_id)
    if session.entry_id is not None:
        entry = db.get(Entry, session.entry_id)
        if entry is not None and entry.user_id == current_user.id:
            db.delete(entry)
    db.delete(session)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/records", response_model=list[PersonalRecordRead])
def list_records(
    exercise_catalog_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PersonalRecordRead]:
    statement = (
        select(PersonalRecord, ExerciseCatalog.name)
        .join(ExerciseCatalog, PersonalRecord.exercise_catalog_id == ExerciseCatalog.id)
        .where(PersonalRecord.user_id == current_user.id)
    )
    if exercise_catalog_id is not None:
        statement = statement.where(PersonalRecord.exercise_catalog_id == exercise_catalog_id)
    statement = statement.order_by(PersonalRecord.date.desc(), PersonalRecord.created_at.desc())
    rows = db.execute(statement).all()
    return [
        PersonalRecordRead(
            id=record.id,
            exercise_catalog_id=record.exercise_catalog_id,
            weight=record.weight,
            reps=record.reps,
            date=record.date,
            created_at=record.created_at,
            exercise_name=name,
        )
        for record, name in rows
    ]


@router.post("/records", response_model=PersonalRecordRead, status_code=status.HTTP_201_CREATED)
def create_record(
    payload: PersonalRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PersonalRecordRead:
    exercise = _get_catalog_item(db, current_user.id, payload.exercise_catalog_id)
    record = PersonalRecord(
        user_id=current_user.id,
        exercise_catalog_id=payload.exercise_catalog_id,
        weight=payload.weight,
        reps=payload.reps,
        date=payload.date,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return PersonalRecordRead(
        id=record.id,
        exercise_catalog_id=record.exercise_catalog_id,
        weight=record.weight,
        reps=record.reps,
        date=record.date,
        created_at=record.created_at,
        exercise_name=exercise.name,
    )


@router.get("/analytics/exercise/{catalog_id}", response_model=list[ExerciseProgressPoint])
def analytics_exercise(
    catalog_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ExerciseProgressPoint]:
    _get_catalog_item(db, current_user.id, catalog_id)
    statement = (
        select(WorkoutSession.date, WorkoutExercise.sets)
        .join(WorkoutExercise, WorkoutExercise.workout_id == WorkoutSession.id)
        .where(
            WorkoutSession.user_id == current_user.id,
            WorkoutExercise.exercise_catalog_id == catalog_id,
        )
        .order_by(WorkoutSession.date)
    )
    rows = [(session_date, sets) for session_date, sets in db.execute(statement).all()]
    return exercise_progress_points(rows)


@router.get("/analytics/muscle-group/{group}", response_model=list[MuscleGroupProgressPoint])
def analytics_muscle_group(
    group: MuscleGroup,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MuscleGroupProgressPoint]:
    statement = (
        select(WorkoutSession.date, WorkoutExercise.sets)
        .join(WorkoutExercise, WorkoutExercise.workout_id == WorkoutSession.id)
        .join(ExerciseCatalog, WorkoutExercise.exercise_catalog_id == ExerciseCatalog.id)
        .where(
            WorkoutSession.user_id == current_user.id,
            ExerciseCatalog.muscle_group == group.value,
        )
        .order_by(WorkoutSession.date)
    )
    rows_by_date: dict[date, list] = {}
    for session_date, sets in db.execute(statement).all():
        day = session_date.date() if isinstance(session_date, datetime) else session_date
        rows_by_date.setdefault(day, []).extend(sets or [])

    aggregated = [
        (datetime.combine(day, datetime.min.time()), sets)
        for day, sets in sorted(rows_by_date.items(), key=lambda item: item[0])
    ]
    return muscle_group_progress_points(aggregated)
