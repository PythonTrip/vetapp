from unittest.mock import Mock

import pytest

from vetdietderm_api.db import Base
from vetdietderm_api.guidelines import legacy_guard
from vetdietderm_api.guidelines.legacy_guard import (
    LegacyGuidelineRuntimeArchivedError,
    require_legacy_runtime_tables,
)
from vetdietderm_api.guidelines import models as guideline_models  # noqa: F401

RUNTIME_TABLES = {
    "guideline_profiles",
    "source_references",
    "applicability_rules",
    "derived_expressions",
    "energy_formulas",
    "guideline_targets",
    "growth_size_classes",
    "lactation_factors",
}


def test_runtime_normative_tables_are_not_part_of_application_metadata() -> None:
    assert RUNTIME_TABLES.isdisjoint(Base.metadata.tables)
    assert {"guideline_standards", "guideline_editions"}.issubset(Base.metadata.tables)


def test_legacy_sql_commands_fail_clearly_after_archive(monkeypatch) -> None:
    inspector = Mock()
    inspector.has_table.return_value = False
    monkeypatch.setattr(legacy_guard, "inspect", lambda _bind: inspector)
    session = Mock()
    session.get_bind.return_value = Mock()

    with pytest.raises(LegacyGuidelineRuntimeArchivedError, match="legacy_guidelines"):
        require_legacy_runtime_tables(session)
