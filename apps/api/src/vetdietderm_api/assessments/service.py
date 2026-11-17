"""Resolve stored food inputs for nutrition assessments and diet-plan snapshots."""

from uuid import UUID

from sqlalchemy.orm import Session

from vetdietderm_api.assessments import repository
from vetdietderm_api.assessments.schemas import AssessmentRequest, AssessmentResponse
from vetdietderm_api.standards import STANDARD_REGISTRY
from vetdietderm_api.standards.contract import FoodSnapshot, NutritionStandardProvider


def assess(
    session: Session,
    payload: AssessmentRequest,
    *,
    provider: NutritionStandardProvider | None = None,
) -> tuple[AssessmentResponse, dict[UUID, FoodSnapshot]]:
    foods = repository.load_foods(session, [item.food_uuid for item in payload.components])
    if provider is None:
        provider = STANDARD_REGISTRY.active()
    return provider.assess(payload, foods), foods
