"""Versioned transport adapters sharing the legacy handlers and application services.

No redirects or internal HTTP calls: FastAPI rebuilds dependencies and schemas for
each alias, while the original APIRoutes remain untouched.
"""

from copy import copy
from collections.abc import Sequence

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel

from vetdietderm_api import auth
from vetdietderm_api.account_schemas import UserProfileRead
from vetdietderm_api.api_errors import ERROR_RESPONSES
from vetdietderm_api.v1_security import csrf_marker, require_owner_identity, require_staff_identity, staff_session


class Credentials(BaseModel):
    email: str
    password: str


class EmailWrite(BaseModel):
    email: str


class EmailVerification(EmailWrite):
    code: str


class PasswordReset(BaseModel):
    token: str
    new_password: str


class SessionResult(BaseModel):
    ok: bool


def auth_router() -> APIRouter:
    router = APIRouter(prefix="/v1/auth/staff", tags=["v1 auth staff"],
                       dependencies=[Depends(auth.csrf)], responses=ERROR_RESPONSES)

    @router.post("/login", response_model=SessionResult)
    def login(body: Credentials, request: Request, response: Response):
        return auth.login(request, response, body.model_dump())

    router.add_api_route("/logout", auth.logout, methods=["POST"], response_model=SessionResult)
    router.add_api_route("/me", auth.account_profile, methods=["GET"], response_model=UserProfileRead,
                         response_model_exclude_unset=True, dependencies=[Depends(staff_session)])

    @router.post("/refresh", response_model=UserProfileRead, response_model_exclude_unset=True,
                 dependencies=[Depends(staff_session)])
    def refresh(request: Request, response: Response):
        return auth.account_proxy("auth/refresh", request, response)

    # Provider-owned responses remain unconstrained JSON, as in the legacy BFF.
    # Explicit paths/methods prevent a generic proxy from broadening the v1 API.
    @router.post("/register")
    def register(body: Credentials, request: Request, response: Response):
        return auth.account_proxy("auth/register", request, response, body.model_dump())

    @router.post("/email/verify")
    def verify(body: EmailVerification, request: Request, response: Response):
        return auth.account_proxy("auth/email/verify", request, response, body.model_dump())

    @router.post("/email/resend-verification")
    def resend(body: EmailWrite, request: Request, response: Response):
        return auth.account_proxy("auth/email/resend-verification", request, response, body.model_dump())

    @router.post("/password/forgot")
    def forgot(body: EmailWrite, request: Request, response: Response):
        return auth.account_proxy("auth/password/forgot", request, response, body.model_dump())

    @router.post("/password/reset")
    def reset(body: PasswordReset, request: Request, response: Response):
        return auth.account_proxy("auth/password/reset", request, response, body.model_dump())

    return router


FILE_HANDLERS = {"download_attachment", "download_owner_file", "owner_download", "staff_download"}
OWNER_AUTH_PATHS = {"/owner/register", "/owner/login", "/owner/logout", "/owner/join/{code}",
                    "/owner/telegram/login", "/owner/telegram/link"}


def alias(target: APIRouter, source: APIRoute, path: str, dependencies: list) -> None:
    # include_router retains response models, parameter declarations, status codes,
    # serialization settings, callbacks and dependencies from the source route.
    route = copy(source)
    route.path = path
    route.operation_id = None
    route.name = "v1_" + source.name
    route.tags = ["v1 " + ("auth owner" if path.startswith("/v1/auth/owner")
                          else "owner" if path.startswith("/v1/owner/") else "staff")]
    route.responses = {**source.responses, **ERROR_RESPONSES}
    if source.endpoint.__name__ in FILE_HANDLERS:
        route.response_class = FileResponse
        route.responses[200] = {"description": "File download", "content": {
            "application/octet-stream": {"schema": {"type": "string", "format": "binary"}},
        }}
    if path in {"/v1/auth/owner/logout"}:
        route.response_model = SessionResult
    temporary = APIRouter()
    temporary.routes.append(route)
    target.include_router(temporary, dependencies=dependencies)


def create_v1_router(staff_routers: Sequence[APIRouter], mixed_routers: Sequence[APIRouter]) -> APIRouter:
    from vetdietderm_api.chat.router import clinical as staff_chat
    from vetdietderm_api.visits.router import clinical as staff_visits

    router = APIRouter(dependencies=[Depends(csrf_marker)])
    router.include_router(auth_router())
    staff = [Depends(require_staff_identity)]
    owner = [Depends(require_owner_identity)]
    # Let FastAPI include nested routers, including its lazy router contexts.
    # Never enumerate .routes to flatten an aggregated clinical router.
    for source in [*staff_routers, staff_chat, staff_visits]:
        router.include_router(source, prefix="/v1/staff", tags=["v1 staff"],
                              dependencies=[*staff, Depends(auth.require_clinical_access)],
                              responses=ERROR_RESPONSES)
    for source in mixed_routers:
        for route in source.routes:
            if not isinstance(route, APIRoute):
                continue
            if route.path in OWNER_AUTH_PATHS:
                alias(router, route, "/v1/auth" + route.path, [])
            elif route.path.startswith("/owner/"):
                alias(router, route, "/v1" + route.path, owner)
            else:
                alias(router, route, "/v1/staff" + route.path, staff)
    # Typed organization reads are part of the initial staff account surface.
    for route in auth.router.routes:
        if isinstance(route, APIRoute) and route.path.startswith("/auth-service/organizations/"):
            alias(router, route, "/v1/staff" + route.path.removeprefix("/auth-service"), staff)
    return router
