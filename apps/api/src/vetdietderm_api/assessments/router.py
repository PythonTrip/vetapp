from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy.orm import Session

from vetdietderm_api.assessments import plans, repository
from vetdietderm_api.assessments.engine import (
    assess_nutrition,
    evaluate_energy_scenario,
    suggest_context,
)
from vetdietderm_api.assessments.schemas import (
    AssessmentRequest,
    AssessmentResponse,
    DietPlanRead,
    DietPlanSummary,
    DietPlanWrite,
    EnergyEstimateRequest,
    EnergyEstimateResponse,
    SuggestionRequest,
    SuggestionsResponse,
)
from vetdietderm_api.db import get_session

SessionDep = Annotated[Session, Depends(get_session)]

router = APIRouter()
assessments_router = APIRouter(prefix="/assessments", tags=["assessments"])
plans_router = APIRouter(prefix="/diet-plans", tags=["diet-plans"])


@assessments_router.post("/suggestions", response_model=SuggestionsResponse)
@logger.catch(reraise=True)
def suggestions(payload: SuggestionRequest, session: SessionDep) -> SuggestionsResponse:
    snapshot = repository.load_published_guideline(session)
    return suggest_context(payload.animal, snapshot)


@assessments_router.post("/energy-estimate", response_model=EnergyEstimateResponse)
@logger.catch(reraise=True, exclude=HTTPException)
def energy_estimate(
    payload: EnergyEstimateRequest,
    session: SessionDep,
) -> EnergyEstimateResponse:
    snapshot = repository.load_published_guideline(session)
    return evaluate_energy_scenario(payload, snapshot)


@assessments_router.post("", response_model=AssessmentResponse)
@logger.catch(reraise=True, exclude=HTTPException)
def create_assessment(payload: AssessmentRequest, session: SessionDep) -> AssessmentResponse:
    snapshot = repository.load_published_guideline(session)
    foods = repository.load_foods(session, [item.food_uuid for item in payload.components])
    return assess_nutrition(payload, snapshot, foods)


@plans_router.get("", response_model=list[DietPlanSummary])
@logger.catch(reraise=True)
def list_diet_plans(
    session: SessionDep,
    patient_id: Annotated[UUID | None, Query(alias="patientId")] = None,
) -> list[DietPlanSummary]:
    return [plans.to_summary(item) for item in plans.list_plans(session, patient_id)]


@plans_router.post("", response_model=DietPlanRead, status_code=201)
@logger.catch(reraise=True)
def create_diet_plan(payload: DietPlanWrite, session: SessionDep) -> DietPlanRead:
    return plans.to_read(plans.create_plan(session, payload))


@plans_router.get("/{plan_id}", response_model=DietPlanRead)
@logger.catch(reraise=True)
def read_diet_plan(plan_id: UUID, session: SessionDep) -> DietPlanRead:
    # Pure storage read: never load current guidelines or call the engine here.
    return plans.to_read(plans.get_plan(session, plan_id))


@plans_router.patch("/{plan_id}", response_model=DietPlanRead)
@logger.catch(reraise=True)
def patch_diet_plan(
    plan_id: UUID,
    payload: DietPlanWrite,
    session: SessionDep,
) -> DietPlanRead:
    return plans.to_read(plans.update_plan(session, plan_id, payload))


router.include_router(assessments_router)
router.include_router(plans_router)
