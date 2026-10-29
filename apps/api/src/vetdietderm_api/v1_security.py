"""Independent identity gates; neither accepts credentials from the other realm."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, Security
from fastapi.security import APIKeyCookie

from vetdietderm_api import auth
from vetdietderm_api.owners import router as owners

staff_cookie = APIKeyCookie(name=auth.COOKIE, scheme_name="StaffSession", auto_error=False)
owner_cookie = APIKeyCookie(name=owners.COOKIE, scheme_name="OwnerSession", auto_error=False)


def csrf_marker(
    request: Request,
    marker: Annotated[str | None, Header(alias="X-Vetapp-CSRF",
        description="Send 1 on POST, PUT, PATCH and DELETE (including login/logout). Required by CSRF protection.")] = None,
) -> None:
    auth.csrf(request)


def staff_session(key: Annotated[str | None, Security(staff_cookie)]) -> None:
    if not key:
        raise HTTPException(401, "Войдите в аккаунт сотрудника")


def owner_session(key: Annotated[str | None, Security(owner_cookie)]) -> None:
    if not key:
        raise HTTPException(401, "Войдите в кабинет владельца")


def require_staff_identity(
    _session: Annotated[None, Depends(staff_session)],
    user: Annotated[dict, Depends(auth.require_user)],
    workspace: Annotated[str, Header(alias="X-Vetapp-Workspace",
        description="Clinical workspace: personal or organization. Organization membership and role are checked by the server.")] = "personal",
) -> dict:
    return user


def require_owner_identity(
    _session: Annotated[None, Depends(owner_session)],
    owner: Annotated[owners.OwnerAccount, Depends(owners.require_owner)],
) -> owners.OwnerAccount:
    return owner
