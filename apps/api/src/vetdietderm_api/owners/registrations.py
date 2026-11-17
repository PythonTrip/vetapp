"""Match owner registrations to clinical clients and patients."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from vetdietderm_api.clock import utc_now
from vetdietderm_api.owners import repository
from vetdietderm_api.owners.models import OwnerAnimal, OwnerRegistration
from vetdietderm_api.owners.schemas import RegistrationAccept, RegistrationAccepted
from vetdietderm_api.patients.models import Client, Patient


def accept_registration(session: Session, registration_id: UUID, payload: RegistrationAccept, user: dict) -> OwnerRegistration:
    """Accept in the invitation workspace using the verified staff identity.

    Flush only so visit confirmation can own the transaction commit.
    All owner writes lock the same registration before changing contacts or passports.
    """
    registration, owner, code = repository.registration_context(session, registration_id, lock=True)
    repository.authorize_registration(code, user, write=True)
    if registration.status != "pending":
        raise HTTPException(409, "Регистрация уже принята")
    animals = list(session.scalars(select(OwnerAnimal).where(
        OwnerAnimal.registration_uuid == registration.uuid).order_by(OwnerAnimal.uuid)))
    animal_ids = {animal.uuid for animal in animals}
    matches = {match.owner_animal_id: match.patient_uuid for match in payload.matches}
    patient_ids = [match.patient_uuid for match in payload.matches if match.patient_uuid]
    if len(matches) != len(payload.matches) or not set(matches) <= animal_ids or len(patient_ids) != len(set(patient_ids)):
        raise HTTPException(422, "Проверьте сопоставления: каждое животное и пациент выбираются только один раз")
    if payload.mode == "create" and (payload.client_uuid or patient_ids):
        raise HTTPException(422, "Для нового клиента нельзя выбрать существующих пациентов")
    if payload.mode == "link" and not payload.client_uuid:
        raise HTTPException(422, "Выберите существующего клиента")
    client = repository.linked_client(session, payload.client_uuid, code) if payload.mode == "link" else Client(
        name=owner.name, email=owner.email, phone=owner.phone,
        tenant_id=code.tenant_id, created_by=code.doctor_user_id)
    # Validate every match before making changes.
    patients = {}
    for patient_id in patient_ids:
        patient = session.scalar(select(Patient).where(Patient.uuid == patient_id,
            Patient.client_uuid == client.uuid, repository.workspace_filter(Patient, code)).with_for_update())
        if patient is None:
            raise HTTPException(422, "Пациент не принадлежит выбранному клиенту")
        patients[patient_id] = patient
    if payload.mode == "create":
        session.add(client)
        session.flush()
    for animal in animals:
        patient = patients.get(matches.get(animal.uuid))
        if patient is None:
            patient = Patient(client_uuid=client.uuid, tenant_id=code.tenant_id, created_by=code.doctor_user_id)
            session.add(patient)
        for key in ("name", "species", "breed", "sex", "birth_date"):
            setattr(patient, key, getattr(animal, key))
        patient.updated_at = utc_now()
        session.flush()
        animal.patient_uuid = patient.uuid
        from vetdietderm_api.chat.repository import link_thread
        link_thread(session, animal.uuid, patient.uuid)
    registration.client_uuid = client.uuid
    registration.status = "accepted"
    registration.accepted_at = utc_now()
    session.flush()
    return registration


def accept_and_commit(db: Session, registration_id: UUID, body: RegistrationAccept, user: dict) -> RegistrationAccepted:
    registration = accept_registration(db, registration_id, body, user)
    db.commit()
    return RegistrationAccepted(uuid=registration.uuid, client_uuid=registration.client_uuid, status=registration.status)
