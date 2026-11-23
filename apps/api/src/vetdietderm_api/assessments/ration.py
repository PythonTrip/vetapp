"""Shared as-fed nutrient totals and species-scoped food energy."""
from collections.abc import Mapping
from dataclasses import dataclass, replace
from math import fsum
from uuid import UUID

from vetdietderm_api.assessments.schemas import (
    AssessmentRequest,
    EnergyAssessment,
    NutrientIntakeBases,
    RationEnergyItem,
    RationEnergyRead,
)
from vetdietderm_api.catalog.energy import FoodEnergySource, resolve_me


@dataclass(frozen=True)
class FoodValue:
    value: float | None
    value_status: str
    source: str | None = None


@dataclass(frozen=True)
class FoodSnapshot:
    uuid: UUID
    name: str
    type: str
    feed_form: str
    values: Mapping[str, FoodValue]


@dataclass(frozen=True)
class RationData:
    foods: list[tuple[FoodSnapshot, float]]
    totals: dict[str, float]
    complete_codes: set[str]
    missing_by_code: dict[str, list[str]]
    weight_grams: float
    dry_matter_grams: float | None

    def intake_bases(
        self, daily: float, *, body_weight: float | None, metabolic_exponent: float | None,
    ) -> NutrientIntakeBases:
        """Normalize a complete intake in one unit using independently known denominators."""
        me = self.totals.get("ME")
        return NutrientIntakeBases(
            per_day=daily,
            per_100g_as_fed=daily / self.weight_grams * 100 if self.weight_grams > 0 else None,
            per_100g_dry_matter=daily / self.dry_matter_grams * 100 if self.dry_matter_grams else None,
            per_1000_kcal_me=daily / me * 1000 if me else None,
            per_kg_bw=daily / body_weight if body_weight else None,
            per_kg_metabolic_bw=(
                daily / body_weight**metabolic_exponent if body_weight and metabolic_exponent is not None else None
            ),
            metabolic_exponent=metabolic_exponent,
        )

    def control_ratios(self, groups: Mapping[str, tuple[str, ...]]) -> dict[str, tuple[float | None, str]]:
        def ratio(numerator: float | None, denominator: float | None, scale: float = 1) -> float | None:
            return numerator / denominator * scale if numerator is not None and denominator else None

        def group_total(key: str) -> float | None:
            codes = groups[key]
            return fsum(self.totals[code] for code in codes) if self.complete_codes.issuperset(codes) else None

        totals = self.totals
        return {
            "ME/DM": (ratio(totals.get("ME"), self.dry_matter_grams, 100), "ккал/100 г СВ"),
            "CP/ME": (ratio(totals.get("CP"), totals.get("ME"), 1000), "г/1000 ккал ME"),
            **{f"{code}/DM": (ratio(totals.get(code), self.dry_matter_grams, 100), "%")
               for code in ("CP", "CH", "CFa", "CFi", "CAs")},
            "Ca/P": (ratio(totals.get("Ca"), totals.get("P")), ""),
            "Zn/Ca": (ratio(totals.get("Zn"), totals.get("Ca")), ""),
            "ω6/ω3": (ratio(group_total("OMEGA_6"), group_total("OMEGA_3")), ""),
        }


@dataclass(frozen=True)
class PreparedRation:
    foods_by_id: Mapping[UUID, FoodSnapshot]
    requirement: EnergyAssessment
    energy: RationEnergyRead
    nutrients: RationData


def prepare_ration(
    payload: AssessmentRequest,
    foods: Mapping[UUID, FoodSnapshot],
    energy: EnergyAssessment,
) -> PreparedRation:
    resolved, ration_energy = resolve_ration_foods(payload, foods, energy.working_energy_kcal)
    return PreparedRation(foods, energy, ration_energy, ration_data(payload, resolved))


def known_value(food: FoodSnapshot, code: str) -> float | None:
    value = food.values.get(code)
    if value is None or value.value is None or value.value_status == "unknown":
        return None
    return float(value.value)


def resolve_ration_foods(
    payload: AssessmentRequest, foods_by_id: Mapping[UUID, FoodSnapshot], working_energy: float | None,
) -> tuple[dict[UUID, FoodSnapshot], RationEnergyRead]:
    """Add species-scoped fallback ME to assessment snapshots only."""
    resolved: dict[UUID, FoodSnapshot] = {}
    items: list[RationEnergyItem] = []
    species = payload.animal.species.value
    for line in payload.components:
        food_uuid = line.food_uuid
        food = foods_by_id[food_uuid]
        calculation = resolve_me(food, species) if species in {"dog", "cat"} else None
        value = float(calculation.value) if calculation and calculation.value is not None else None
        catalog_me = food.values.get("ME")
        estimated = value is not None and calculation is not None and calculation.source is FoodEnergySource.calculated
        items.append(RationEnergyItem(
            food_uuid=food_uuid,
            me_kcal_per_100g=value,
            kcal_day=value * line.grams / 100 if value is not None else None,
            method=calculation.method if calculation is not None and value is not None else None,
            source=(
                "FEDIAF 2025, §7.2.2.2" if estimated else
                (catalog_me.source or "Каталог продуктов") if value is not None and catalog_me else None
            ),
            quality="estimated" if estimated else catalog_me.value_status if value is not None and catalog_me else "unknown",
            warning=(
                calculation.warning if calculation is not None else "Для этого вида расчёт ME по составу недоступен."
            ),
        ))
        values = dict(food.values)
        if value is None:
            # An invalid declared value must not leak into ration arithmetic.
            values.pop("ME", None)
        elif estimated:
            values["ME"] = FoodValue(
                value=value,
                value_status="calculated",
            )
        resolved[food_uuid] = replace(food, values=values)
    known_kcal = fsum(item.kcal_day for item in items if item.kcal_day is not None)
    total = known_kcal if all(item.kcal_day is not None for item in items) else None
    return resolved, RationEnergyRead(
        items=items, total_kcal_day=total, known_kcal_day=known_kcal,
        requirement_kcal_day=working_energy,
        coverage_percent=100 * total / working_energy if total is not None and working_energy else None,
        difference_kcal_day=total - working_energy if total is not None and working_energy is not None else None,
    )


def ration_data(payload: AssessmentRequest, foods_by_id: Mapping[UUID, FoodSnapshot]) -> RationData:
    foods = [(foods_by_id[item.food_uuid], item.grams) for item in payload.components]
    codes = {code for food, _grams in foods for code in food.values}
    totals: dict[str, float] = {}
    complete_codes: set[str] = set()
    missing_by_code: dict[str, list[str]] = {}
    for code in codes:
        values = [(known_value(food, code), food.name, grams) for food, grams in foods]
        missing = [name for value, name, _grams in values if value is None]
        missing_by_code[code] = missing
        if not missing:
            complete_codes.add(code)
            totals[code] = fsum(
                # Stored nutrients are per 100 g as fed; ME is kcal/100 g.
                value * grams / 100.0 for value, _name, grams in values if value is not None
            )
    weight_grams = fsum(grams for _food, grams in foods)
    moistures = [known_value(food, "MO") for food, _grams in foods]
    dry_matter = (
        fsum(grams * (100 - moisture) / 100 for (_, grams), moisture in zip(foods, moistures, strict=True) if moisture is not None)
        if "MO" in totals and all(value is not None and 0 <= value <= 100 for value in moistures)
        else None
    )
    return RationData(
        foods=foods,
        totals=totals,
        complete_codes=complete_codes,
        missing_by_code=missing_by_code,
        weight_grams=weight_grams,
        dry_matter_grams=dry_matter,
    )


