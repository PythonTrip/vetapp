"""HTTP transport and response handling for module-auth."""

from uuid import uuid4

import httpx
from fastapi import HTTPException

from vetdietderm_api.settings import get_settings


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
