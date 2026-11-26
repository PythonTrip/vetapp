"""Telegram Bot API helpers for clinic bot credentials and webhooks."""

import logging
from urllib.parse import urlsplit

import httpx

_TELEGRAM_HOST = "api.telegram.org"
_UNCONFIRMED = "Telegram не подтвердил токен"


class _HideBotRequestURLs(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not isinstance(record.args, tuple):
            return True
        return not any(isinstance(arg, httpx.URL) and arg.host == _TELEGRAM_HOST
                       and arg.path.startswith("/bot") for arg in record.args)


# HTTPX includes the request URL in its INFO-level request log.
logging.getLogger("httpx").addFilter(_HideBotRequestURLs())


def fetch_bot_identity(token: str) -> tuple[int, str] | str:
    """Call getMe. Return identity or Telegram's description for the caller to scrub.

    The token stays in the request path. This function never logs that URL and
    refuses a token that would change the host or the method.
    """
    payload = _call_bot_api(token, "getMe")
    identity = _accepted_bot(payload)
    return identity if identity is not None else _description(payload)


def get_webhook_info(token: str) -> str | None:
    """Return Telegram's webhook URL, or None if Telegram did not confirm it."""
    payload = _call_bot_api(token, "getWebhookInfo")
    if isinstance(payload, dict) and payload.get("ok") is True:
        result = payload.get("result")
        if isinstance(result, dict) and isinstance(result.get("url"), str):
            return result["url"]
    return None


def set_webhook(token: str, url: str, secret: str) -> bool:
    return _webhook_changed(_call_bot_api(token, "setWebhook", {
        "url": url,
        "secret_token": secret,
        "allowed_updates": ["message", "edited_message"],
    }))


def delete_webhook(token: str) -> bool:
    return _webhook_changed(_call_bot_api(token, "deleteWebhook", {}))


def _webhook_changed(payload: object) -> bool:
    return isinstance(payload, dict) and payload.get("ok") is True and payload.get("result") is True


def _call_bot_api(token: str, method: str, body: dict | None = None) -> object:
    url = _bot_api_url(token, method)
    if url is None:
        return None
    try:
        if body is None:
            response = httpx.get(url, timeout=10.0, follow_redirects=False)
        else:
            response = httpx.post(url, json=body, timeout=10.0, follow_redirects=False)
        return response.json()
    except (httpx.HTTPError, ValueError):
        return None


def _bot_api_url(token: str, method: str) -> str | None:
    if not token or any(ord(char) < 32 or char in "/\\?#@% " for char in token):
        return None
    path = f"/bot{token}/{method}"
    url = f"https://{_TELEGRAM_HOST}{path}"
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.hostname != _TELEGRAM_HOST or parts.username
            or parts.password or parts.port is not None or parts.query or parts.fragment
            or parts.path != path):
        return None
    return url


def _accepted_bot(payload: object) -> tuple[int, str] | None:
    if not isinstance(payload, dict) or payload.get("ok") is not True:
        return None
    result = payload.get("result")
    if not isinstance(result, dict):
        return None
    bot_id = result.get("id")
    username = result.get("username")
    if type(bot_id) is not int or not 0 < bot_id < 2**63:
        return None
    if not isinstance(username, str) or not username or len(username) > 64:
        return None
    return bot_id, username


def _description(payload: object) -> str:
    if isinstance(payload, dict):
        description = payload.get("description")
        if isinstance(description, str) and description.strip():
            # The caller also removes the current webhook secret before truncating.
            return description
    return _UNCONFIRMED
