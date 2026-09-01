"""Deprecated compatibility aliases for the former shared AST evaluator.

Executable rule languages are standard-specific. New providers must not build
on this module; FEDIAF 2025 owns its evaluators under its versioned package.
"""

from vetdietderm_api.standards.fediaf.v2025.applicability import (
    PredicateEvaluationError,
    evaluate_predicate,
)
from vetdietderm_api.standards.fediaf.v2025.energy_formulas import (
    EnergyFormulaError,
    evaluate_formula,
)

AstEvaluationError = EnergyFormulaError
UnsupportedAstError = EnergyFormulaError
MissingAstFieldError = EnergyFormulaError

__all__ = [
    "AstEvaluationError",
    "EnergyFormulaError",
    "MissingAstFieldError",
    "PredicateEvaluationError",
    "UnsupportedAstError",
    "evaluate_formula",
    "evaluate_predicate",
]
