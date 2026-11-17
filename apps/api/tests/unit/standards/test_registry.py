import pytest

from vetdietderm_api.standards import STANDARD_REGISTRY, StandardRegistry
from vetdietderm_api.standards.fediaf.v2025 import provider
from vetdietderm_api.standards.registry import StandardNotFoundError


def test_builtin_registry_resolves_active_and_explicit_edition() -> None:
    assert STANDARD_REGISTRY.active("fediaf") is provider
    assert STANDARD_REGISTRY.get("fediaf", "2025.09") is provider


def test_registry_rejects_mutating_an_existing_edition() -> None:
    registry = StandardRegistry([provider])
    with pytest.raises(ValueError, match="already registered"):
        registry.register(provider)


def test_registry_reports_unknown_standard() -> None:
    with pytest.raises(StandardNotFoundError):
        STANDARD_REGISTRY.get("nrc", "2026")
