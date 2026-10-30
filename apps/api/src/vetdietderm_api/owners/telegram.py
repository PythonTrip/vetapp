"""Telegram bot-backend validation. Never use client-decoded identity fields."""
import hashlib
import hmac
import json
import re
import time
from urllib.parse import parse_qsl

from fastapi import HTTPException


def validate_init_data(raw: str, bot_token: str | None, max_age: int, *, now: float | None = None) -> tuple[str, str, float]:
    if not bot_token:
        raise HTTPException(503, "Вход через Telegram пока не настроен")
    invalid = HTTPException(401, "Данные Telegram недействительны или устарели. Откройте Mini App заново")
    try:
        if not raw or len(raw) > 16384 or re.search(r"%(?![0-9a-fA-F]{2})", raw):
            raise ValueError()
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=True, encoding="utf-8", errors="strict", max_num_fields=32)
        fields = dict(pairs)
        if len(fields) != len(pairs) or any(not k or "\n" in k or "\r" in k for k in fields):
            raise ValueError()
        received = fields.pop("hash")
        if not re.fullmatch(r"[0-9a-fA-F]{64}", received):
            raise ValueError()
        # The bot-token HMAC includes signature when present. Only hash is excluded.
        check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
        secret = hmac.digest(b"WebAppData", bot_token.encode(), "sha256")
        if not hmac.compare_digest(hmac.digest(secret, check.encode(), "sha256"), bytes.fromhex(received)):
            raise ValueError()
        stamp = fields["auth_date"]
        if not re.fullmatch(r"[0-9]{1,12}", stamp):
            raise ValueError()
        issued = int(stamp)
        current = time.time() if now is None else now
        if issued > current + 30 or current - issued > max_age:
            raise ValueError()
        user = json.loads(fields["user"])
        identity = user["id"]
        if type(identity) is not int or not 0 < identity < 2**52 or user.get("is_bot", False):
            raise ValueError()
    except (ValueError, KeyError, TypeError, AttributeError, UnicodeError, RecursionError) as exc:
        raise invalid from exc
    # Canonical signed digest, independent of query ordering or percent encoding.
    return str(identity), received.lower(), issued + max_age
