"""Opaque staff session storage and serialized token rotation."""

import hashlib
import secrets
import time
from collections.abc import Callable
from typing import Protocol

import httpx
from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from vetdietderm_api.auth_client import checked
from vetdietderm_api.auth_models import BrowserSession

COOKIE = "vetapp_session"


class AuthTransport(Protocol):
    def __call__(self, method: str, path: str, body=None, token: str | None = None) -> httpx.Response: ...


def store_pair(row: BrowserSession, pair: dict) -> None:
    row.access_token = pair["access_token"]
    row.refresh_token = pair["refresh_token"]
    row.access_expires = time.time() + pair["expires_in"]
    row.expires = time.time() + pair["refresh_token_expires_in"]


def session_hash(request: Request) -> str:
    key = request.cookies.get(COOKIE)
    if not key:
        raise HTTPException(401, "Войдите в аккаунт")
    return hashlib.sha256(key.encode()).hexdigest()


def authenticated_call(
    request: Request,
    method: str,
    path: str,
    body,
    force_refresh: bool,
    *,
    open_session: Callable[[], Session],
    upstream: AuthTransport,
):
    # Canonical AuthClient lifecycle, adapted to a cross-process PostgreSQL lock.
    with open_session() as db:
        row = db.scalar(select(BrowserSession).where(
            BrowserSession.key_hash == session_hash(request)).with_for_update())
        if row is None or row.expires <= time.time():
            raise HTTPException(401, "Сессия истекла. Войдите снова")

        def refresh():
            try:
                result = upstream("POST", "/auth/refresh", {"refresh_token": row.refresh_token})
            except HTTPException:
                # Timeout may have consumed the one-time token: never reuse it.
                db.delete(row)
                db.commit()
                raise
            if result.status_code == 401 or result.status_code >= 500:
                db.delete(row)
                db.commit()
                checked(result)
            store_pair(row, checked(result))

        refreshed = force_refresh or row.access_expires <= time.time() + 30
        if refreshed:
            refresh()
        try:
            result = upstream(method, path, body, row.access_token)
            if result.status_code == 401 and not refreshed:
                refresh()
                result = upstream(method, path, body, row.access_token)
            if result.status_code == 401:
                db.delete(row)
        finally:
            # Persist rotated tokens even if the subsequent protected call fails.
            db.commit()
        return checked(result)


def start(request: Request, pair: dict, open_session: Callable[[], Session]) -> str:
    key = secrets.token_urlsafe(32)
    with open_session() as db:
        old = request.cookies.get(COOKIE)
        if old:
            previous = db.scalar(select(BrowserSession).where(
                BrowserSession.key_hash == hashlib.sha256(old.encode()).hexdigest()).with_for_update())
            if previous:
                db.delete(previous)
        row = BrowserSession(key_hash=hashlib.sha256(key.encode()).hexdigest())
        store_pair(row, pair)
        db.add(row)
        db.commit()
    return key


def end(request: Request, open_session: Callable[[], Session], upstream: AuthTransport) -> None:
    with open_session() as db:
        row = db.scalar(select(BrowserSession).where(
            BrowserSession.key_hash == session_hash(request)).with_for_update())
        if row:
            try:
                upstream("POST", "/auth/logout", {"refresh_token": row.refresh_token})
            except HTTPException:
                pass
            db.delete(row)
            db.commit()
