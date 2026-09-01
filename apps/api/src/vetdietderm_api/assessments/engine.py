"""Compatibility exports for the former FEDIAF-specific nutrition engine.

New code resolves a :class:`NutritionStandardProvider` through StandardRegistry.
These names remain importable for callers that used the pre-provider module.
"""

from vetdietderm_api.standards.fediaf.v2025.assessment import (
    COVERAGE_THRESHOLD_PERCENT,
    ENGINE_ID,
    assess_nutrition,
    evaluate_energy_scenario,
)
from vetdietderm_api.standards.fediaf.v2025.resolver import suggest_context

__all__ = [
    "COVERAGE_THRESHOLD_PERCENT",
    "ENGINE_ID",
    "assess_nutrition",
    "evaluate_energy_scenario",
    "suggest_context",
]
