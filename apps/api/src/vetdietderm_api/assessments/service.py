"""Resolve stored food inputs for nutrition assessments and diet-plan snapshots."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from vetdietderm_api.assessments import repository
from vetdietderm_api.assessments.ration import prepare_ration
from vetdietderm_api.assessments.schemas import AssessmentRequest, AssessmentResponse
from vetdietderm_api.standards import STANDARD_REGISTRY
from vetdietderm_api.standards.contract import FoodSnapshot, NutritionStandardProvider
from vetdietderm_api.standards.fediaf.v2025 import provider as energy_engine
from vetdietderm_api.standards.registry import StandardNotFoundError


def standard_provider(standard: str = "fediaf", edition: str | None = None) -> NutritionStandardProvider:
    try:
        return STANDARD_REGISTRY.get(standard, edition)
    except StandardNotFoundError as exc:
        unavailable = STANDARD_REGISTRY.unavailable(standard, edition)
        raise HTTPException(422, detail={
            "code": "standard_unavailable" if unavailable else "standard_not_found",
            "message": unavailable.reason if unavailable else "Редакция стандарта не найдена.",
        }) from exc


def assessment_provider(payload: AssessmentRequest) -> NutritionStandardProvider:
    selection = payload.profile_selection
    return standard_provider(selection.standard_code, selection.edition) if selection else standard_provider()


def assess(
    session: Session,
    payload: AssessmentRequest,
    *,
    provider: NutritionStandardProvider | None = None,
) -> tuple[AssessmentResponse, dict[UUID, FoodSnapshot]]:
    if provider is None:
        provider = assessment_provider(payload)
    foods = repository.load_foods(session, [item.food_uuid for item in payload.components])
    requirement = energy_engine.energy_requirement(payload)
    ration = prepare_ration(payload, foods, requirement)
    return provider.assess_prepared(payload, ration), foods
