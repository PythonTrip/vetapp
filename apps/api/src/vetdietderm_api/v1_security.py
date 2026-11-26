"""Staff identity gate for the versioned API."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, Security
from fastapi.security import APIKeyCookie

from vetdietderm_api import auth

staff_cookie = APIKeyCookie(name=auth.COOKIE, scheme_name="StaffSession", auto_error=False)


def csrf_marker(
    request: Request,
    marker: Annotated[str | None, Header(alias="X-Vetapp-CSRF",
        description="Send 1 on POST, PUT, PATCH and DELETE (including login/logout). Required by CSRF protection.")] = None,
) -> None:
    auth.csrf(request)


def staff_session(key: Annotated[str | None, Security(staff_cookie)]) -> None:
    if not key:
        raise HTTPException(401, "Войдите в аккаунт сотрудника")


def require_staff_identity(
    _session: Annotated[None, Depends(staff_session)],
    user: Annotated[dict, Depends(auth.require_user)],
) -> dict:
    return user
