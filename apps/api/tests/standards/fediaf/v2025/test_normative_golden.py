import json
from decimal import Decimal
from pathlib import Path

from vetdietderm_api.standards.fediaf.v2025 import provider


GRAM_TO_MILLIGRAM_MINERALS = frozenset({"Ca", "P", "Mg", "Na", "K", "Cl"})
MILLIGRAM_MINERALS = frozenset({"Fe", "Cu", "Zn", "Mn", "I"})


def _canonical_golden_value(
    code: str,
    source_unit: str,
    source_value: object,
) -> tuple[str, Decimal | None]:
    value = Decimal(str(source_value)) if source_value is not None else None
    if code in GRAM_TO_MILLIGRAM_MINERALS:
        assert source_unit == "g"
        return "mg", value * 1000 if value is not None else None
    if code in MILLIGRAM_MINERALS:
        assert source_unit == "mg"
        return "mg", value
    if code == "Se":
        assert source_unit in {"µg", "mcg"}
        return "mcg", value
    return source_unit, value


def test_vii11_normative_rows_match_frozen_golden_fixture() -> None:
    fixture_path = (
        Path(__file__).resolve().parents[6]
        / "docs"
        / "data"
        / "fediaf_2025_vii11_golden.json"
    )
    golden = json.loads(fixture_path.read_text(encoding="utf-8"))
    data = provider.data
    profiles = {item.uuid: item for item in data.profiles.values()}

    actual = {}
    for target in data.targets:
        profile = profiles[target.profile_uuid]
        if profile.calculation_basis != "daily_per_metabolic_bw":
            continue
        rule = data.rules.get(target.applicability_rule_uuid)
        applicability = {
            "feed_form_wet": "wet",
            "feed_form_dry": "dry",
        }.get(rule.code if rule else "all", rule.code if rule else "all")
        actual[(profile.species_code, profile.code, target.source_code, applicability)] = (
            target.unit,
            target.minimum_value,
        )

    expected = {}
    for row in golden["rows"]:
        code = row["code"]
        expected[(row["species"], row["profile_code"], code, row["applicability"])] = (
            _canonical_golden_value(code, row["source_unit"], row["source_value"])
        )

    assert data.edition.code == golden["edition"]
    assert actual == expected


def test_mineral_targets_use_catalog_canonical_units() -> None:
    data = provider.data

    assert "I" in data.nutrients_by_code
    assert "J" not in data.nutrients_by_code
    for code in GRAM_TO_MILLIGRAM_MINERALS | MILLIGRAM_MINERALS:
        assert data.nutrients_by_code[code].base_unit == "mg"
    assert data.nutrients_by_code["Se"].base_unit == "mcg"

    for target in data.targets:
        if target.source_code in GRAM_TO_MILLIGRAM_MINERALS | MILLIGRAM_MINERALS:
            assert target.unit == "mg"
        elif target.source_code == "Se":
            assert target.unit == "mcg"


def test_fediaf_ca_1_25_g_per_1000_kcal_loads_as_1250_mg() -> None:
    target = next(
        item
        for item in provider.data.targets
        if item.source_code == "Ca" and item.source_value_text is None
        and item.minimum_value == Decimal("1250")
    )

    assert target.unit == "mg"


def test_provider_data_is_loaded_once_and_has_no_sql_identity_dependency() -> None:
    from vetdietderm_api.standards.fediaf.v2025.normative_data import load_standard_data

    assert load_standard_data() is load_standard_data()
    assert provider.metadata.source_checksum == provider.data.edition.source_checksum
    assert len(provider.metadata.provider_checksum) == 64
