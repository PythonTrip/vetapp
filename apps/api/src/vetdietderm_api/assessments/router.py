from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from loguru import logger
from sqlalchemy.orm import Session

from vetdietderm_api.assessments import plans, repository, service
from vetdietderm_api.assessments.schemas import (
    AssessmentRequest,
    AssessmentResponse,
    DietPlanRead,
    DietPlanSummary,
    DietPlanWrite,
    EnergyEstimateRequest,
    EnergyEstimateResponse,
    StandardRead,
    SuggestionRequest,
    SuggestionsResponse,
)
from vetdietderm_api.db import get_session
from vetdietderm_api.standards import STANDARD_REGISTRY

SessionDep = Annotated[Session, Depends(get_session)]

router = APIRouter()
assessments_router = APIRouter(prefix="/assessments", tags=["assessments"])
plans_router = APIRouter(prefix="/diet-plans", tags=["diet-plans"])


@assessments_router.get("/standards", response_model=list[StandardRead])
def standards() -> list[StandardRead]:
    available = [
        StandardRead(
            standard_code=metadata.standard_code, edition=metadata.edition,
            source_url=metadata.source_url, available=True,
            active=STANDARD_REGISTRY.active(metadata.standard_code) is provider,
            provider_version=metadata.provider_version, provider_checksum=metadata.provider_checksum,
            normative_categories=list(metadata.normative_categories),
            reason="Для коммерческого использования требуется письменное разрешение FEDIAF."
            if metadata.standard_code == "fediaf" else None,
        )
        for provider in STANDARD_REGISTRY.providers()
        for metadata in (provider.metadata,)
    ]
    return available + [
        StandardRead(
            standard_code=item.standard_code, edition=item.edition, source_url=item.source_url,
            available=False, reason=item.reason, normative_categories=list(item.normative_categories),
        )
        for item in STANDARD_REGISTRY.unavailable_editions()
    ]


@assessments_router.post("/suggestions", response_model=SuggestionsResponse)
@logger.catch(reraise=True, exclude=HTTPException)
def suggestions(payload: SuggestionRequest) -> SuggestionsResponse:
    return service.standard_provider(payload.standard_code, payload.edition).suggest(payload.animal)


@assessments_router.post("/energy-estimate", response_model=EnergyEstimateResponse)
@logger.catch(reraise=True, exclude=HTTPException)
def energy_estimate(
    payload: EnergyEstimateRequest,
) -> EnergyEstimateResponse:
    return service.energy_engine.estimate_energy(payload)


@assessments_router.post("", response_model=AssessmentResponse)
@logger.catch(reraise=True, exclude=HTTPException)
def create_assessment(payload: AssessmentRequest, session: SessionDep) -> AssessmentResponse:
    result, _ = service.assess(session, payload)
    return result


@plans_router.get("", response_model=list[DietPlanSummary])
@logger.catch(reraise=True)
def list_diet_plans(
    session: SessionDep,
    patient_id: Annotated[UUID | None, Query(alias="patientId")] = None,
) -> list[DietPlanSummary]:
    return [plans.to_summary(item) for item in repository.list_plans(session, patient_id)]


@plans_router.post("", response_model=DietPlanRead, status_code=201)
@logger.catch(reraise=True, exclude=HTTPException)
def create_diet_plan(payload: DietPlanWrite, session: SessionDep, request: Request) -> DietPlanRead:
    user = getattr(request.state, "user", {})
    return plans.to_read(plans.create_plan(session, payload, confirmed_by=user.get("user_id")))


@plans_router.get("/{plan_id}", response_model=DietPlanRead)
@logger.catch(reraise=True)
def read_diet_plan(plan_id: UUID, session: SessionDep) -> DietPlanRead:
    # Pure storage read: never load current guidelines or call the engine here.
    return plans.to_read(repository.get_plan(session, plan_id))


@plans_router.patch("/{plan_id}", response_model=DietPlanRead)
@logger.catch(reraise=True, exclude=HTTPException)
def patch_diet_plan(
    plan_id: UUID,
    payload: DietPlanWrite,
    session: SessionDep,
    request: Request,
) -> DietPlanRead:
    user = getattr(request.state, "user", {})
    return plans.to_read(plans.update_plan(session, plan_id, payload, confirmed_by=user.get("user_id")))


router.include_router(assessments_router)
router.include_router(plans_router)
