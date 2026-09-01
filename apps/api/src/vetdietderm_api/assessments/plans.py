from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from vetdietderm_api.assessments import repository
from vetdietderm_api.assessments.engine import assess_nutrition
from vetdietderm_api.assessments.models import DietPlan, utc_now
from vetdietderm_api.assessments.schemas import (
    AssessmentSnapshot,
    DietPlanRead,
    DietPlanRationComponent,
    DietPlanSummary,
    DietPlanWrite,
    PatientPlanReference,
)
from vetdietderm_api.patients.models import Patient

LIST_CAP = 50
LEGACY_ENERGY_ADJUSTMENT_PERCENT = 100.0


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="План питания не найден")


def _validate_patient(session: Session, patient_uuid: UUID | None) -> Patient | None:
    if patient_uuid is None:
        return None
    patient = session.get(Patient, patient_uuid)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Указанный пациент не найден",
        )
    return patient


def _compute_snapshot(
    session: Session,
    payload: DietPlanWrite,
) -> tuple[list[dict[str, object]], dict[str, object]]:
    request = payload.assessment_request
    guideline = repository.load_published_guideline(session)
    foods = repository.load_foods(session, [item.food_uuid for item in request.components])
    assessment = assess_nutrition(request, guideline, foods)
    ration = [
        DietPlanRationComponent(
            food_uuid=item.food_uuid,
            grams=item.grams,
            food_name=foods[item.food_uuid].name,
            food_type=foods[item.food_uuid].type,
            feed_form=foods[item.food_uuid].feed_form,
        ).model_dump(mode="json")
        for item in request.components
    ]
    snapshot = AssessmentSnapshot(
        request=request,
        assessment=assessment,
        nutrient_profile_code=assessment.context.nutrient_profile_code,
        energy_formula_code=assessment.context.energy_formula_code,
    ).model_dump(mode="json")
    return ration, snapshot


def _plan_stmt():
    return select(DietPlan).options(joinedload(DietPlan.patient))


def get_plan(session: Session, plan_uuid: UUID) -> DietPlan:
    plan = session.scalars(_plan_stmt().where(DietPlan.uuid == plan_uuid)).one_or_none()
    if plan is None:
        raise _not_found()
    return plan


def _patient_reference(patient: Patient | None) -> PatientPlanReference | None:
    if patient is None:
        return None
    return PatientPlanReference(uuid=patient.uuid, name=patient.name)


def _legacy_compatible_snapshot(snapshot_json: dict[str, object]) -> dict[str, object]:
    """Map nullable legacy fields without mutating or recalculating the stored snapshot."""
    snapshot = dict(snapshot_json)

    request = snapshot.get("request")
    if isinstance(request, dict) and request.get("energy_adjustment_percent") is None:
        snapshot["request"] = {
            **request,
            "energy_adjustment_percent": LEGACY_ENERGY_ADJUSTMENT_PERCENT,
        }

    assessment = snapshot.get("assessment")
    if isinstance(assessment, dict):
        energy = assessment.get("energy")
        if isinstance(energy, dict) and energy.get("energy_adjustment_percent") is None:
            snapshot["assessment"] = {
                **assessment,
                "energy": {
                    **energy,
                    "energy_adjustment_percent": LEGACY_ENERGY_ADJUSTMENT_PERCENT,
                },
            }

    return snapshot


def _snapshot_from_plan(plan: DietPlan) -> AssessmentSnapshot:
    return AssessmentSnapshot.model_validate(
        _legacy_compatible_snapshot(plan.assessment_snapshot_json)
    )


def to_read(plan: DietPlan) -> DietPlanRead:
    snapshot = _snapshot_from_plan(plan)
    return DietPlanRead(
        uuid=plan.uuid,
        name=plan.name,
        patient_uuid=plan.patient_uuid,
        patient=_patient_reference(plan.patient),
        ration=[DietPlanRationComponent.model_validate(item) for item in plan.ration_json],
        assessment_snapshot=snapshot,
        engine_id=snapshot.assessment.engine_id,
        edition_code=snapshot.assessment.edition.code,
        edition_source_checksum=snapshot.assessment.edition.source_checksum,
        notes=plan.notes,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


def to_summary(plan: DietPlan) -> DietPlanSummary:
    snapshot = _snapshot_from_plan(plan)
    return DietPlanSummary(
        uuid=plan.uuid,
        name=plan.name,
        patient_uuid=plan.patient_uuid,
        patient=_patient_reference(plan.patient),
        engine_id=snapshot.assessment.engine_id,
        edition_code=snapshot.assessment.edition.code,
        edition_source_checksum=snapshot.assessment.edition.source_checksum,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


def list_plans(session: Session, patient_uuid: UUID | None) -> list[DietPlan]:
    stmt = _plan_stmt()
    if patient_uuid is not None:
        stmt = stmt.where(DietPlan.patient_uuid == patient_uuid)
    stmt = stmt.order_by(DietPlan.updated_at.desc()).limit(LIST_CAP)
    return list(session.scalars(stmt).unique().all())


def create_plan(session: Session, payload: DietPlanWrite) -> DietPlan:
    patient = _validate_patient(session, payload.patient_uuid)
    ration, snapshot = _compute_snapshot(session, payload)
    plan = DietPlan(
        name=payload.name,
        patient_uuid=payload.patient_uuid,
        patient=patient,
        ration_json=ration,
        assessment_snapshot_json=snapshot,
        notes=payload.notes,
    )
    session.add(plan)
    session.commit()
    return get_plan(session, plan.uuid)


def update_plan(session: Session, plan_uuid: UUID, payload: DietPlanWrite) -> DietPlan:
    plan = get_plan(session, plan_uuid)
    patient = _validate_patient(session, payload.patient_uuid)
    ration, snapshot = _compute_snapshot(session, payload)
    plan.name = payload.name
    plan.patient_uuid = payload.patient_uuid
    plan.patient = patient
    plan.ration_json = ration
    plan.assessment_snapshot_json = snapshot
    plan.notes = payload.notes
    plan.updated_at = utc_now()
    session.commit()
    return get_plan(session, plan.uuid)
