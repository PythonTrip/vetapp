import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel

from vetdietderm_api.api_errors import install_error_handlers
from vetdietderm_api.auth import require_clinical_access
from vetdietderm_api.db import ping_database
from vetdietderm_api.messaging.intake import run_business_worker
from vetdietderm_api.orm import load_models
from vetdietderm_api.routing import include_clinical_and_versioned_routes, include_legacy_self_scoped_routes
from vetdietderm_api.settings import get_settings
from vetdietderm_api.telegram.router import router as telegram_router
from vetdietderm_api.telegram.worker import run_worker


class StatusResponse(BaseModel):
    status: str


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    get_settings()
    logger.info("Vet Space API starting")
    workers = (asyncio.create_task(run_worker()), asyncio.create_task(run_business_worker()))
    try:
        yield
    finally:
        for worker in workers:
            worker.cancel()
        await asyncio.gather(*workers, return_exceptions=True)
        logger.info("Vet Space API stopped")


@logger.catch(reraise=True)
def create_app() -> FastAPI:
    settings = get_settings()
    load_models()
    application = FastAPI(
        title="Vet Space API",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.client_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get("/health", response_model=StatusResponse)
    def health() -> StatusResponse:
        return StatusResponse(status="ok")

    include_legacy_self_scoped_routes(application)
    application.include_router(telegram_router)

    @application.get("/ready", response_model=StatusResponse, dependencies=[Depends(require_clinical_access)])
    def ready() -> StatusResponse:
        ping_database()
        return StatusResponse(status="ok")

    include_clinical_and_versioned_routes(application)
    install_error_handlers(application, settings.client_origins)
    return application


app = create_app()


@logger.catch
def run() -> None:
    import uvicorn

    get_settings()
    uvicorn.run("vetdietderm_api.main:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    run()
