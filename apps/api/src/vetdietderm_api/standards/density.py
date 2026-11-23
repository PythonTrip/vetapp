"""Per-1000-kcal comparison for NRC and AAFCO datasets.

Food values stay in catalog units. Published gram targets for minerals that the
catalog stores in milligrams are scaled before comparison. Codes in the dataset
are translated to catalog codes. A value that cannot be translated is reported
and is not compared. An exclusive maximum fails when the intake equals the
limit. Compound ratios sum the listed catalog codes and do not treat a missing
fraction as zero.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from hashlib import sha256
from math import fsum, isclose
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid5

from fastapi import HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from vetdietderm_api.assessments.ration import PreparedRation, RationData, known_value
from vetdietderm_api.assessments.schemas import (
    AnimalProfile,
    AssessmentGate,
    AssessmentOverall,
    AssessmentRequest,
    AssessmentResponse,
    AssessmentRow,
    AssessmentStatus,
    ContextSuggestion,
    CoverageAssessment,
    EditionIdentity,
    NutrientContribution,
    ProfileCompatibility,
    ProfileSuggestionOption,
    ResolvedContext,
    RowCompleteness,
    SourceRead,
    SuggestionsResponse,
    TargetRead,
)
from vetdietderm_api.standards.contract import (
    ContextOption,
    StandardContextOptions,
    StandardMetadata,
)

ENGINE_ID = "density-standard/1.1.0"
EDITION_NAMESPACE = UUID("6ba7b811-9dad-11d1-80b4-00c04fd430c8")
COVERAGE_THRESHOLD_PERCENT = 60.0
LARGE_BREED_MATURE_WEIGHT_KG = 31.75
_WEEKS_PER_MONTH = 365.25 / 12 / 7
_MASS_IN_GRAMS = {"g": 1.0, "mg": 1e-3, "mcg": 1e-6, "µg": 1e-6}

CATALOG_UNITS: dict[str, str] = {
    "CP": "g",
    "CFa": "g",
    "Arg": "g",
    "His": "g",
    "Ile": "g",
    "Leu": "g",
    "Lys": "g",
    "Met": "g",
    "Phe": "g",
    "Thr": "g",
    "Trp": "g",
    "Val": "g",
    "Cys": "g",
    "Tyr": "g",
    "Tau": "g",
    "LA": "g",
    "ALA": "g",
    "AA": "g",
    "EPA": "g",
    "DHA": "g",
    "Ca": "mg",
    "P": "mg",
    "Mg": "mg",
    "Na": "mg",
    "K": "mg",
    "Cl": "mg",
    "Fe": "mg",
    "Cu": "mg",
    "Zn": "mg",
    "Mn": "mg",
    "I": "mg",
    "Se": "mcg",
    "A": "IU",
    "D": "IU",
    "E": "mg",
    "B1": "mg",
    "B2": "mg",
    "B3": "mg",
    "B4": "mg",
    "B5": "mg",
    "B6": "mg",
    "B7": "mcg",
    "B9": "mcg",
    "B12": "mcg",
}

CATALOG_CODES: dict[str, str] = {
    "CP": "CP",
    "ARG": "Arg",
    "HIS": "His",
    "ILE": "Ile",
    "LEU": "Leu",
    "LYS": "Lys",
    "MET": "Met",
    "PHE": "Phe",
    "THR": "Thr",
    "TRP": "Trp",
    "VAL": "Val",
    "FAT": "CFa",
    "LA": "LA",
    "ALA": "ALA",
    "ARA": "AA",
    "CA": "Ca",
    "P": "P",
    "K": "K",
    "NA": "Na",
    "CL": "Cl",
    "MG": "Mg",
    "FE": "Fe",
    "CU": "Cu",
    "CU_EXTRUDED": "Cu",
    "CU_CANNED": "Cu",
    "MN": "Mn",
    "ZN": "Zn",
    "I": "I",
    "SE": "Se",
    "VITA": "A",
    "VITD": "D",
    "VITE": "E",
    "B1": "B1",
    "B2": "B2",
    "B3": "B3",
    "B4": "B4",
    "B5": "B5",
    "B6": "B6",
    "B9": "B9",
    "B12": "B12",
    "CHOL": "B4",
    "BIOTIN": "B7",
    "TAUR_EXTRUDED": "Tau",
    "TAUR_CANNED": "Tau",
    "TAU": "Tau",
}

DERIVED_SUMS: dict[str, tuple[str, ...]] = {
    "MET_CYS": ("Met", "Cys"),
    "PHE_TYR": ("Phe", "Tyr"),
    "EPA_DHA": ("EPA", "DHA"),
}

RATIOS: dict[str, tuple[str, str]] = {"CA_P": ("Ca", "P")}
SUM_RATIOS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "O6_O3_RATIO": (("LA", "AA"), ("ALA", "EPA", "DHA")),
}
UNMAPPED = frozenset({"VITK", "P_HIGH_SOLUBLE"})
_KNOWN_CODES = frozenset(CATALOG_CODES) | frozenset(DERIVED_SUMS) | frozenset(RATIOS) | frozenset(SUM_RATIOS) | UNMAPPED


class _JsonSource(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    publication_date: str
    url: str


class _DatabaseMeta(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: str
    language: str
    clinical_warning_ru: str
    source: _JsonSource


class _NutrientName(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: str
    name_ru: str


class _Catalogs(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nutrients: list[_NutrientName]


class _ConditionalMaximum(BaseModel):
    model_config = ConfigDict(extra="ignore")

    condition: str
    maximum: float


class _Target(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: str
    category: str
    minimum: float | None
    maximum: float | None
    established: bool
    unit: str
    source_value_text: str | None = None
    note_ru: str | None = None
    maximum_inclusive: bool = True
    conditional_maximums: list[_ConditionalMaximum] = Field(default_factory=list)


class _ProfileSource(BaseModel):
    model_config = ConfigDict(extra="ignore")

    table: str | None = None
    page: int | None = None
    url: str | None = None


class _Profile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: str
    species_code: Literal["dog", "cat"]
    name_ru: str
    physiological_state: str | None = None
    clinician_selectable: bool = True
    calculation_basis: str
    nutrients: list[_Target]
    source: _ProfileSource = _ProfileSource()


class _SpeciesBlock(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nutrient_profiles: list[_Profile]


class _Dataset(BaseModel):
    model_config = ConfigDict(extra="ignore")

    database_meta: _DatabaseMeta
    catalogs: _Catalogs
    species_data: dict[str, _SpeciesBlock]


def _checksum(paths: tuple[Path, ...]) -> str:
    digest = sha256()
    for path in sorted(paths, key=lambda item: item.as_posix()):
        digest.update(f"{path.parent.name}/{path.name}".encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def _published_at(value: str) -> datetime:
    if len(value) == 4 and value.isdigit():
        return datetime(int(value), 1, 1, tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _mass_unit(unit: str) -> str:
    return unit.replace("μ", "µ")


def _scale(value: float | None, source_unit: str, catalog_unit: str) -> float | None:
    if value is None:
        return None
    source_unit = _mass_unit(source_unit)
    catalog_unit = _mass_unit(catalog_unit)
    if source_unit == catalog_unit:
        return value
    if source_unit in _MASS_IN_GRAMS and catalog_unit in _MASS_IN_GRAMS:
        return value * _MASS_IN_GRAMS[source_unit] / _MASS_IN_GRAMS[catalog_unit]
    return None


def _comparison_status(
    value: float,
    minimum: float | None,
    maximum: float | None,
    *,
    maximum_inclusive: bool = True,
) -> AssessmentStatus:
    if minimum is not None and value < minimum and not isclose(value, minimum, rel_tol=1e-12):
        return AssessmentStatus.below_minimum
    if maximum is not None:
        if maximum_inclusive:
            if value > maximum and not isclose(value, maximum, rel_tol=1e-12):
                return AssessmentStatus.above_maximum
        elif value > maximum or isclose(value, maximum, rel_tol=1e-12):
            return AssessmentStatus.above_maximum
    if minimum is None and maximum is None:
        return AssessmentStatus.not_established
    return AssessmentStatus.met


def _life_stage(animal: AnimalProfile) -> str:
    if animal.pregnant or animal.lactating or animal.life_stage in {"gestation", "lactation"}:
        return "reproduction"
    if animal.life_stage == "puppy_kitten" or (animal.age_months is not None and animal.age_months < 12):
        return "growth"
    return "adult"


def _age_weeks(animal: AnimalProfile) -> float | None:
    if animal.age_months is None:
        return None
    return animal.age_months * _WEEKS_PER_MONTH


def _stage_matches(physiological_state: str | None, animal: AnimalProfile) -> bool:
    stage = _life_stage(animal)
    if physiological_state in {None, "all"}:
        return True
    if physiological_state == "growth_reproduction":
        return stage in {"growth", "reproduction"}
    if physiological_state in {"gestation_late", "lactation_peak"}:
        return stage == "reproduction"
    if physiological_state == "growth":
        return stage == "growth"
    if physiological_state not in {"growth_early", "growth_late"}:
        return physiological_state == stage
    if stage != "growth":
        return False
    weeks = _age_weeks(animal)
    if weeks is None:
        return True
    if physiological_state == "growth_early":
        return 4 <= weeks < 14
    return weeks >= 14


def _feed_form_applies(code: str, feed_form: str) -> bool | None:
    if code.endswith("_EXTRUDED"):
        if feed_form == "dry":
            return True
        if feed_form == "wet":
            return False
        return None
    if code.endswith("_CANNED"):
        if feed_form == "wet":
            return True
        if feed_form == "dry":
            return False
        return None
    return True


def _unprocessable(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"code": code, "message": message})


def _missing_foods(ration: RationData, codes: tuple[str, ...]) -> list[str]:
    return [
        food.name
        for food, _grams in ration.foods
        if any(known_value(food, code) is None for code in codes)
    ]


def _catalog_unit(codes: tuple[str, ...]) -> str | None:
    units = {CATALOG_UNITS[code] for code in codes}
    if len(units) != 1:
        return None
    return next(iter(units))


def _ratio_sides(code: str) -> tuple[tuple[str, ...], tuple[str, ...]]:
    if code in RATIOS:
        left, right = RATIOS[code]
        return (left,), (right,)
    return SUM_RATIOS[code]


def _large_breed_calcium(
    target: _Target,
    animal: AnimalProfile,
    maximum: float | None,
    note: str | None,
) -> tuple[float | None, str | None]:
    rule = next(
        (
            item
            for item in target.conditional_maximums
            if "70 lb" in item.condition.casefold() or "31.75" in item.condition
        ),
        None,
    )
    if rule is None or target.code != "CA":
        return maximum, note
    mature = animal.expected_mature_weight_kg
    if _life_stage(animal) != "growth":
        return maximum, note
    if mature is None:
        extra = "Ожидаемая взрослая масса не указана: предел кальция для крупных пород не применён."
        return maximum, f"{note} {extra}".strip() if note else extra
    if mature < LARGE_BREED_MATURE_WEIGHT_KG:
        return maximum, note
    applied = f"Применён предел кальция {rule.maximum:g} г/1000 ккал для щенка крупной породы."
    return rule.maximum, f"{note} {applied}".strip() if note else applied


def _daily_amount(ration: RationData, codes: tuple[str, ...]) -> float | None:
    if _missing_foods(ration, codes):
        return None
    total = 0.0
    for code in codes:
        total += fsum(
            (known_value(food, code) or 0.0) * grams / 100
            for food, grams in ration.foods
        )
    return total


class DensityStandardProvider:
    def __init__(
        self,
        dataset_path: Path,
        *,
        standard_code: str,
        provider_version: str,
        implementation_paths: tuple[Path, ...],
    ) -> None:
        payload = _Dataset.model_validate_json(dataset_path.read_text(encoding="utf-8"))
        self._data = payload
        self._names = {item.code: item.name_ru for item in payload.catalogs.nutrients}
        self._profiles = {
            profile.code: profile
            for species in payload.species_data.values()
            for profile in species.nutrient_profiles
        }
        for profile in self._profiles.values():
            if profile.calculation_basis != "published_per_1000_kcal":
                raise ValueError(f"Unsupported calculation basis {profile.calculation_basis!r} in {profile.code}")
            for target in profile.nutrients:
                if target.code not in _KNOWN_CODES:
                    raise ValueError(f"Nutrient code {target.code!r} has no catalog mapping")
        meta = payload.database_meta
        categories: list[str] = []
        for profile in self._profiles.values():
            for target in profile.nutrients:
                if target.category not in categories:
                    categories.append(target.category)
        source_checksum = sha256(dataset_path.read_bytes()).hexdigest()
        self._metadata = StandardMetadata(
            standard_code=standard_code,
            edition=meta.version,
            import_version=1,
            provider_version=provider_version,
            provider_checksum=_checksum((dataset_path, *implementation_paths)),
            edition_uuid=uuid5(EDITION_NAMESPACE, f"{standard_code}:{meta.version}:{source_checksum}"),
            source_checksum=source_checksum,
            source_title=meta.source.title,
            source_url=meta.source.url,
            publication_date=meta.source.publication_date,
            language=meta.language,
            clinical_warning_ru=meta.clinical_warning_ru,
            published_at=_published_at(meta.source.publication_date),
            normative_categories=tuple(categories),
        )

    @property
    def metadata(self) -> StandardMetadata:
        return self._metadata

    def _edition(self) -> EditionIdentity:
        meta = self._metadata
        return EditionIdentity(
            code=meta.edition,
            source_checksum=meta.source_checksum,
            source_title=meta.source_title,
            source_url=meta.source_url,
            clinical_warning_ru=meta.clinical_warning_ru,
            standard_code=meta.standard_code,
        )

    def _profiles_for(self, species: str) -> tuple[_Profile, ...]:
        return tuple(
            profile
            for profile in self._profiles.values()
            if profile.species_code == species and profile.clinician_selectable
        )

    def _suggest_profile(self, animal: AnimalProfile) -> tuple[_Profile | None, str]:
        matches = [
            profile
            for profile in self._profiles_for(animal.species.value)
            if _stage_matches(profile.physiological_state, animal)
        ]
        if not matches:
            return None, "Для этого вида и стадии жизни в редакции нет профиля."
        if len(matches) > 1:
            return None, "Для этой стадии есть несколько профилей. Выберите профиль по возрасту."
        return matches[0], "Профиль соответствует виду и стадии жизни."

    def validate_profile(self, code: str, animal: AnimalProfile) -> ProfileCompatibility:
        profile = self._profiles.get(code)
        if profile is None or not profile.clinician_selectable:
            return ProfileCompatibility(level="hard", code="profile_not_found", message="Профиль недоступен в выбранной редакции.")
        if profile.species_code != animal.species.value:
            return ProfileCompatibility(level="hard", code="profile_species_mismatch", message="Профиль предназначен для другого вида.")
        if not _stage_matches(profile.physiological_state, animal):
            return ProfileCompatibility(level="hard", code="profile_life_stage_mismatch", message="Профиль несовместим со стадией жизни пациента.")
        suggested, _reason = self._suggest_profile(animal)
        if suggested is not None and suggested.code != code:
            return ProfileCompatibility(level="soft", code="profile_differs_from_recommendation", message="Профиль отличается от рекомендации для этого пациента.")
        return ProfileCompatibility(level="compatible")

    def suggest(self, animal: AnimalProfile) -> SuggestionsResponse:
        profiles = self._profiles_for(animal.species.value)
        suggested, reason = self._suggest_profile(animal)
        category = self._metadata.normative_categories[0] if self._metadata.normative_categories else "minimum"
        return SuggestionsResponse(
            edition=self._edition(),
            profile_options=[
                ProfileSuggestionOption(
                    code=item.code,
                    name_ru=item.name_ru,
                    species=item.species_code,
                    life_stage=item.physiological_state,
                    basis=item.calculation_basis,
                    category=category,
                    compatibility=self.validate_profile(item.code, animal),
                )
                for item in profiles
            ],
            energy_formula_options=[],
            size_class_options=[],
            energy_suggestion=None,
            nutrient_standard_suggestion=ContextSuggestion(code=suggested.code, reason=reason) if suggested else None,
            suggested_profile_code=suggested.code if suggested else None,
            suggested_energy_formula_code=None,
            suggested_size_class_code=None,
            confidence="high" if suggested else "low",
            confidence_ru="высокая уверенность" if suggested else "низкая уверенность",
        )

    def context_options(self, species: Literal["dog", "cat"]) -> StandardContextOptions:
        return StandardContextOptions(
            edition=self._metadata.edition,
            profiles=tuple(ContextOption(item.code, item.name_ru) for item in self._profiles_for(species)),
            energy_formulas=(),
            size_classes=(),
        )

    def _selected_profile(self, payload: AssessmentRequest) -> tuple[_Profile | None, ProfileCompatibility | None]:
        selection = payload.profile_selection
        if selection is None:
            if payload.profile_mode == "manual":
                return None, None
            suggested, _reason = self._suggest_profile(payload.animal)
            return suggested, None
        identity = (self._metadata.standard_code, self._metadata.edition)
        if (selection.standard_code, selection.edition) != identity:
            raise _unprocessable("standard_mismatch", "Выбранный стандарт не соответствует расчётному провайдеру.")
        review = self.validate_profile(selection.profile_code, payload.animal)
        if review.level == "hard":
            raise _unprocessable(review.code or "profile_incompatible", review.message or "Профиль несовместим.")
        if review.comment_required and not (selection.comment and selection.comment.strip()):
            raise _unprocessable("profile_comment_required", review.message or "Укажите комментарий.")
        if selection.source == "recommendation":
            suggested, _reason = self._suggest_profile(payload.animal)
            if suggested is None or suggested.code != selection.profile_code:
                raise _unprocessable("recommendation_changed", "Рекомендация изменилась. Подтвердите профиль вручную.")
        profile = self._profiles.get(selection.profile_code)
        if profile is None:
            raise _unprocessable("profile_not_found", "Профиль недоступен в выбранной редакции.")
        return profile, review

    def assess_prepared(self, request: AssessmentRequest, ration: PreparedRation) -> AssessmentResponse:
        profile, compatibility = self._selected_profile(request)
        energy = ration.requirement
        context = ResolvedContext(
            nutrient_profile_code=profile.code if profile else None,
            profile_selection=request.profile_selection,
            profile_compatibility=compatibility,
            energy_formula_code=energy.energy_formula_code,
            size_class_code=None,
            weight_basis=energy.weight_basis,
            feed_form=request.feed_form,
            therapeutic_goal=request.therapeutic_goal,
            ration_species_mismatch_confirmed=request.ration_species_mismatch_confirmed,
        )
        input_hash = _input_hash(request, self._metadata, ration)
        if profile is None:
            species = request.animal.species.value
            requires_profile = species in {"dog", "cat"} and bool(self._profiles_for(species))
            gate = AssessmentGate(
                code="profile_confirmation_required" if requires_profile else "species_out_of_scope",
                explanation_ru=(
                    "Подтвердите нормативный профиль для оценки рациона."
                    if requires_profile
                    else "В этой редакции нет профиля для выбранного вида."
                ),
            )
            return _empty_response(self._edition(), context, ration, input_hash, gate)
        rows = [
            self._row(target, profile, request, ration.nutrients)
            for target in profile.nutrients
        ]
        compared = [
            row for row in rows
            if row.status not in {AssessmentStatus.not_applicable, AssessmentStatus.not_established}
        ]
        complete = [
            row for row in compared
            if row.status not in {AssessmentStatus.missing_product_data, AssessmentStatus.insufficient_context}
        ]
        percent = (len(complete) / len(compared) * 100) if compared else 0.0
        coverage = CoverageAssessment(
            expected_atomic_count=len(compared),
            complete_atomic_count=len(complete),
            percent=percent,
            below_threshold=percent < COVERAGE_THRESHOLD_PERCENT,
        )
        overall, met_count, below_count, above_count, unevaluable_count = _summary(rows)
        return AssessmentResponse(
            engine_id=ENGINE_ID,
            edition=self._edition(),
            context=context,
            energy=energy,
            coverage=coverage,
            rows=rows,
            met_count=met_count,
            below_minimum_count=below_count,
            above_maximum_count=above_count,
            unevaluable_count=unevaluable_count,
            overall=overall,
            input_hash=input_hash,
            normative_comparison_performed=True,
            ration_energy=ration.energy,
        )

    def _limits(self, target: _Target, animal: AnimalProfile) -> tuple[float | None, float | None, str | None, bool]:
        maximum, note = _large_breed_calcium(target, animal, target.maximum, target.note_ru)
        return target.minimum, maximum, note, target.maximum_inclusive

    def _row(self, target: _Target, profile: _Profile, request: AssessmentRequest, ration: RationData) -> AssessmentRow:
        name = self._names.get(target.code, target.code)
        source = SourceRead(
            title=self._metadata.source_title,
            url=profile.source.url or self._metadata.source_url,
            page=profile.source.page,
            table=profile.source.table,
            row=target.code,
        )
        minimum, maximum, note, maximum_inclusive = self._limits(target, request.animal)
        applicability = _feed_form_applies(target.code, request.feed_form.value)
        if applicability is False:
            return _plain_row(
                target, name, source, AssessmentStatus.not_applicable, note or "Норматив относится к другой форме корма.",
                ration, minimum, maximum,
            )
        if applicability is None:
            return _plain_row(
                target, name, source, AssessmentStatus.insufficient_context,
                "Укажите форму корма: сухой или влажный.", ration, minimum, maximum,
            )
        if target.code in UNMAPPED:
            if target.code == "P_HIGH_SOLUBLE":
                detail = note or (
                    "В каталоге есть общий фосфор, но нет элементарного фосфора из высокорастворимых солей. "
                    "Этот предел не складывается с общим P."
                )
            else:
                detail = note or "Для этого нутриента нет кода в каталоге продуктов."
            return _plain_row(
                target, name, source, AssessmentStatus.insufficient_context, detail, ration, minimum, maximum,
            )
        if target.code == "TAU":
            detail = note or (
                "NRC RA 0,10 г/1000 ккал относится к высокоусвояемым очищенным рационам. "
                "Для сухого и консервированного корма значения NRC заданы в г/кг рациона и не переводятся "
                "без подтверждённой энергетической плотности."
            )
            return _plain_row(
                target, name, source, AssessmentStatus.insufficient_context, detail, ration, minimum, maximum,
            )
        if not target.established:
            return _plain_row(
                target, name, source, AssessmentStatus.not_established,
                note or "Минимум в источнике не установлен.", ration, minimum, maximum,
            )
        if target.code in RATIOS or target.code in SUM_RATIOS:
            return self._ratio_row(target, name, source, note, minimum, maximum, maximum_inclusive, ration)
        codes = DERIVED_SUMS.get(target.code)
        catalog_code = CATALOG_CODES.get(target.code)
        if codes is None and catalog_code is not None:
            codes = (catalog_code,)
        if codes is None:
            return _plain_row(
                target, name, source, AssessmentStatus.insufficient_context,
                "Код нутриента не сопоставлен с каталогом.", ration, minimum, maximum,
            )
        catalog_unit = CATALOG_UNITS[codes[0]]
        if any(CATALOG_UNITS[code] != catalog_unit for code in codes):
            return _plain_row(
                target, name, source, AssessmentStatus.insufficient_context,
                "Слагаемые норматива записаны в разных единицах каталога.", ration, minimum, maximum,
            )
        scaled_minimum = _scale(minimum, target.unit, catalog_unit)
        scaled_maximum = _scale(maximum, target.unit, catalog_unit)
        if (minimum is not None and scaled_minimum is None) or (maximum is not None and scaled_maximum is None):
            return _plain_row(
                target, name, source, AssessmentStatus.insufficient_context,
                f"Единицу норматива ({target.unit}) нельзя привести к единице каталога ({catalog_unit}).",
                ration, minimum, maximum,
            )
        missing = _missing_foods(ration, codes)
        completeness = RowCompleteness(
            complete_components=len(ration.foods) - len(missing),
            total_components=len(ration.foods),
            missing_food_names=missing,
        )
        contributions = [
            NutrientContribution(
                food_uuid=food.uuid,
                daily_amount=(
                    fsum((known_value(food, code) or 0.0) for code in codes) * grams / 100
                    if all(known_value(food, code) is not None for code in codes)
                    else None
                ),
            )
            for food, grams in ration.foods
        ]
        daily = _daily_amount(ration, codes)
        me = ration.totals.get("ME") if "ME" in ration.complete_codes else None
        concentration = daily / me * 1000 if daily is not None and me else None
        if concentration is None:
            row_status = AssessmentStatus.missing_product_data if missing or me is None else AssessmentStatus.insufficient_context
            if me is None and not missing:
                note = "Нет обменной энергии рациона, плотность на 1000 ккал не посчитать."
        else:
            row_status = _comparison_status(
                concentration, scaled_minimum, scaled_maximum, maximum_inclusive=maximum_inclusive,
            )
        return AssessmentRow(
            code=catalog_code or target.code,
            name=name,
            unit=catalog_unit,
            derived=target.code in DERIVED_SUMS,
            ration_per_1000_kcal_me=concentration,
            ration_daily_amount=daily,
            target=_target_read(scaled_minimum, scaled_maximum, catalog_unit, target),
            published_target=_target_read(minimum, maximum, target.unit, target),
            density_status=row_status,
            contributions=contributions,
            status=row_status,
            completeness=completeness,
            source=source,
            note_ru=note,
        )

    def _ratio_row(
        self,
        target: _Target,
        name: str,
        source: SourceRead,
        note: str | None,
        minimum: float | None,
        maximum: float | None,
        maximum_inclusive: bool,
        ration: RationData,
    ) -> AssessmentRow:
        numerator, denominator = _ratio_sides(target.code)
        if _catalog_unit(numerator) is None or _catalog_unit(numerator) != _catalog_unit(denominator):
            return _plain_row(
                target, name, source, AssessmentStatus.insufficient_context,
                "Слагаемые соотношения записаны в разных единицах каталога.", ration, minimum, maximum,
            )
        parts = numerator + denominator
        missing = _missing_foods(ration, parts)
        completeness = RowCompleteness(
            complete_components=len(ration.foods) - len(missing),
            total_components=len(ration.foods),
            missing_food_names=missing,
        )
        numerator_daily = _daily_amount(ration, numerator)
        denominator_daily = _daily_amount(ration, denominator)
        if numerator_daily is None or denominator_daily is None:
            row_status = AssessmentStatus.missing_product_data
            value = None
        elif denominator_daily == 0:
            row_status = AssessmentStatus.insufficient_context
            value = None
            note = "Соотношение не определено: знаменатель равен нулю."
        else:
            value = numerator_daily / denominator_daily
            row_status = _comparison_status(
                value, minimum, maximum, maximum_inclusive=maximum_inclusive,
            )
        return AssessmentRow(
            code=target.code,
            name=name,
            unit=target.unit,
            derived=True,
            ration_per_1000_kcal_me=None,
            ration_ratio=value,
            target=_target_read(minimum, maximum, target.unit, target),
            published_target=_target_read(minimum, maximum, target.unit, target),
            density_status=row_status,
            status=row_status,
            completeness=completeness,
            source=source,
            note_ru=note,
        )


def load_density_provider(
    dataset_path: Path,
    *,
    standard_code: str,
    provider_version: str,
    implementation_paths: tuple[Path, ...],
) -> DensityStandardProvider:
    return DensityStandardProvider(
        dataset_path,
        standard_code=standard_code,
        provider_version=provider_version,
        implementation_paths=implementation_paths,
    )


def _target_read(minimum: float | None, maximum: float | None, unit: str, target: _Target) -> TargetRead:
    return TargetRead(
        minimum=minimum,
        maximum=maximum,
        unit=unit,
        basis="per_1000_kcal_me" if unit != "ratio" else "ratio",
        source_value_text=target.source_value_text,
        category=target.category,
    )


def _plain_row(
    target: _Target,
    name: str,
    source: SourceRead,
    row_status: AssessmentStatus,
    note: str,
    ration: RationData,
    minimum: float | None,
    maximum: float | None,
) -> AssessmentRow:
    return AssessmentRow(
        code=CATALOG_CODES.get(target.code, target.code),
        name=name,
        unit=target.unit,
        derived=target.code in DERIVED_SUMS or target.code in RATIOS or target.code in SUM_RATIOS,
        ration_per_1000_kcal_me=None,
        target=_target_read(minimum, maximum, target.unit, target),
        published_target=_target_read(minimum, maximum, target.unit, target),
        density_status=row_status,
        status=row_status,
        completeness=RowCompleteness(
            complete_components=0,
            total_components=len(ration.foods),
            missing_food_names=[food.name for food, _grams in ration.foods],
        ),
        source=source,
        note_ru=note,
    )


def _summary(rows: list[AssessmentRow]) -> tuple[AssessmentOverall, int, int, int, int]:
    met_count = sum(item.status == AssessmentStatus.met for item in rows)
    below_count = sum(item.status == AssessmentStatus.below_minimum for item in rows)
    above_count = sum(item.status == AssessmentStatus.above_maximum for item in rows)
    verdict_rows = [
        item for item in rows
        if item.target is not None and item.status not in {AssessmentStatus.not_applicable, AssessmentStatus.not_established}
    ]
    blockers = {
        AssessmentStatus.missing_product_data,
        AssessmentStatus.insufficient_context,
    }
    unevaluable_count = sum(item.status in blockers for item in verdict_rows)
    if unevaluable_count or not verdict_rows:
        overall = "indeterminate"
    elif below_count or above_count:
        overall = "inadequate"
    else:
        overall = "adequate"
    return overall, met_count, below_count, above_count, unevaluable_count


def _empty_response(
    edition: EditionIdentity,
    context: ResolvedContext,
    ration: PreparedRation,
    input_hash: str,
    gate: AssessmentGate,
) -> AssessmentResponse:
    return AssessmentResponse(
        engine_id=ENGINE_ID,
        edition=edition,
        context=context,
        energy=ration.requirement,
        coverage=CoverageAssessment(expected_atomic_count=0, complete_atomic_count=0, percent=0, below_threshold=False),
        rows=[],
        met_count=0,
        below_minimum_count=0,
        above_maximum_count=0,
        unevaluable_count=0,
        overall="indeterminate",
        input_hash=input_hash,
        normative_comparison_performed=False,
        gate=gate,
        ration_energy=ration.energy,
    )


def _input_hash(payload: AssessmentRequest, metadata: StandardMetadata, ration: PreparedRation) -> str:
    animal = payload.animal
    normalized = {
        "standard_code": metadata.standard_code,
        "edition": metadata.edition,
        "source_checksum": metadata.source_checksum,
        "provider_checksum": metadata.provider_checksum,
        "animal": animal.model_dump(mode="json"),
        "profile_mode": payload.profile_mode,
        "profile_selection": payload.profile_selection.model_dump(mode="json") if payload.profile_selection else None,
        "feed_form": payload.feed_form.value,
        "therapeutic_goal": payload.therapeutic_goal,
        "ration": sorted(
            ({"food_uuid": str(item.food_uuid), "grams": item.grams} for item in payload.components),
            key=lambda item: item["food_uuid"],
        ),
        "food_values": {
            str(food.uuid): {
                code: (item.value, item.value_status)
                for code, item in food.values.items()
            }
            for food in ration.foods_by_id.values()
        },
    }
    canonical = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return sha256(canonical.encode()).hexdigest()
