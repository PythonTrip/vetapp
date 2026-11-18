"""Durable recovery and membership checks for clinic invitations."""

import hashlib
from collections.abc import Callable
from typing import Protocol
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from vetdietderm_api.auth_models import ClinicInviteTransfer


class AuthenticatedCall(Protocol):
    def __call__(self, request: Request, method: str, path: str, body=None, force_refresh: bool = False): ...


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


def transfer_memberships(request: Request, authenticated_call: AuthenticatedCall) -> dict[UUID, dict]:
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


def clinic_invite_transfer(
    request: Request,
    profile: dict,
    body: dict | None,
    *,
    get_session_factory: Callable[[], sessionmaker[Session]],
    authenticated_call: AuthenticatedCall,
):
    """Serialize one invitee's workflow, with commits at every remote boundary."""
    from vetdietderm_api.tenancy import move_empty_clinic

    user = UUID(profile["user_id"])
    token = (body or {}).get("token")
    fingerprint = hashlib.sha256(token.encode()).hexdigest() if isinstance(token, str) and token else None
    try:
        # Keep this transaction separate from progress commits and token rotation.
        # Share the provisioning lock so recovery cannot create a replacement clinic.
        # Product reads have no invite body. One indexed lookup is enough when no
        # transfer is open; the advisory lock is taken only for real recovery.
        with get_session_factory()() as guard:
            postgresql = guard.get_bind().dialect.name == "postgresql"
            if postgresql and body is None and guard.scalar(select(ClinicInviteTransfer.user_id).where(
                ClinicInviteTransfer.user_id == user,
                ClinicInviteTransfer.phase != "done",
            )) is None:
                return None
            if postgresql:
                guard.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                              {"key": f"vetapp:clinic:{user}"})
            with get_session_factory()() as db:
                transfer = db.scalar(select(ClinicInviteTransfer).where(
                    ClinicInviteTransfer.user_id == user, ClinicInviteTransfer.phase != "done").with_for_update())
                if transfer is None and fingerprint:
                    transfer = db.get(ClinicInviteTransfer, (user, fingerprint))
                if transfer is None and body is None:
                    return None
                if transfer is not None and transfer.phase == "done":
                    return {"user_id": str(user), "email": profile["email"],
                            "display_name": profile.get("display_name"),
                            "org_role": transfer_memberships(request, authenticated_call).get(transfer.destination_id, {}).get("org_role")}

                memberships = transfer_memberships(request, authenticated_call)
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
                    memberships = transfer_memberships(request, authenticated_call)

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
                    memberships = transfer_memberships(request, authenticated_call)
                    if transfer.source_id in memberships or destination not in memberships:
                        raise HTTPException(503, TRANSFER_RETRY)
                    transfer.phase = "closed"
                    db.commit()

                refreshed = authenticated_call(request, "GET", "/me", force_refresh=True)
                # Recheck both current membership and selected context after rotation.
                memberships = transfer_memberships(request, authenticated_call)
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
