"""Assessment package with a lazy router export to avoid provider import cycles."""

from typing import Any

__all__ = ["router"]


def __getattr__(name: str) -> Any:
    if name == "router":
        from importlib import import_module

        router = import_module("vetdietderm_api.assessments.router").router
        globals()["router"] = router
        return router
    raise AttributeError(name)
