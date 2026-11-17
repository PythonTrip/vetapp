"""module-auth BFF: opaque cookies and database-serialized refresh rotation."""
import re
import time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from vetdietderm_api import auth_sessions, clinic_transfer
from vetdietderm_api.auth_client import checked, upstream
from vetdietderm_api.auth_models import BrowserSession, ClinicInviteTransfer as ClinicInviteTransfer
from vetdietderm_api.auth_sessions import COOKIE as COOKIE
from vetdietderm_api.clinic_transfer import EMPTY_CLINIC_REFUSAL as EMPTY_CLINIC_REFUSAL
from vetdietderm_api.clinic_transfer import OWNER_REQUIRED as OWNER_REQUIRED
from vetdietderm_api.clinic_transfer import TRANSFER_RETRY as TRANSFER_RETRY
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.settings import get_settings
from vetdietderm_api.owners.models import ClinicLink, JoinCode
from vetdietderm_api.owners.repository import freeze_clinic_link
from vetdietderm_api.account_schemas import UserProfileRead, OrganizationMembersRead, OrganizationInvitesRead

router = APIRouter(prefix="/auth-service", tags=["account"])


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


def authenticated_call(request: Request, method: str, path: str, body=None,
                       force_refresh: bool = False):
    return auth_sessions.authenticated_call(
        request, method, path, body, force_refresh, open_session=get_session_factory(), upstream=upstream,
    )


def ensure_clinic(request: Request, profile: dict) -> dict:
    """Create the doctor's single clinic when a verified profile has no organization."""
    if profile.get("organization"):
        return profile
    # Serialize provisioning across browser sessions and API processes.
    lock_key = f"vetapp:clinic:{profile['user_id']}"
    with get_session_factory()() as db:
        if db.get_bind().dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": lock_key})
        profile = authenticated_call(request, "GET", "/me")
        if profile.get("organization"):
            return profile
        display_name = profile.get("display_name")
        name = display_name if isinstance(display_name, str) and display_name else profile["email"]
        authenticated_call(request, "POST", "/organizations", {"name": name})
        return authenticated_call(request, "GET", "/me", force_refresh=True)


def require_user(request: Request) -> dict:
    csrf(request)
    # Authority validates the token and current membership. No unsigned JWT trust.
    profile = authenticated_call(request, "GET", "/me")
    if profile.get("account_status") != "active" or not profile.get("email_verified"):
        raise HTTPException(401, "Войдите в активный аккаунт")
    # Recover before provisioning a clinic or exposing clinical records. This also
    # works after re-login when an ambiguous refresh invalidated the old session.
    recovered = clinic_invite_transfer(request, profile)
    if recovered is not None:
        profile = authenticated_call(request, "GET", "/me")
    from vetdietderm_api.owners.repository import reserve_staff_email
    with get_session_factory()() as db:
        reserve_staff_email(db, profile["email"], profile["user_id"])
    profile = ensure_clinic(request, profile)
    request.state.user = profile
    return profile


def organization_members(request: Request) -> list[dict]:
    payload = authenticated_call(request, "GET", f"/organizations/{request.state.tenant_id}/members")
    members = payload.get("members") if isinstance(payload, dict) else payload
    if not isinstance(members, list):
        raise HTTPException(502, "Не удалось получить состав клиники")
    return members


def staff_access_tokens(session: Session) -> list[str]:
    now = time.time()
    return [token for token in session.scalars(select(BrowserSession.access_token).where(
        BrowserSession.expires > now, BrowserSession.access_expires > now)) if isinstance(token, str) and token]


def clinic_members(clinic_id: UUID, tokens: list[str]) -> list[dict]:
    """Read the clinic roster with staff access tokens already stored for the BFF.

    An owner request must not refresh or delete those sessions: refresh rotates a
    one-time token and can sign the clinician out. Unusable tokens are skipped.
    A missing roster is retryable and is not an empty questionnaire.
    """
    from vetdietderm_api.questionnaires.repository import PUBLICATION_RETRY

    if not tokens:
        raise HTTPException(503, PUBLICATION_RETRY)
    for token in tokens:
        try:
            response = upstream("GET", f"/organizations/{clinic_id}/members", token=token)
        except HTTPException as exc:
            raise HTTPException(503, PUBLICATION_RETRY) from exc
        if response.status_code in {401, 403, 404}:
            continue
        if response.status_code >= 400:
            raise HTTPException(503, PUBLICATION_RETRY)
        try:
            payload = response.json()
        except ValueError as exc:
            raise HTTPException(503, PUBLICATION_RETRY) from exc
        members = payload.get("members") if isinstance(payload, dict) else payload
        if not isinstance(members, list) or not members:
            raise HTTPException(503, PUBLICATION_RETRY)
        return members
    raise HTTPException(503, PUBLICATION_RETRY)


def clinic_invite_transfer(request: Request, profile: dict, body: dict | None = None):
    return clinic_transfer.clinic_invite_transfer(
        request, profile, body, get_session_factory=get_session_factory, authenticated_call=authenticated_call,
    )


def accept_clinic_invite(request: Request, body: dict | None):
    profile = authenticated_call(request, "GET", "/me")
    if profile.get("account_status") != "active" or not profile.get("email_verified"):
        raise HTTPException(401, "Войдите в активный аккаунт")
    return clinic_invite_transfer(request, profile, body or {})


def ensure_clinic_link(request: Request, user: dict) -> None:
    org = user["organization"]
    clinic_id = UUID(str(org["org_id"]))
    with get_session_factory()() as db:
        link = db.get(ClinicLink, clinic_id)
        if link is None:
            freeze_clinic_link(db, clinic_id, organization_members(request), user)
        else:
            db.execute(update(JoinCode).where(JoinCode.code == link.code,
                                             JoinCode.organization_name.is_distinct_from(org.get("name")))
                       .values(organization_name=org.get("name")))
            db.commit()


def require_clinical_access(request: Request, user: Annotated[dict, Depends(require_user)]) -> None:
    org = user.get("organization") or {}
    if org.get("status") != "active" or not org.get("org_id"):
        raise HTTPException(403, "Клиника недоступна")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        # Apply the same resource policy through the legacy and versioned adapters.
        path = request.url.path.removeprefix("/v1/staff")
        if path.startswith("/visit-questionnaires/") and org.get("org_role") not in {"owner", "admin"}:
            raise HTTPException(403, "Анкету клиники изменяют владелец и администратор")
        calculation = path.startswith("/assessments/")
        if org.get("org_role") not in {"owner", "admin", "member"} and not calculation:
            raise HTTPException(403, "Роль наблюдателя разрешает только просмотр")
        if path.startswith("/foods") and user.get("role") != "super_admin":
            raise HTTPException(403, "Общий каталог изменяет только администратор сервиса")

    from vetdietderm_api.tenancy import rehome_personal_rows
    with get_session_factory()() as db:
        rehome_personal_rows(db, user["user_id"], org["org_id"], organization_name=org.get("name"))
    request.state.tenant_id = org["org_id"]

    ensure_clinic_link(request, user)


@router.post("/auth/login", dependencies=[Depends(csrf)])
def login(request: Request, response: Response, body: dict):
    pair = checked(upstream("POST", "/auth/login", body))
    key = auth_sessions.start(request, pair, get_session_factory())
    settings = get_settings()
    response.set_cookie(COOKIE, key, httponly=True, secure=settings.AUTH_COOKIE_SECURE,
                        samesite=getattr(settings, "AUTH_COOKIE_SAMESITE", "lax"),
                        path="/", max_age=pair["refresh_token_expires_in"])
    response.headers["Cache-Control"] = "no-store"
    return {"ok": True}


@router.post("/auth/logout", dependencies=[Depends(csrf)])
def logout(request: Request, response: Response):
    if request.cookies.get(COOKIE):
        auth_sessions.end(request, get_session_factory(), upstream)
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
    if request.method == "POST" and path == "invites/accept":
        return accept_clinic_invite(request, body)
    result = require_user(request) if path == "me" and request.method == "GET" else authenticated_call(request, request.method, "/" + path, body)
    renamed = request.method == "PATCH" and re.fullmatch(r"organizations/[\w-]+", path)
    if (request.method == "POST" and path == "organizations") or renamed or (
        request.method in {"PATCH", "DELETE"} and "/members/" in path):
        authenticated_call(request, "GET", "/me", force_refresh=True)
    return result
