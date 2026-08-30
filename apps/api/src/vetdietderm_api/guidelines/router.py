from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from loguru import logger
from sqlalchemy import select
from sqlalchemy.orm import Session

from vetdietderm_api.db import get_session
from vetdietderm_api.guidelines.models import (
    EnergyFormula,
    GrowthSizeClass,
    GuidelineEdition,
    GuidelineProfile,
    GuidelineStandard,
)
from vetdietderm_api.guidelines.schemas import (
    ActiveGuidelineRead,
    ContextOptionRead,
    EnergyFormulaOptionRead,
    GuidelineContextOptionsRead,
    SizeClassOptionRead,
)

SessionDep = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/guidelines", tags=["guidelines"])


@router.get("/active", response_model=ActiveGuidelineRead)
@logger.catch(reraise=True)
def read_active_guideline(session: SessionDep) -> ActiveGuidelineRead:
    row = session.execute(
        select(GuidelineEdition, GuidelineStandard.code)
        .join(GuidelineStandard, GuidelineEdition.standard_uuid == GuidelineStandard.uuid)
        .where(
            GuidelineStandard.code == "fediaf",
            GuidelineEdition.status == "published",
        )
        .order_by(GuidelineEdition.published_at.desc())
        .limit(1)
    ).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "guideline_not_published",
                "message": "Опубликованная редакция FEDIAF не найдена",
            },
        )
    edition, standard_code = row
    if edition.published_at is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "guideline_not_published",
                "message": "Опубликованная редакция FEDIAF не найдена",
            },
        )
    return ActiveGuidelineRead(
        edition_uuid=edition.uuid,
        standard_code=standard_code,
        code=edition.code,
        import_version=edition.import_version,
        source_checksum=edition.source_checksum,
        source_title=edition.source_title,
        source_url=edition.source_url,
        publication_date=edition.publication_date,
        language=edition.language,
        clinical_warning_ru=edition.clinical_warning_ru,
        published_at=edition.published_at,
    )


@router.get("/context-options", response_model=GuidelineContextOptionsRead)
@logger.catch(reraise=True)
def read_context_options(
    session: SessionDep,
    species: Annotated[Literal["dog", "cat"], Query()],
) -> GuidelineContextOptionsRead:
    edition = session.scalars(
        select(GuidelineEdition)
        .join(GuidelineStandard, GuidelineEdition.standard_uuid == GuidelineStandard.uuid)
        .where(
            GuidelineStandard.code == "fediaf",
            GuidelineEdition.status == "published",
        )
        .order_by(GuidelineEdition.published_at.desc())
        .limit(1)
    ).one_or_none()
    if edition is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "guideline_not_published",
                "message": "Опубликованная редакция FEDIAF не найдена",
            },
        )

    profiles = list(
        session.scalars(
            select(GuidelineProfile)
            .where(
                GuidelineProfile.edition_uuid == edition.uuid,
                GuidelineProfile.species_code == species,
                GuidelineProfile.clinician_selectable.is_(True),
            )
            .order_by(GuidelineProfile.code)
        )
    )
    formulas = list(
        session.scalars(
            select(EnergyFormula)
            .where(
                EnergyFormula.edition_uuid == edition.uuid,
                EnergyFormula.species_code == species,
                EnergyFormula.active.is_(True),
            )
            .order_by(EnergyFormula.code)
        )
    )
    size_classes = list(
        session.scalars(
            select(GrowthSizeClass)
            .where(
                GrowthSizeClass.edition_uuid == edition.uuid,
                GrowthSizeClass.species_code == species,
            )
            .order_by(GrowthSizeClass.min_adult_weight_kg, GrowthSizeClass.code)
        )
    )
    return GuidelineContextOptionsRead(
        edition_code=edition.code,
        profile_options=[
            ContextOptionRead(code=item.code, name_ru=item.name_ru) for item in profiles
        ],
        energy_formula_options=[
            EnergyFormulaOptionRead(
                code=item.code,
                name_ru=item.name_ru,
                required_animal_fields=item.required_animal_fields,
                result_kind=item.result_kind,
                allowed_weight_bases=item.allowed_weight_bases,
            )
            for item in formulas
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
            for item in size_classes
        ],
    )
