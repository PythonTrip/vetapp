"""Public Telegram webhook route."""

from typing import Annotated

from fastapi import APIRouter, Header, Request
from starlette.concurrency import run_in_threadpool

from vetdietderm_api.owners.clinic_bots import WEBHOOK_PATH
from vetdietderm_api.telegram.intake import receive_update

router = APIRouter(tags=["telegram"])


@router.post(
    WEBHOOK_PATH + "{integration_id}",
    responses={
        400: {"description": "Invalid JSON or update_id"},
        401: {"description": "Invalid Telegram webhook secret"},
        404: {"description": "Telegram integration not found"},
        503: {"description": "Telegram webhook intake is unavailable"},
    },
    openapi_extra={"requestBody": {
        "required": True,
        "content": {"application/json": {"schema": {
            "type": "object",
            "required": ["update_id"],
            "properties": {"update_id": {"type": "integer", "format": "int64"}},
            "additionalProperties": True,
        }}},
    }},
)
async def receive_webhook(
    request: Request,
    integration_id: str,
    secret: Annotated[str | None, Header(alias="X-Telegram-Bot-Api-Secret-Token")] = None,
) -> None:
    await run_in_threadpool(receive_update, integration_id, secret, await request.body())
