"""Database session dependency shared by staff routers (owner cookie auth was removed)."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Response
from sqlalchemy.orm import Session

from vetdietderm_api.db import get_session_factory


def owner_db(response: Response) -> Iterator[Session]:
    response.headers["Cache-Control"] = "no-store"
    with get_session_factory()() as db:
        yield db


DB = Annotated[Session, Depends(owner_db)]
