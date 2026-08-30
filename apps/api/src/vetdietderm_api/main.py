from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel

from vetdietderm_api.appointments import router as appointments_router
from vetdietderm_api.assessments import router as assessments_router
from vetdietderm_api.attachments import router as attachments_router
from vetdietderm_api.auth import require_instance_password
from vetdietderm_api.catalog import router as catalog_router
from vetdietderm_api.communications import router as communications_router
from vetdietderm_api.db import ping_database
from vetdietderm_api.encounters import router as encounters_router
from vetdietderm_api.encounter_templates import router as encounter_templates_router
from vetdietderm_api.guidelines import router as guidelines_router
from vetdietderm_api.patients import router as patients_router
from vetdietderm_api.settings import get_settings

NEXT_ORIGIN = "http://127.0.0.1:3000"


class StatusResponse(BaseModel):
    status: str


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    get_settings()
    logger.info("VetDietDerm API starting")
    yield
    logger.info("VetDietDerm API stopped")


@logger.catch(reraise=True)
def create_app() -> FastAPI:
    get_settings()
    application = FastAPI(
        title="VetDietDerm API",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[NEXT_ORIGIN, "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get("/health", response_model=StatusResponse)
    def health() -> StatusResponse:
        return StatusResponse(status="ok")

    auth = [Depends(require_instance_password)]

    @application.get("/ready", response_model=StatusResponse, dependencies=auth)
    def ready() -> StatusResponse:
        ping_database()
        return StatusResponse(status="ok")

    application.include_router(patients_router, dependencies=auth)
    application.include_router(encounters_router, dependencies=auth)
    application.include_router(encounter_templates_router, dependencies=auth)
    application.include_router(attachments_router, dependencies=auth)
    application.include_router(appointments_router, dependencies=auth)
    application.include_router(communications_router, dependencies=auth)
    application.include_router(catalog_router, dependencies=auth)
    application.include_router(guidelines_router, dependencies=auth)
    application.include_router(assessments_router, dependencies=auth)
    return application


app = create_app()


@logger.catch
def run() -> None:
    import uvicorn

    get_settings()
    uvicorn.run("vetdietderm_api.main:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    run()
