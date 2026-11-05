"""module-auth BFF: opaque cookies and database-serialized refresh rotation."""
import hashlib
import re
import secrets
import time
from typing import Annotated
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import CheckConstraint, Float, JSON, String, Text, Uuid, select, text, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Mapped, mapped_column

from vetdietderm_api.db import Base, get_session_factory
from vetdietderm_api.settings import get_settings
from vetdietderm_api.owners.models import ClinicLink, JoinCode
from vetdietderm_api.owners.repository import freeze_clinic_link
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


class ClinicInviteTransfer(Base):
    """Recovery evidence only; never persist invite secrets or session credentials."""
    __tablename__ = "clinic_invite_transfers"
    __table_args__ = (CheckConstraint(
        "phase IN ('accepting', 'accepted', 'closing', 'closed', 'done')",
        name="ck_clinic_invite_transfers_phase"),)
    user_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    invite_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_id: Mapped[UUID] = mapped_column(Uuid)
    membership_ids: Mapped[list[str]] = mapped_column(JSON)
    destination_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    phase: Mapped[str] = mapped_column(String(16))


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


EMPTY_CLINIC_REFUSAL = (
    "В вашей клинике уже есть пациенты или владельцы. "
    "Приглашение нельзя принять, пока они остаются в этой клинике."
)
OWNER_REQUIRED = "Закрыть прежнюю клинику может только её владелец"
TRANSFER_RETRY = "Перенос клиники не завершён. Повторите запрос после восстановления доступа к клинике приглашения"


def check_empty_clinic(db, source: UUID | None, invitee: UUID) -> None:
    """Read-only refusal for a populated source clinic or this doctor's personal rows.

    Personal patients use the legacy author and null-tenant rule. Personal owners are
    those still unassigned and connected through this doctor's own join codes. Other
    people's null-tenant rows, templates, catalog items, and patient-less plans do not count.
    """
    from sqlalchemy import and_, func, or_
    from vetdietderm_api.owners.models import JoinCode, OwnerAccount
    from vetdietderm_api.patients.models import Patient

    personal_patients = and_(Patient.tenant_id.is_(None), Patient.created_by == invitee)
    patients = personal_patients if source is None else or_(Patient.tenant_id == source, personal_patients)
    code_scope = JoinCode.tenant_id.is_(None) if source is None else or_(
        JoinCode.tenant_id.is_(None), JoinCode.tenant_id == source)
    personal_owners = and_(
        OwnerAccount.tenant_id.is_(None),
        OwnerAccount.join_code_uuid.in_(select(JoinCode.uuid).where(
            JoinCode.doctor_user_id == invitee, code_scope)),
    )
    owners = personal_owners if source is None else or_(OwnerAccount.tenant_id == source, personal_owners)
    patient_count = db.scalar(select(func.count()).select_from(Patient).where(patients)) or 0
    owner_count = db.scalar(select(func.count()).select_from(OwnerAccount).where(owners)) or 0
    if patient_count or owner_count:
        raise HTTPException(409, EMPTY_CLINIC_REFUSAL)


def transfer_memberships(request: Request) -> dict[UUID, dict]:
    # Unlike /organizations or /me, this is the complete, current membership
    # list, independent of the access token's selected clinic (module-auth).
    try:
        payload = authenticated_call(request, "GET", "/me/organizations")
    except HTTPException as exc:
        if exc.status_code == 401:
            raise
        raise HTTPException(503, TRANSFER_RETRY) from exc
    try:
        return {UUID(item["organization_id"]): item for item in payload["organizations"]
                if item["status"] == "active"}
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(503, TRANSFER_RETRY) from exc


def clinic_invite_transfer(request: Request, profile: dict, body: dict | None = None):
    """Serialize one invitee's workflow, with commits at every remote boundary."""
    from vetdietderm_api.tenancy import move_empty_clinic

    user = UUID(profile["user_id"])
    token = (body or {}).get("token")
    fingerprint = hashlib.sha256(token.encode()).hexdigest() if isinstance(token, str) and token else None
    try:
        # Keep this transaction separate from progress commits and token rotation.
        # Share the provisioning lock so recovery cannot create a replacement clinic.
        with get_session_factory()() as guard, get_session_factory()() as db:
            if guard.get_bind().dialect.name == "postgresql":
                guard.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                              {"key": f"vetapp:clinic:{user}"})
            transfer = db.scalar(select(ClinicInviteTransfer).where(
                ClinicInviteTransfer.user_id == user, ClinicInviteTransfer.phase != "done").with_for_update())
            if transfer is None and fingerprint:
                transfer = db.get(ClinicInviteTransfer, (user, fingerprint))
            if transfer is None and body is None:
                return None
            if transfer is not None and transfer.phase == "done":
                return {"user_id": str(user), "email": profile["email"],
                        "display_name": profile.get("display_name"),
                        "org_role": transfer_memberships(request).get(transfer.destination_id, {}).get("org_role")}

            memberships = transfer_memberships(request)
            if transfer is None:
                if not fingerprint:
                    raise HTTPException(422, "Не указан токен приглашения")
                org = profile.get("organization") or {}
                source = UUID(org["org_id"]) if org.get("org_id") else None
                if source is None and memberships:
                    if len(memberships) != 1:
                        raise HTTPException(503, TRANSFER_RETRY)
                    source = next(iter(memberships))
                if source is None:
                    # No source clinic yet, but legacy personal patients and owners still refuse.
                    check_empty_clinic(db, None, user)
                    accepted = authenticated_call(request, "POST", "/invites/accept", {"token": token})
                    authenticated_call(request, "GET", "/me", force_refresh=True)
                    return accepted
                check_empty_clinic(db, source, user)
                if source not in memberships or (memberships[source]["org_role"] != "owner"
                                                  and profile.get("role") != "super_admin"):
                    raise HTTPException(409, OWNER_REQUIRED)
                transfer = ClinicInviteTransfer(user_id=user, invite_hash=fingerprint, source_id=source,
                                               membership_ids=sorted(map(str, memberships)), phase="accepting")
                db.add(transfer)
                db.commit()  # Durable before the invite can be consumed.
                try:
                    authenticated_call(request, "POST", "/invites/accept", {"token": token})
                except HTTPException as exc:
                    if exc.status_code in {400, 403, 404, 409, 422, 429}:
                        # These responses guarantee no membership was created.
                        db.delete(transfer)
                        db.commit()
                        raise
                    raise HTTPException(503, TRANSFER_RETRY) from exc
                transfer.phase = "accepted"
                db.commit()
                memberships = transfer_memberships(request)

            if transfer.destination_id is None:
                added = set(memberships) - {UUID(value) for value in transfer.membership_ids}
                if len(added) != 1:
                    raise HTTPException(503, TRANSFER_RETRY)
                transfer.destination_id = added.pop()
                transfer.phase = "accepted"
                db.commit()
            destination = transfer.destination_id
            if destination not in memberships or destination == transfer.source_id:
                raise HTTPException(503, TRANSFER_RETRY)

            if transfer.phase in {"accepted", "closing"}:
                check_empty_clinic(db, transfer.source_id, user)
                if transfer.source_id in memberships:
                    if (memberships[transfer.source_id]["org_role"] != "owner"
                            and profile.get("role") != "super_admin"):
                        raise HTTPException(409, OWNER_REQUIRED)
                    transfer.phase = "closing"
                    db.commit()  # A lost DELETE response can be reconciled on retry.
                    authenticated_call(request, "DELETE", f"/organizations/{transfer.source_id}")
                elif transfer.phase != "closing":
                    # Source access was lost before we attempted an authorized close.
                    raise HTTPException(503, TRANSFER_RETRY)
                memberships = transfer_memberships(request)
                if transfer.source_id in memberships or destination not in memberships:
                    raise HTTPException(503, TRANSFER_RETRY)
                transfer.phase = "closed"
                db.commit()

            refreshed = authenticated_call(request, "GET", "/me", force_refresh=True)
            # Recheck both current membership and selected context after rotation.
            memberships = transfer_memberships(request)
            org = refreshed.get("organization") or {}
            if (str(refreshed.get("user_id")) != str(user) or destination not in memberships
                    or org.get("org_id") != str(destination) or org.get("status") != "active"
                    or transfer.source_id in memberships):
                raise HTTPException(503, TRANSFER_RETRY)
            check_empty_clinic(db, transfer.source_id, user)
            move_empty_clinic(db, user, transfer.source_id, destination, commit=False)
            transfer.phase = "done"
            db.commit()  # Rows, source-resource cleanup and completion are atomic.
            return {"user_id": str(user), "email": refreshed["email"],
                    "display_name": refreshed.get("display_name"), "org_role": org["org_role"]}
    except SQLAlchemyError as exc:
        raise HTTPException(503, TRANSFER_RETRY) from exc


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
    if request.method == "POST" and path == "invites/accept":
        return accept_clinic_invite(request, body)
    result = require_user(request) if path == "me" and request.method == "GET" else authenticated_call(request, request.method, "/" + path, body)
    renamed = request.method == "PATCH" and re.fullmatch(r"organizations/[\w-]+", path)
    if (request.method == "POST" and path == "organizations") or renamed or (
        request.method in {"PATCH", "DELETE"} and "/members/" in path):
        authenticated_call(request, "GET", "/me", force_refresh=True)
    return result
