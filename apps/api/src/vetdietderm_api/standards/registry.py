from __future__ import annotations

from collections.abc import Iterable

from vetdietderm_api.standards.contract import NutritionStandardProvider


class StandardNotFoundError(LookupError):
    pass


class StandardRegistry:
    """Registry of immutable provider editions; selection never consults SQL."""

    def __init__(self, providers: Iterable[NutritionStandardProvider] = ()) -> None:
        self._providers: dict[tuple[str, str], NutritionStandardProvider] = {}
        self._active_editions: dict[str, str] = {}
        for provider in providers:
            self.register(provider, active=True)

    def register(
        self,
        provider: NutritionStandardProvider,
        *,
        active: bool = False,
    ) -> None:
        metadata = provider.metadata
        key = (metadata.standard_code, metadata.edition)
        if key in self._providers:
            raise ValueError(f"Standard provider already registered: {key!r}")
        self._providers[key] = provider
        if active or metadata.standard_code not in self._active_editions:
            self._active_editions[metadata.standard_code] = metadata.edition

    def get(
        self,
        standard_code: str,
        edition: str | None = None,
    ) -> NutritionStandardProvider:
        resolved_edition = edition or self._active_editions.get(standard_code)
        provider = self._providers.get((standard_code, resolved_edition or ""))
        if provider is None:
            identity = f"{standard_code}/{resolved_edition or 'active'}"
            raise StandardNotFoundError(f"Nutrition standard provider not found: {identity}")
        return provider

    def active(self, standard_code: str = "fediaf") -> NutritionStandardProvider:
        return self.get(standard_code)

    def editions(self, standard_code: str) -> tuple[str, ...]:
        return tuple(
            edition
            for code, edition in self._providers
            if code == standard_code
        )


STANDARD_REGISTRY = StandardRegistry()


def _register_builtin_providers() -> None:
    from vetdietderm_api.standards.fediaf.v2025 import provider

    STANDARD_REGISTRY.register(provider, active=True)


_register_builtin_providers()
