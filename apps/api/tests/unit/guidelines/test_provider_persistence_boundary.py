from vetdietderm_api.db import Base
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
