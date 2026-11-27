"""Authenticate Telegram deliveries and durably queue private updates."""

import json
from hmac import compare_digest
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from psycopg.errors import UniqueViolation
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from vetdietderm_api.db import get_session_factory
from vetdietderm_api.owners.bot_crypto import decrypt_credential
from vetdietderm_api.owners.models import ClinicBot
from vetdietderm_api.owners.schemas import ClinicBotStatus
from vetdietderm_api.settings import get_settings
from vetdietderm_api.telegram.models import BOT_UPDATE_UNIQUE_CONSTRAINT, TelegramUpdate


def _reject_json_constant(_value: str) -> None:
    raise ValueError("Invalid JSON constant")


def _private_update_kind(payload: dict[str, Any]) -> str | None:
    for kind in ("message", "edited_message"):
        message = payload.get(kind)
        if isinstance(message, dict):
            chat = message.get("chat")
            if isinstance(chat, dict) and chat.get("type") == "private":
                return kind
    return None


def _store_update(db: Session, integration_id: UUID, secret: str | None, body: bytes) -> None:
    # Hold the credential stable through the insert while allowing concurrent deliveries.
    row = db.scalar(select(ClinicBot).where(ClinicBot.integration_id == integration_id).with_for_update(read=True))
    if row is None:
        raise HTTPException(404, "Telegram integration not found")
    if not secret or row.status == ClinicBotStatus.disconnected or row.bot_id is None:
        raise HTTPException(401, "Invalid Telegram webhook secret")
    expected = decrypt_credential(row.webhook_secret_ciphertext, get_settings().CLINIC_BOT_ENCRYPTION_KEY)
    if not expected or not compare_digest(expected.encode("utf-8"), secret.encode("utf-8")):
        raise HTTPException(401, "Invalid Telegram webhook secret")

    try:
        payload = json.loads(body, parse_constant=_reject_json_constant)
    except (ValueError, RecursionError):
        raise HTTPException(400, "Invalid Telegram update JSON") from None
    update_id = payload.get("update_id") if isinstance(payload, dict) else None
    if type(update_id) is not int or not -(2**63) <= update_id < 2**63:
        raise HTTPException(400, "Invalid or missing Telegram update_id")
    kind = _private_update_kind(payload)
    if kind is None:
        return

    db.add(TelegramUpdate(
        clinic_id=row.clinic_id,
        integration_id=row.integration_id,
        bot_id=row.bot_id,
        update_id=update_id,
        update_kind=kind,
        payload=payload,
    ))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if not isinstance(exc.orig, UniqueViolation) or exc.orig.diag.constraint_name != BOT_UPDATE_UNIQUE_CONSTRAINT:
            raise


def receive_update(integration_id: str, secret: str | None, body: bytes) -> None:
    try:
        integration = UUID(integration_id)
    except ValueError:
        raise HTTPException(404, "Telegram integration not found") from None
    try:
        with get_session_factory()() as db:
            _store_update(db, integration, secret, body)
    except SQLAlchemyError:
        # SQLAlchemy errors can carry bound parameters, including the update payload.
        raise HTTPException(503, "Telegram webhook intake is unavailable") from None
