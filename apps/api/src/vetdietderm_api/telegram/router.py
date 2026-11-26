"""Authenticate Telegram deliveries on the public integration route."""

from hmac import compare_digest
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy import select

from vetdietderm_api.db import get_session_factory
from vetdietderm_api.owners.bot_crypto import decrypt_credential
from vetdietderm_api.owners.clinic_bots import WEBHOOK_PATH
from vetdietderm_api.owners.models import ClinicBot
from vetdietderm_api.owners.schemas import ClinicBotStatus
from vetdietderm_api.settings import get_settings

router = APIRouter(tags=["telegram"])


@router.post(WEBHOOK_PATH + "{integration_id}")
def receive_webhook(
    integration_id: str,
    secret: Annotated[str | None, Header(alias="X-Telegram-Bot-Api-Secret-Token")] = None,
) -> None:
    try:
        integration = UUID(integration_id)
    except ValueError:
        raise HTTPException(404, "Telegram integration not found") from None
    with get_session_factory()() as db:
        row = db.scalar(select(ClinicBot).where(ClinicBot.integration_id == integration))
        if row is None:
            raise HTTPException(404, "Telegram integration not found")
        if not secret or row.status == ClinicBotStatus.disconnected:
            raise HTTPException(401, "Invalid Telegram webhook secret")
        expected = decrypt_credential(row.webhook_secret_ciphertext, get_settings().CLINIC_BOT_ENCRYPTION_KEY)
        if not expected or not compare_digest(expected.encode("utf-8"), secret.encode("utf-8")):
            raise HTTPException(401, "Invalid Telegram webhook secret")
    # Telegram retries the delivery until durable intake is available.
    raise HTTPException(503, "Telegram webhook intake is unavailable")
