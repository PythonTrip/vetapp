"""Owner identity dependencies and browser session lifecycle."""

import hashlib
import secrets
import time
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from vetdietderm_api.db import get_session_factory
from vetdietderm_api.owners.models import OwnerAccount, OwnerSession
from vetdietderm_api.settings import get_settings

COOKIE = "vetapp_owner_session"
SESSION_SECONDS = 30 * 24 * 3600


def owner_db(response: Response) -> Iterator[Session]:
    response.headers["Cache-Control"] = "no-store"
    with get_session_factory()() as db:
        yield db


DB = Annotated[Session, Depends(owner_db)]


def session_digest(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def require_owner(request: Request, db: DB) -> OwnerAccount:
    row = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
    if row is None or row.expires <= time.time():
        raise HTTPException(401, "Войдите в кабинет владельца")
    owner = db.get(OwnerAccount, row.owner_account_uuid)
    if owner is None:
        raise HTTPException(401, "Войдите в кабинет владельца")
    return owner


Owner = Annotated[OwnerAccount, Depends(require_owner)]


def create_session(db: Session, request: Request, response: Response, owner: OwnerAccount) -> None:
    old = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
    if old:
        db.delete(old)
    key = secrets.token_urlsafe(32)
    db.add(OwnerSession(key_hash=session_digest(key), owner_account_uuid=owner.uuid,
                        expires=time.time() + SESSION_SECONDS))
    db.commit()
    settings = get_settings()
    response.set_cookie(COOKIE, key, httponly=True, secure=settings.AUTH_COOKIE_SECURE,
                        samesite=getattr(settings, "OWNER_COOKIE_SAMESITE", "lax"), path="/", max_age=SESSION_SECONDS)


def end_session(request: Request, response: Response, db: Session) -> None:
    row = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
    if row:
        db.delete(row)
        db.commit()
    response.delete_cookie(COOKIE, path="/")
