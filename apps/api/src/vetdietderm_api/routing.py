"""Application wiring for legacy routes and the versioned API."""

from fastapi import Depends, FastAPI

from vetdietderm_api.appointments.router import router as appointments_router
from vetdietderm_api.assessments.router import router as assessments_router
from vetdietderm_api.attachments.router import router as attachments_router
from vetdietderm_api.auth import require_clinical_access, router as account_router
from vetdietderm_api.catalog.router import router as catalog_router
from vetdietderm_api.clinical_catalog.router import router as clinical_catalog_router
from vetdietderm_api.communications.router import router as communications_router
from vetdietderm_api.encounters.router import router as encounters_router
from vetdietderm_api.encounter_templates.router import router as encounter_templates_router
from vetdietderm_api.guidelines.router import router as guidelines_router
from vetdietderm_api.patients.router import router as patients_router
from vetdietderm_api.owners.router import router as owners_router
from vetdietderm_api.chat.router import router as chat_router
from vetdietderm_api.questionnaires.router import router as questionnaires_router
from vetdietderm_api.visits.router import router as visits_router
from vetdietderm_api.v1 import create_v1_router

LEGACY_SELF_SCOPED_ROUTERS = (
    account_router,
    owners_router,
    chat_router,
    questionnaires_router,
    visits_router,
)

LEGACY_CLINICAL_ROUTERS = (
    patients_router,
    encounters_router,
    encounter_templates_router,
    clinical_catalog_router,
    attachments_router,
    appointments_router,
    communications_router,
    catalog_router,
    guidelines_router,
    assessments_router,
)


def include_legacy_self_scoped_routes(app: FastAPI) -> None:
    for router in LEGACY_SELF_SCOPED_ROUTERS:
        app.include_router(router)


def include_clinical_and_versioned_routes(app: FastAPI) -> None:
    for router in LEGACY_CLINICAL_ROUTERS:
        app.include_router(router, dependencies=[Depends(require_clinical_access)])
    app.include_router(create_v1_router(
        staff_routers=(*LEGACY_CLINICAL_ROUTERS, questionnaires_router),
        mixed_routers=(owners_router, chat_router, visits_router),
    ))
