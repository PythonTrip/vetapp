from __future__ import annotations

from collections.abc import Iterable

from vetdietderm_api.standards.contract import NutritionStandardProvider
from vetdietderm_api.standards.unavailable import UnavailableEdition


class StandardNotFoundError(LookupError):
    pass


class StandardRegistry:
    """Registry of immutable provider editions; selection never consults SQL."""

    def __init__(self, providers: Iterable[NutritionStandardProvider] = ()) -> None:
        self._providers: dict[tuple[str, str], NutritionStandardProvider] = {}
        self._active_editions: dict[str, str] = {}
        self._unavailable: dict[tuple[str, str], UnavailableEdition] = {}
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
        self._unavailable.pop(key, None)
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

    def register_unavailable(self, edition: UnavailableEdition) -> None:
        key = (edition.standard_code, edition.edition)
        if key in self._providers or key in self._unavailable:
            raise ValueError(f"Standard edition already registered: {key!r}")
        self._unavailable[key] = edition

    def unavailable(self, standard_code: str, edition: str | None) -> UnavailableEdition | None:
        if edition is not None:
            return self._unavailable.get((standard_code, edition))
        return next((item for item in self._unavailable.values() if item.standard_code == standard_code), None)

    def providers(self) -> tuple[NutritionStandardProvider, ...]:
        return tuple(self._providers.values())

    def unavailable_editions(self) -> tuple[UnavailableEdition, ...]:
        return tuple(self._unavailable.values())


STANDARD_REGISTRY = StandardRegistry()


def _register_dataset_edition(
    provider: NutritionStandardProvider | None,
    edition: UnavailableEdition,
) -> None:
    if provider is None:
        STANDARD_REGISTRY.register_unavailable(edition)
        return
    STANDARD_REGISTRY.register(provider, active=False)


def _register_builtin_providers() -> None:
    from vetdietderm_api.standards.aafco.v2026 import catalog_entry as aafco_catalog
    from vetdietderm_api.standards.aafco.v2026 import load_provider as load_aafco
    from vetdietderm_api.standards.fediaf.v2025 import provider
    from vetdietderm_api.standards.nrc.v2006 import catalog_entry as nrc_catalog
    from vetdietderm_api.standards.nrc.v2006 import load_provider as load_nrc

    STANDARD_REGISTRY.register(provider, active=True)
    _register_dataset_edition(load_nrc(), nrc_catalog())
    _register_dataset_edition(load_aafco(), aafco_catalog())


_register_builtin_providers()
