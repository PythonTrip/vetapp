from typing import Annotated, Literal

from fastapi import APIRouter, Query
from loguru import logger

from vetdietderm_api.guidelines.schemas import (
    ActiveGuidelineRead,
    ContextOptionRead,
    EnergyFormulaOptionRead,
    GuidelineContextOptionsRead,
    SizeClassOptionRead,
)
from vetdietderm_api.standards import STANDARD_REGISTRY

router = APIRouter(prefix="/guidelines", tags=["guidelines"])


@router.get("/active", response_model=ActiveGuidelineRead)
@logger.catch(reraise=True)
def read_active_guideline() -> ActiveGuidelineRead:
    metadata = STANDARD_REGISTRY.active().metadata
    return ActiveGuidelineRead(
        edition_uuid=metadata.edition_uuid,
        standard_code=metadata.standard_code,
        code=metadata.edition,
        import_version=metadata.import_version,
        provider_version=metadata.provider_version,
        provider_checksum=metadata.provider_checksum,
        source_checksum=metadata.source_checksum,
        source_title=metadata.source_title,
        source_url=metadata.source_url,
        publication_date=metadata.publication_date,
        language=metadata.language,
        clinical_warning_ru=metadata.clinical_warning_ru,
        published_at=metadata.published_at,
    )


@router.get("/context-options", response_model=GuidelineContextOptionsRead)
@logger.catch(reraise=True)
def read_context_options(
    species: Annotated[Literal["dog", "cat"], Query()],
) -> GuidelineContextOptionsRead:
    options = STANDARD_REGISTRY.active().context_options(species)
    return GuidelineContextOptionsRead(
        edition_code=options.edition,
        profile_options=[
            ContextOptionRead(code=item.code, name_ru=item.name_ru) for item in options.profiles
        ],
        energy_formula_options=[
            EnergyFormulaOptionRead(
                code=item.code,
                name_ru=item.name_ru,
                required_animal_fields=item.required_animal_fields,
                result_kind=item.result_kind,
                allowed_weight_bases=item.allowed_weight_bases,
            )
            for item in options.energy_formulas
        ],
        size_class_options=[
            SizeClassOptionRead(
                code=item.code,
                name_ru=item.name_ru,
                min_adult_weight_kg=(
                    float(item.min_adult_weight_kg)
                    if item.min_adult_weight_kg is not None
                    else None
                ),
                max_adult_weight_kg=(
                    float(item.max_adult_weight_kg)
                    if item.max_adult_weight_kg is not None
                    else None
                ),
            )
            for item in options.size_classes
        ],
    )
