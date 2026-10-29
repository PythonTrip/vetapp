"""Visit lifecycle and privacy checks against an isolated store and filesystem."""
from uuid import UUID, uuid4
from datetime import datetime

import pytest
from sqlalchemy import func, select

from tests.test_owner_cabinet import cabinet, register  # noqa: F401
from vetdietderm_api.appointments.models import Appointment
from vetdietderm_api.attachments import storage
from vetdietderm_api.attachments.models import Attachment
from vetdietderm_api.owners.models import OwnerRegistration
from vetdietderm_api.visits.models import VisitRequest


@pytest.fixture
def visits(cabinet, monkeypatch, tmp_path):
    staff, owner, factory, user = cabinet
    monkeypatch.setattr(storage, "attachment_root", lambda: tmp_path)
    code = staff.get("/join-codes/current").json()["code"]
    assert register(owner, code).status_code == 201
    animal = owner.post("/owner/animals", json={"name": "Тузик", "species": "dog"}).json()
    return staff, owner, factory, user, animal, tmp_path


def request_visit(owner, animal, **changes):
    return owner.post(f"/owner/animals/{animal['uuid']}/visits", json={
        "visit_type": "supervision", "proposed_starts_at": "2026-11-01T10:00:00Z", **changes})


def confirm(staff, visit, **changes):
    return staff.post(f"/visit-requests/{visit['uuid']}/confirm", json={
        "starts_at": "2026-11-02T12:00:00Z", "duration_min": 45,
        "registration": {"mode": "create"}, **changes})


def test_snapshot_required_answers_and_no_schedule_entry(visits):
    staff, owner, factory, _, animal, _ = visits
    result = staff.put("/visit-questionnaires/primary", json={"questions": [
        {"kind": "text", "label": "Причина"},
        {"kind": "single_select", "label": "Аппетит", "options": [
            {"value": "ok", "label": "Хороший"}, {"value": "bad", "label": "Плохой"}]}]})
    assert result.status_code == 200, result.text
    questions = owner.get("/owner/visit-questions/primary").json()
    one = [{"question_id": questions[0]["uuid"], "value": "  зуд  "}]
    assert request_visit(owner, animal, visit_type="primary", answers=one).status_code == 422
    both = one + [{"question_id": questions[1]["uuid"], "value": "ok"}]
    submitted = request_visit(owner, animal, visit_type="primary", answers=both)
    assert submitted.status_code == 201, submitted.text
    original = submitted.json()["answers"]
    assert original[0]["value"] == "зуд"
    assert original[1]["options"][0]["label"] == "Хороший"
    assert staff.put("/visit-questionnaires/primary", json={"questions": []}).status_code == 200
    stored = owner.get(f"/owner/animals/{animal['uuid']}/visits").json()[0]
    assert stored["answers"] == original
    assert request_visit(owner, animal).status_code == 201
    assert staff.get("/appointments", params={"from": "2026-11-01T00:00:00Z", "to": "2026-11-02T00:00:00Z"}).json() == []
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0


@pytest.mark.parametrize("kind,options,valid,invalid", [
    ("binary", [], "no", ["", True, "maybe", []]),
    ("single_select", [{"value": "a", "label": "А"}, {"value": "b", "label": "Б"}], "a", ["c", [], True]),
    ("multi_select", [{"value": "a", "label": "А"}, {"value": "b", "label": "Б"}], ["a", "b"], [[], ["c"], ["a", "a"], "a", [True], [{}]]),
    ("number", [], 0, ["1", True, None, [], "Infinity"]),
    ("text", [], "ответ", ["   ", 1, "x" * 4001]),
    ("date", [], "2026-11-01", ["2026-02-30", "20261101", "", 1]),
])
def test_answer_shapes(visits, kind, options, valid, invalid):
    staff, owner, _, _, animal, _ = visits
    q = staff.put("/visit-questionnaires/primary", json={"questions": [
        {"kind": kind, "label": "Вопрос", "options": options}]}).json()["questions"][0]
    for value in invalid:
        result = request_visit(owner, animal, visit_type="primary", answers=[{"question_id": q["uuid"], "value": value}])
        assert result.status_code == 422, result.text
    assert request_visit(owner, animal, visit_type="primary", answers=[{"question_id": q["uuid"], "value": valid}]).status_code == 201


def test_files_survive_reject_withdraw_and_private_boundaries(visits):
    staff, owner, factory, user, animal, _ = visits
    visit = request_visit(owner, animal).json()
    url = f"/owner/visits/{visit['uuid']}/files"
    assert owner.post(url, files={"file": ("large.pdf", b"x" * (9 * 1024 * 1024), "application/pdf")}).status_code == 413
    assert owner.post(url, files={"file": ("file.svg", b"bad", "image/svg+xml")}).status_code == 400
    payload = b"jpeg" * (2 * 1024 * 1024)
    upload = owner.post(url, files={"file": ("photo.jpg", payload, "image/jpeg")})
    assert upload.status_code == 201, upload.text
    file_id = upload.json()["uuid"]
    assert staff.get(f"/visit-requests/{visit['uuid']}/files/{file_id}").content == payload
    rejected = staff.post(f"/visit-requests/{visit['uuid']}/reject", json={"reason": "  Выберите другой день  "})
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["rejection_reason"] == "Выберите другой день"
    assert owner.get(f"{url}/{file_id}").content == payload
    assert confirm(staff, visit).status_code == 409
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0
    # A staff account from another practice has no read or write access.
    user["user_id"] = str(uuid4())
    assert staff.get(f"/visit-requests/{visit['uuid']}/files/{file_id}").status_code == 403
    assert staff.get("/visit-requests").json() == []
    owner.post("/owner/logout")
    code = staff.get("/join-codes/current").json()["code"]
    register(owner, code, "other@example.com")
    assert owner.get(f"{url}/{file_id}").status_code == 404
    assert owner.post(f"/owner/visits/{visit['uuid']}/withdraw").status_code == 404


def test_confirmation_acceptance_transfer_and_appointment_sync(visits):
    staff, owner, factory, _, animal, _ = visits
    visit = request_visit(owner, animal).json()
    queued = staff.get("/visit-requests?status=requested").json()[0]
    assert queued["registration_status"] == "pending" and queued["can_write"] is True
    url = f"/owner/visits/{visit['uuid']}/files"
    file = owner.post(url, files={"file": ("photo.jpg", b"photo", "image/jpeg")}).json()
    assert confirm(staff, visit, registration=None).status_code == 422
    result = confirm(staff, visit)
    assert result.status_code == 200, result.text
    scheduled = result.json()
    assert scheduled["status"] == "scheduled"
    assert scheduled["proposed_starts_at"].startswith("2026-11-01T10:00")
    assert scheduled["confirmed_starts_at"].startswith("2026-11-02T12:00")
    assert confirm(staff, visit).status_code == 409
    assert staff.get("/visit-requests?status=requested").json() == []
    with factory() as db:
        assert db.scalar(select(OwnerRegistration)).status == "accepted"
        assert db.scalar(select(func.count()).select_from(Appointment)) == 1
        attachment = db.scalar(select(Attachment))
        assert attachment.owner_visible and attachment.uploaded_by_owner
        appointment = db.scalar(select(Appointment))
        assert appointment.duration_min == 45 and appointment.visit_type == "supervision"
        appointment_id = str(appointment.uuid)
    patient = owner.get("/owner/animals").json()[0]
    listing = f"/owner/animals/{patient['uuid']}/visits"
    assert owner.get(listing).json()[0]["uuid"] == visit["uuid"]
    assert owner.get(f"{url}/{file['uuid']}").content == b"photo"
    updated = staff.patch(f"/appointments/{appointment_id}", json={"starts_at": "2026-11-03T13:00:00Z", "duration_min": 60})
    assert updated.status_code == 200, updated.text
    assert owner.get(listing).json()[0]["confirmed_starts_at"].startswith("2026-11-03T13:00")
    for status in ("completed", "no_show", "scheduled"):
        assert staff.patch(f"/appointments/{appointment_id}", json={"status": status}).status_code == 200
        public = owner.get(listing).json()[0]
        assert public["status"] == status
        assert not {"encounter_uuid", "anamnesis", "exam", "diagnoses", "notes", "prescriptions"} & public.keys()
    assert owner.post(f"/owner/visits/{visit['uuid']}/cancel").json()["status"] == "cancelled"
    assert staff.get(f"/appointments/{appointment_id}").json()["status"] == "cancelled"
    second = request_visit(owner, patient).json()
    assert owner.post(f"/owner/visits/{second['uuid']}/withdraw").json()["status"] == "withdrawn"
    assert staff.get("/visit-requests?status=requested").json() == []
    third = request_visit(owner, patient).json()
    copied = owner.post(f"/owner/visits/{third['uuid']}/files", files={"file": ("note.pdf", b"pdf", "application/pdf")})
    assert copied.status_code == 201, copied.text
    assert confirm(staff, third, registration=None).status_code == 200
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Attachment)) == 2
    assert request_visit(owner, patient, confirmed_starts_at="2026-11-05T00:00:00Z").status_code == 422
    assert request_visit(owner, patient, duration_min=20).status_code == 422


def test_confirmation_rolls_back_acceptance_and_appointment_if_file_missing(visits):
    staff, owner, factory, _, animal, root = visits
    visit = request_visit(owner, animal).json()
    owner.post(f"/owner/visits/{visit['uuid']}/files", files={"file": ("photo.jpg", b"photo", "image/jpeg")})
    for file in root.iterdir():
        file.unlink()
    assert confirm(staff, visit).status_code == 404
    with factory() as db:
        assert db.scalar(select(OwnerRegistration)).status == "pending"
        assert db.scalar(select(VisitRequest)).status == "requested"
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0
        assert db.scalar(select(func.count()).select_from(Attachment)) == 0
    assert staff.get("/patients").json() == []


def test_observer_and_legacy_appointment_types(visits):
    staff, owner, factory, user, _, _ = visits
    owner.post("/owner/logout")
    org_headers = {"X-Vetapp-Workspace": "organization"}
    code = staff.get("/join-codes/current", headers=org_headers).json()["code"]
    assert register(owner, code, "org@example.com").status_code == 201
    animal = owner.post("/owner/animals", json={"name": "Мурка", "species": "cat"}).json()
    visit = request_visit(owner, animal).json()
    file = owner.post(f"/owner/visits/{visit['uuid']}/files", files={"file": ("photo.jpg", b"photo", "image/jpeg")}).json()
    user["organization"]["org_role"] = "observer"
    queued = staff.get("/visit-requests?status=requested", headers=org_headers).json()
    assert queued[0]["can_write"] is False
    assert staff.get(f"/visit-requests/{visit['uuid']}/files/{file['uuid']}", headers=org_headers).content == b"photo"
    assert confirm(staff, visit).status_code == 403
    assert staff.post(f"/visit-requests/{visit['uuid']}/reject", json={}).status_code == 403
    user["organization"]["org_role"] = "member"
    # Confirm follows the invitation even when personal workspace is selected.
    assert confirm(staff, visit).status_code == 200
    patient = owner.get("/owner/animals").json()[0]
    body = {"patient_uuid": patient["uuid"], "starts_at": "2026-11-03T10:00:00Z", "duration_min": 30}
    for kind in ("recheck", "procedure", "telemedicine"):
        assert staff.post("/appointments", headers=org_headers, json={**body, "visit_type": kind}).status_code == 422
    for kind in ("primary", "secondary", "consultation", "supervision"):
        assert staff.post("/appointments", headers=org_headers, json={**body, "visit_type": kind}).status_code == 201
    with factory() as db:
        appointment = Appointment(**{**body, "patient_uuid": UUID(patient["uuid"]),
            "starts_at": datetime.fromisoformat(body["starts_at"]),
            "visit_type": "recheck", "status": "scheduled", "tenant_id": UUID(user["organization"]["org_id"]), "created_by": UUID(user["user_id"])})
        db.add(appointment); db.commit()
        appointment_id = str(appointment.uuid)
    assert staff.get(f"/appointments/{appointment_id}", headers=org_headers).json()["visit_type"] == "recheck"
    assert staff.patch(f"/appointments/{appointment_id}", headers=org_headers, json={"starts_at": "2026-11-05T10:00:00Z", "visit_type": "recheck"}).status_code == 200
    assert staff.patch(f"/appointments/{appointment_id}", headers=org_headers, json={"visit_type": "procedure"}).status_code == 422
    assert staff.patch(f"/appointments/{appointment_id}", headers=org_headers, json={"visit_type": "secondary"}).status_code == 200


def test_request_survives_separate_acceptance_linking_and_withdrawal(visits):
    staff, owner, factory, _, animal, _ = visits
    visit = request_visit(owner, animal).json()
    file = owner.post(f"/owner/visits/{visit['uuid']}/files", files={"file": ("photo.jpg", b"photo", "image/jpeg")}).json()
    client = staff.post("/clients", json={"name": "Существующий владелец"}).json()
    patient = staff.post("/patients", json={"name": "Пациент", "species": "dog", "client_uuid": client["uuid"]}).json()
    registration = staff.get("/owner-registrations").json()[0]
    accepted = staff.post(f"/owner-registrations/{registration['uuid']}/accept", json={
        "mode": "link", "client_uuid": client["uuid"],
        "matches": [{"owner_animal_id": animal["uuid"], "patient_uuid": patient["uuid"]}]})
    assert accepted.status_code == 200, accepted.text
    listing = f"/owner/animals/{patient['uuid']}/visits"
    assert owner.get(listing).json()[0]["uuid"] == visit["uuid"]
    assert staff.get("/visit-requests?status=requested").json()[0]["registration_status"] == "accepted"
    result = confirm(staff, visit, registration=None)
    assert result.status_code == 200, result.text
    assert result.json()["patient_uuid"] == patient["uuid"]
    assert len(staff.get("/clients").json()) == 1
    with factory() as db:
        assert db.scalar(select(Attachment)).patient_uuid == UUID(patient["uuid"])
    assert owner.get(f"/owner/visits/{visit['uuid']}/files/{file['uuid']}").content == b"photo"
    second = request_visit(owner, patient).json()
    second_file = owner.post(f"/owner/visits/{second['uuid']}/files", files={"file": ("doc.pdf", b"pdf", "application/pdf")}).json()
    assert owner.post(f"/owner/visits/{second['uuid']}/withdraw").status_code == 200
    assert owner.get(f"/owner/visits/{second['uuid']}/files/{second_file['uuid']}").content == b"pdf"


def test_confirm_link_payload_is_atomic_and_invalid_duration_does_not_accept(visits):
    staff, owner, factory, _, animal, _ = visits
    visit = request_visit(owner, animal).json()
    for duration in (4, 481):
        assert confirm(staff, visit, duration_min=duration).status_code == 422
    assert confirm(staff, visit, registration={"mode": "link", "client_uuid": str(uuid4())}).status_code == 404
    with factory() as db:
        assert db.scalar(select(OwnerRegistration)).status == "pending"
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0
    client = staff.post("/clients", json={"name": "Существующий владелец"}).json()
    patient = staff.post("/patients", json={"name": "Пациент", "species": "dog", "client_uuid": client["uuid"]}).json()
    result = confirm(staff, visit, registration={"mode": "link", "client_uuid": client["uuid"],
        "matches": [{"owner_animal_id": animal["uuid"], "patient_uuid": patient["uuid"]}]})
    assert result.status_code == 200, result.text
    assert result.json()["patient_uuid"] == patient["uuid"]
    assert len(staff.get("/clients").json()) == 1
