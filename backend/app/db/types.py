from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.types import CHAR, TypeDecorator


class GUID(TypeDecorator[uuid.UUID]):
    """Store UUID values as native UUID where available and strings elsewhere."""

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import UUID

            return dialect.type_descriptor(UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value: uuid.UUID | str | None, dialect: Any) -> uuid.UUID | str | None:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        return str(value if isinstance(value, uuid.UUID) else uuid.UUID(str(value)))

    def process_result_value(self, value: uuid.UUID | str | None, dialect: Any) -> uuid.UUID | None:
        if value is None:
            return None
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
