"""module-auth BFF: opaque cookies and database-serialized refresh rotation."""
import hashlib
import re
import secrets
import time
from typing import Annotated
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import Float, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from vetdietderm_api.db import Base, get_session_factory
from vetdietderm_api.settings import get_settings
from vetdietderm_api.account_schemas import UserProfileRead, OrganizationMembersRead, OrganizationInvitesRead

COOKIE = "vetapp_session"
router = APIRouter(prefix="/auth-service", tags=["account"])


class BrowserSession(Base):
    __tablename__ = "browser_sessions"
    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str] = mapped_column(Text)
    access_expires: Mapped[float] = mapped_column(Float)
    expires: Mapped[float] = mapped_column(Float, index=True)


def csrf(request: Request) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    if request.headers.get("X-Vetapp-CSRF") != "1":
        raise HTTPException(403, "Отсутствует защита запроса")
    origin = request.headers.get("origin")
    settings = get_settings()
    allowed = getattr(settings, "client_origins", {
        settings.FRONTEND_URL.rstrip("/"), "http://localhost:3000", "http://127.0.0.1:3000",
    })
    if origin and origin.rstrip("/") not in allowed:
        raise HTTPException(403, "Недопустимый источник запроса")


def upstream(method: str, path: str, body=None, token: str | None = None) -> httpx.Response:
    headers = {"X-Request-ID": str(uuid4())}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        return httpx.request(method, get_settings().MODULE_AUTH_URL.rstrip("/") + path,
                             json=body, headers=headers, timeout=12, follow_redirects=False)
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Сервис пользователей временно недоступен") from exc


def checked(response: httpx.Response):
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", "Ошибка сервиса пользователей")
        except ValueError:
            detail = "Ошибка сервиса пользователей"
        raise HTTPException(response.status_code, detail)
    return response.json() if response.content else None


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


def authenticated_call(request: Request, method: str, path: str, body=None,
                       force_refresh: bool = False):
    # Canonical AuthClient lifecycle, adapted to a cross-process PostgreSQL lock.
    with get_session_factory()() as db:
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


def require_user(request: Request) -> dict:
    csrf(request)
    # Authority validates the token and current membership. No unsigned JWT trust.
    profile = authenticated_call(request, "GET", "/me")
    if profile.get("account_status") != "active" or not profile.get("email_verified"):
        raise HTTPException(401, "Войдите в активный аккаунт")
    from vetdietderm_api.owners.repository import reserve_staff_email
    with get_session_factory()() as db:
        reserve_staff_email(db, profile["email"], profile["user_id"])
    request.state.user = profile
    return profile


def require_clinical_access(request: Request, user: Annotated[dict, Depends(require_user)]) -> None:
    workspace = request.headers.get("X-Vetapp-Workspace", "personal")
    if workspace not in {"personal", "organization"}:
        raise HTTPException(400, "Неизвестное рабочее место")
    org = user.get("organization") if workspace == "organization" else None
    if workspace == "organization" and (not org or org.get("status") != "active"):
        raise HTTPException(403, "Организация недоступна. Выберите личное рабочее место")
    request.state.tenant_id = org["org_id"] if org else None
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        # Apply the same resource policy through the legacy and versioned adapters.
        path = request.url.path.removeprefix("/v1/staff")
        calculation = path.startswith("/assessments/")
        if org and org.get("org_role") not in {"owner", "admin", "member"} and not calculation:
            raise HTTPException(403, "Роль наблюдателя разрешает только просмотр")
        if path.startswith("/foods") and user.get("role") != "super_admin":
            raise HTTPException(403, "Общий каталог изменяет только администратор сервиса")


@router.post("/auth/login", dependencies=[Depends(csrf)])
def login(request: Request, response: Response, body: dict):
    pair = checked(upstream("POST", "/auth/login", body))
    key = secrets.token_urlsafe(32)
    with get_session_factory()() as db:
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
    settings = get_settings()
    response.set_cookie(COOKIE, key, httponly=True, secure=settings.AUTH_COOKIE_SECURE,
                        samesite=getattr(settings, "AUTH_COOKIE_SAMESITE", "lax"),
                        path="/", max_age=pair["refresh_token_expires_in"])
    response.headers["Cache-Control"] = "no-store"
    return {"ok": True}


@router.post("/auth/logout", dependencies=[Depends(csrf)])
def logout(request: Request, response: Response):
    if request.cookies.get(COOKIE):
        with get_session_factory()() as db:
            row = db.scalar(select(BrowserSession).where(
                BrowserSession.key_hash == session_hash(request)).with_for_update())
            if row:
                try:
                    upstream("POST", "/auth/logout", {"refresh_token": row.refresh_token})
                except HTTPException:
                    pass
                db.delete(row)
                db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


PUBLIC = {"auth/register", "auth/email/verify", "auth/email/resend-verification",
          "auth/password/forgot", "auth/password/reset"}
PROTECTED = re.compile(r"(?:me(?:/change-password|/sessions(?:/[\w-]+)?)?|"
                       r"organizations(?:/[\w-]+(?:/members(?:/[\w-]+)?|/invites(?:/[\w-]+)?)?)?|"
                       r"invites/accept)")


# Explicit read contracts precede the catch-all. Delegate to the same allowlist,
# session refresh and authorization flow; preserve upstream extension fields.
@router.get("/me", response_model=UserProfileRead, response_model_exclude_unset=True, dependencies=[Depends(csrf)])
def account_profile(request: Request, response: Response):
    return account_proxy("me", request, response)


@router.get("/organizations/{org_id}/members", response_model=OrganizationMembersRead,
            response_model_exclude_unset=True, dependencies=[Depends(csrf)])
def account_members(org_id: str, request: Request, response: Response):
    return account_proxy(f"organizations/{org_id}/members", request, response)


@router.get("/organizations/{org_id}/invites", response_model=OrganizationInvitesRead,
            response_model_exclude_unset=True, dependencies=[Depends(csrf)])
def account_invites(org_id: str, request: Request, response: Response):
    return account_proxy(f"organizations/{org_id}/invites", request, response)


@router.get("/{path:path}", operation_id="account_get", dependencies=[Depends(csrf)])
@router.post("/{path:path}", operation_id="account_post", dependencies=[Depends(csrf)])
@router.patch("/{path:path}", operation_id="account_patch", dependencies=[Depends(csrf)])
@router.delete("/{path:path}", operation_id="account_delete", dependencies=[Depends(csrf)])
def account_proxy(path: str, request: Request, response: Response, body: dict | None = None):
    response.headers["Cache-Control"] = "no-store"
    if path in PUBLIC and request.method == "POST":
        if path == "auth/register":
            from vetdietderm_api.owners.models import OwnerAccount
            from vetdietderm_api.owners.repository import TAKEN_EMAIL, normalize_email
            email = normalize_email(str((body or {}).get("email", "")))
            with get_session_factory()() as db:
                if db.scalar(select(OwnerAccount.uuid).where(OwnerAccount.email == email)):
                    raise HTTPException(409, TAKEN_EMAIL)
        result = upstream("POST", "/" + path, body)
        if path == "auth/register" and result.status_code == 409:
            from vetdietderm_api.owners.repository import TAKEN_EMAIL
            raise HTTPException(409, TAKEN_EMAIL)
        return checked(result)
    if path == "auth/refresh" and request.method == "POST":
        return authenticated_call(request, "GET", "/me", force_refresh=True)
    if not PROTECTED.fullmatch(path):
        raise HTTPException(404, "Не найдено")
    result = require_user(request) if path == "me" and request.method == "GET" else authenticated_call(request, request.method, "/" + path, body)
    if (request.method == "POST" and path in {"organizations", "invites/accept"}) or (
        request.method in {"PATCH", "DELETE"} and "/members/" in path):
        authenticated_call(request, "GET", "/me", force_refresh=True)
    return result
