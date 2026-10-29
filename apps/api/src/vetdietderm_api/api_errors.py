"""The v1 error contract. Legacy clients retain FastAPI's original errors."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException


class ApiError(BaseModel):
    code: str
    message: str
    details: Any = None


class ErrorResponse(BaseModel):
    error: ApiError


ERROR_CODES = {
    400: "bad_request", 401: "unauthenticated", 403: "forbidden", 404: "not_found",
    405: "method_not_allowed", 409: "conflict", 413: "payload_too_large",
    422: "validation_error", 429: "rate_limited", 500: "internal_error",
    502: "bad_gateway", 503: "service_unavailable", 504: "gateway_timeout",
}
ERROR_RESPONSES = {
    status: {"model": ErrorResponse, "description": code.replace("_", " ")}
    for status, code in ERROR_CODES.items()
}


def is_v1(request: Request) -> bool:
    return request.url.path == "/v1" or request.url.path.startswith("/v1/")


def error_response(status: int, message: str, details: Any = None, headers=None):
    return JSONResponse(
        status_code=status,
        content=ErrorResponse(error=ApiError(
            code=ERROR_CODES.get(status, "http_error"), message=message, details=details,
        )).model_dump(mode="json"),
        headers={**(headers or {}), "Cache-Control": "no-store"},
    )


def install_error_handlers(app: FastAPI, allowed_origins: list[str]) -> None:
    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        if not is_v1(request):
            return await http_exception_handler(request, exc)
        return error_response(exc.status_code,
                              exc.detail if isinstance(exc.detail, str) else "Request failed",
                              None if isinstance(exc.detail, str) else exc.detail, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        if not is_v1(request):
            return await request_validation_exception_handler(request, exc)
        # Never echo submitted credentials or Pydantic input/context into errors.
        details = [{key: err[key] for key in ("loc", "msg", "type")} for err in exc.errors()]
        return error_response(422, "Request validation failed", details)

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, _exc: Exception):
        if is_v1(request):
            response = error_response(500, "Internal server error")
            # ServerErrorMiddleware sits outside CORSMiddleware. Its 500 response
            # must still be readable by the same explicitly allowed clients.
            origin = request.headers.get("origin")
            if origin in allowed_origins:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Vary"] = "Origin"
            return response
        return PlainTextResponse("Internal Server Error", status_code=500)
