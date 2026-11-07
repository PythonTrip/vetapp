"""Visit lifecycle and privacy checks against an isolated store and filesystem."""
from decimal import Decimal
from uuid import UUID, uuid4
from datetime import datetime

import pytest
from sqlalchemy import func, select

from tests.test_owner_cabinet import cabinet, register  # noqa: F401
from vetdietderm_api.appointments.models import Appointment
from vetdietderm_api.attachments import storage
from vetdietderm_api.attachments.models import Attachment
from vetdietderm_api.owners.models import OwnerAccount, OwnerRegistration
from vetdietderm_api.visits.models import VisitRequest, VisitRequestFile
from vetdietderm_api.visits import repository as visits_repo


@pytest.mark.parametrize("workspace", ["personal", "organization"])
@pytest.mark.parametrize("content_type,payload", [("image/jpeg", b"photo"), ("application/pdf", b"pdf")])
def test_gallery_copy_uses_invitation_workspace(cabinet, monkeypatch, tmp_path, workspace, content_type, payload):
    staff, owner, factory, user = cabinet
    staff.visit_factory = factory
    monkeypatch.setattr(storage, "attachment_root", lambda: tmp_path)
    headers = {"X-Vetapp-Workspace": workspace}
    code = staff.get("/join-codes/current", headers=headers).json()["code"]
    doctor_id = UUID(user["user_id"])
    tenant_id = UUID(user["organization"]["org_id"])
    assert register(owner, code).status_code == 201
    animal = owner.post("/owner/animals", json={"name": "Тузик", "species": "dog"}).json()
    visit = request_visit(owner, animal).json()
    url = f"/owner/visits/{visit['uuid']}/files"
    uploaded = owner.post(url, files={"file": ("file", payload, content_type)})
    assert uploaded.status_code == 201, uploaded.text
    # In an organization, a colleague can confirm while personal workspace is selected.
    if workspace == "organization":
        user["user_id"] = str(uuid4())
    result = confirm_legacy(staff, visit)
    assert result.status_code == 200, result.text
    patient = owner.get("/owner/animals").json()[0]
    gallery_url = f"/patients/{patient['uuid']}/attachments"

    def assert_copy(expected_payload):
        response = staff.get(gallery_url, headers=headers)
        assert response.status_code == 200, response.text
        copies = response.json()
        matches = []
        for item in copies:
            downloaded = staff.get(f"/attachments/{item['uuid']}/file", headers=headers)
            assert downloaded.status_code == 200, downloaded.text
            if downloaded.content == expected_payload:
                matches.append(item)
        assert len(matches) == 1
        copy = matches[0]
        assert copy["owner_visible"] and copy["uploaded_by_owner"]
        public = owner.get(f"/owner/animals/{patient['uuid']}/files")
        assert public.status_code == 200, public.text
        assert copy["uuid"] in [item["uuid"] for item in public.json()]
        with factory() as db:
            row = db.get(Attachment, UUID(copy["uuid"]))
            assert row.tenant_id == tenant_id
            assert row.created_by == doctor_id
        return copy

    copy = assert_copy(payload)
    assert owner.get(f"{url}/{uploaded.json()['uuid']}").content == payload
    assert confirm_legacy(staff, visit).status_code == 409
    assert len(staff.get(gallery_url, headers=headers).json()) == 1
    # Uploading to a new request after linking copies immediately, before confirmation.
    next_visit = request_visit(owner, patient).json()
    response = owner.post(f"/owner/visits/{next_visit['uuid']}/files",
                          files={"file": ("next.pdf", b"next", "application/pdf")})
    assert response.status_code == 201, response.text
    assert_copy(b"next")
    assert confirm_legacy(staff, next_visit, registration=None).status_code == 200
    assert len(staff.get(gallery_url, headers=headers).json()) == 2
    # Ordinary clinical uploads still get the current staff identity from TenantSession.
    clinical = staff.post(gallery_url, headers=headers,
                          files={"file": ("clinical.pdf", b"clinical", "application/pdf")})
    assert clinical.status_code == 201, clinical.text
    with factory() as db:
        row = db.get(Attachment, UUID(clinical.json()["uuid"]))
        assert row.tenant_id == tenant_id
        assert row.created_by == UUID(user["user_id"])
    home = dict(user["organization"])
    user["organization"] = {**home, "org_id": str(uuid4())}
    assert staff.get(gallery_url, headers=headers).status_code == 404
    assert staff.get(f"/attachments/{copy['uuid']}/file", headers=headers).status_code == 404
    user["organization"] = home
    assert staff.get(gallery_url, headers={"X-Vetapp-Workspace": "personal"}).status_code == 200


@pytest.fixture
def visits(cabinet, monkeypatch, tmp_path):
    staff, owner, factory, user = cabinet
    staff.visit_factory = factory
    monkeypatch.setattr(storage, "attachment_root", lambda: tmp_path)
    code = staff.get("/join-codes/current").json()["code"]
    assert register(owner, code).status_code == 201
    animal = owner.post("/owner/animals", json={"name": "Тузик", "species": "dog"}).json()
    return staff, owner, factory, user, animal, tmp_path


def request_visit(owner, animal, **changes):
    return owner.post(f"/owner/animals/{animal['uuid']}/visits", json={
        "reason": "Питомец плохо ест", "proposed_starts_at": "2026-11-01T10:00:00Z", **changes})


def confirm_legacy(staff, visit, **changes):
    # Lifecycle cases below exercise requests that already had a stored type.
    with staff.visit_factory() as db:
        row = db.get(VisitRequest, UUID(visit["uuid"]))
        if row.visit_type is None:
            row.visit_type = "supervision"
            db.commit()
    return staff.post(f"/visit-requests/{visit['uuid']}/confirm", json={
        "starts_at": "2026-11-02T12:00:00Z", "duration_min": 45, "visit_type": "supervision",
        "registration": {"mode": "create"}, **changes})


def test_snapshot_optional_answers_and_no_schedule_entry(visits):
    staff, owner, factory, user, animal, _ = visits
    user["organization"]["org_role"] = "owner"
    result = staff.put("/visit-questionnaires/primary", json={"questions": [
        {"kind": "text", "label": "Причина"},
        {"kind": "single_select", "label": "Аппетит", "options": [
            {"value": "ok", "label": "Хороший"}, {"value": "bad", "label": "Плохой"}]}]})
    assert result.status_code == 200, result.text
    questions = owner.get("/owner/visit-questions").json()
    one = [{"question_id": questions[0]["uuid"], "value": "  зуд  "}]
    assert request_visit(owner, animal, answers=one).status_code == 201
    both = one + [{"question_id": questions[1]["uuid"], "value": "ok"}]
    submitted = request_visit(owner, animal, answers=both)
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


def test_reason_without_questionnaire_is_preserved_and_bounded(visits):
    staff, owner, _, _, animal, _ = visits
    result = request_visit(owner, animal, reason="Питомец плохо ест")
    assert result.status_code == 201, result.text
    assert result.json()["reason"] == "Питомец плохо ест"
    assert staff.get("/visit-requests").json()[0]["reason"] == "Питомец плохо ест"
    assert request_visit(owner, animal, reason="x" * 4001).status_code == 422
    assert confirm_legacy(staff, result.json()).status_code == 200
    assert staff.get("/appointments").json()[0]["notes"] == "Питомец плохо ест"


def test_results_use_exact_encounter_patient_and_explicit_visibility(visits):
    staff, owner, factory, _, animal, _ = visits
    visit = request_visit(owner, animal).json()
    assert confirm_legacy(staff, visit).status_code == 200
    patient = owner.get("/owner/animals").json()[0]
    patient_id = patient["uuid"]
    encounter = staff.post(f"/patients/{patient_id}/encounters", json={"status": "in_progress", "exam": "Private clinical note"}).json()
    other = staff.post(f"/patients/{patient_id}/encounters", json={"status": "completed"}).json()
    with factory() as db:
        appointment_id = str(db.scalar(select(Appointment)).uuid)
    assert staff.patch(f"/appointments/{appointment_id}", json={"encounter_uuid": encounter["uuid"]}).status_code == 200
    assert staff.get(f"/appointments/{appointment_id}").json()["encounter_status"] == "in_progress"

    def upload(encounter_id, visible):
        response = staff.post(f"/patients/{patient_id}/attachments", data={"kind": "document", "encounter_uuid": encounter_id, "caption": "Рекомендации"}, files={"file": ("result.pdf", b"result", "application/pdf")})
        assert response.status_code == 201, response.text
        file = response.json()
        assert staff.patch(f"/attachments/{file['uuid']}", json={"owner_visible": visible}).status_code == 200
        return file

    published = upload(encounter["uuid"], True)
    private = upload(encounter["uuid"], False)
    upload(other["uuid"], True)
    listing = f"/owner/animals/{patient_id}/visits"
    public = owner.get(listing).json()[0]
    assert public["encounter_status"] == "in_progress"
    assert [file["uuid"] for file in public["result_files"]] == [published["uuid"]]
    assert "exam" not in public and "diagnoses" not in public
    assert owner.get(f"/owner/files/{published['uuid']}").content == b"result"
    assert owner.get(f"/owner/files/{private['uuid']}").status_code == 404
    assert staff.patch(f"/attachments/{published['uuid']}", json={"owner_visible": False}).status_code == 200
    assert owner.get(listing).json()[0]["result_files"] == []
    assert owner.get(f"/owner/files/{published['uuid']}").status_code == 404
    # Another owner's identity cannot enumerate this animal or its results.
    owner.post("/owner/logout")
    code = staff.get("/join-codes/current").json()["code"]
    assert register(owner, code, "another@example.com").status_code == 201
    assert owner.get(listing).status_code == 404


@pytest.mark.parametrize("kind,options,valid,invalid", [
    ("binary", [], "no", ["", True, "maybe", []]),
    ("single_select", [{"value": "a", "label": "А"}, {"value": "b", "label": "Б"}], "a", ["c", [], True]),
    ("multi_select", [{"value": "a", "label": "А"}, {"value": "b", "label": "Б"}], ["a", "b"], [["c"], ["a", "a"], "a", [True], [{}]]),
    ("number", [], 0, ["1", True, None, [], "Infinity"]),
    ("text", [], "ответ", [1, "x" * 4001]),
    ("date", [], "2026-11-01", ["2026-02-30", "20261101", "", 1]),
])
def test_answer_shapes(visits, kind, options, valid, invalid):
    staff, owner, _, user, animal, _ = visits
    user["organization"]["org_role"] = "owner"
    q = staff.put("/visit-questionnaires/primary", json={"questions": [
        {"kind": kind, "label": "Вопрос", "options": options}]}).json()["questions"][0]
    for value in invalid:
        result = request_visit(owner, animal, answers=[{"question_id": q["uuid"], "value": value}])
        assert result.status_code == 422, result.text
    assert request_visit(owner, animal, answers=[{"question_id": q["uuid"], "value": valid}]).status_code == 201


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
    assert confirm_legacy(staff, visit).status_code == 409
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0
    # A staff account from another clinic has no read or write access. The header does not reopen it.
    home = dict(user["organization"])
    user["organization"] = {**home, "org_id": str(uuid4())}
    assert staff.get(f"/visit-requests/{visit['uuid']}/files/{file_id}", headers={"X-Vetapp-Workspace": "personal"}).status_code == 403
    assert staff.get("/visit-requests").json() == []
    user["organization"] = home
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
    assert confirm_legacy(staff, visit, registration=None).status_code == 422
    result = confirm_legacy(staff, visit)
    assert result.status_code == 200, result.text
    scheduled = result.json()
    assert scheduled["status"] == "scheduled"
    assert scheduled["proposed_starts_at"].startswith("2026-11-01T10:00")
    assert scheduled["confirmed_starts_at"].startswith("2026-11-02T12:00")
    assert confirm_legacy(staff, visit).status_code == 409
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
    assert confirm_legacy(staff, third, registration=None).status_code == 200
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Attachment)) == 2
    assert request_visit(owner, patient, confirmed_starts_at="2026-11-05T00:00:00Z").status_code == 422
    assert request_visit(owner, patient, duration_min=20).status_code == 422


def test_booked_visit_type_syncs_onto_owner_request(visits):
    staff, owner, factory, user, animal, _ = visits
    user["organization"]["org_role"] = "owner"
    published = staff.put("/visit-questionnaires/primary", json={"questions": [
        {"kind": "text", "label": "Жалоба"}]})
    assert published.status_code == 200, published.text
    question_id = owner.get("/owner/visit-questions").json()[0]["uuid"]
    submitted = request_visit(owner, animal, answers=[{"question_id": question_id, "value": "  зуд  "}])
    assert submitted.status_code == 201, submitted.text
    visit = submitted.json()
    answers = visit["answers"]
    confirmed = confirm_legacy(staff, visit)
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["visit_type"] == "supervision"
    with factory() as db:
        appointment_id = str(db.scalar(select(Appointment.uuid)))
        stored_answers = db.get(VisitRequest, UUID(visit["uuid"])).answers
    assert stored_answers == answers
    patient = owner.get("/owner/animals").json()[0]
    listing = f"/owner/animals/{patient['uuid']}/visits"

    moved = staff.patch(f"/appointments/{appointment_id}", json={"starts_at": "2026-11-04T09:00:00Z"})
    assert moved.status_code == 200, moved.text
    assert moved.json()["visit_type"] == "supervision"
    assert owner.get(listing).json()[0]["visit_type"] == "supervision"
    assert owner.get(listing).json()[0]["answers"] == answers

    rejected = staff.patch(f"/appointments/{appointment_id}", json={"visit_type": "procedure"})
    assert rejected.status_code == 422
    assert staff.get(f"/appointments/{appointment_id}").json()["visit_type"] == "supervision"
    assert owner.get(listing).json()[0]["visit_type"] == "supervision"
    assert owner.get(listing).json()[0]["answers"] == answers

    patched = staff.patch(f"/appointments/{appointment_id}", json={"visit_type": "primary"})
    assert patched.status_code == 200, patched.text
    assert staff.get(f"/appointments/{appointment_id}").json()["visit_type"] == "primary"
    owner_row = owner.get(listing).json()[0]
    assert owner_row["visit_type"] == "primary"
    assert owner_row["answers"] == answers
    staff_row = next(item for item in staff.get("/visit-requests").json() if item["uuid"] == visit["uuid"])
    assert staff_row["visit_type"] == "primary"
    assert staff_row["answers"] == answers
    with factory() as db:
        assert db.get(VisitRequest, UUID(visit["uuid"])).answers == answers

    with factory() as db:
        db.get(Appointment, UUID(appointment_id)).visit_type = "recheck"
        db.commit()
    kept = staff.patch(f"/appointments/{appointment_id}", json={"visit_type": "recheck"})
    assert kept.status_code == 200, kept.text
    assert kept.json()["visit_type"] == "recheck"
    assert owner.get(listing).json()[0]["visit_type"] == "primary"
    assert owner.get(listing).json()[0]["answers"] == answers


def test_confirmation_rolls_back_acceptance_and_appointment_if_file_missing(visits):
    staff, owner, factory, _, animal, root = visits
    visit = request_visit(owner, animal).json()
    owner.post(f"/owner/visits/{visit['uuid']}/files", files={"file": ("photo.jpg", b"photo", "image/jpeg")})
    for file in root.iterdir():
        file.unlink()
    assert confirm_legacy(staff, visit).status_code == 404
    with factory() as db:
        assert db.scalar(select(OwnerRegistration)).status == "pending"
        assert db.scalar(select(VisitRequest)).status == "requested"
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0
        assert db.scalar(select(func.count()).select_from(Attachment)) == 0
    assert staff.get("/patients").json() == []


def test_gallery_copy_without_join_code_does_not_write_attachment(visits):
    from fastapi import HTTPException

    staff, owner, factory, _, animal, root = visits
    visit = request_visit(owner, animal).json()
    response = owner.post(f"/owner/visits/{visit['uuid']}/files",
                          files={"file": ("photo.jpg", b"photo", "image/jpeg")})
    assert response.status_code == 201, response.text
    client = staff.post("/clients", json={"name": "Владелец"}).json()
    patient = staff.post("/patients", json={"name": "Пациент", "species": "dog",
                                           "client_uuid": client["uuid"]}).json()
    original_keys = set(root.iterdir())
    with factory() as db:
        with pytest.raises(HTTPException) as error:
            with visits_repo.transaction(db) as keys:
                row = db.get(VisitRequest, UUID(visit["uuid"]))
                row.patient_uuid = UUID(patient["uuid"])
                db.get(OwnerAccount, row.owner_account_uuid).join_code_uuid = None
                file = db.get(VisitRequestFile, UUID(response.json()["uuid"]))
                visits_repo.copy_gallery(db, row, file, keys)
        assert error.value.status_code == 404
        assert not db.get(VisitRequestFile, UUID(response.json()["uuid"])).gallery_copied
        assert db.scalar(select(func.count()).select_from(Attachment)) == 0
    assert set(root.iterdir()) == original_keys


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
    assert confirm_legacy(staff, visit).status_code == 403
    assert staff.post(f"/visit-requests/{visit['uuid']}/reject", json={}).status_code == 403
    user["organization"]["org_role"] = "member"
    # Confirm follows the invitation even when personal workspace is selected.
    assert confirm_legacy(staff, visit).status_code == 200
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
    result = confirm_legacy(staff, visit, registration=None)
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
        assert confirm_legacy(staff, visit, duration_min=duration).status_code == 422
    assert confirm_legacy(staff, visit, registration={"mode": "link", "client_uuid": str(uuid4())}).status_code == 404
    with factory() as db:
        assert db.scalar(select(OwnerRegistration)).status == "pending"
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0
    client = staff.post("/clients", json={"name": "Существующий владелец"}).json()
    patient = staff.post("/patients", json={"name": "Пациент", "species": "dog", "client_uuid": client["uuid"]}).json()
    result = confirm_legacy(staff, visit, registration={"mode": "link", "client_uuid": client["uuid"],
        "matches": [{"owner_animal_id": animal["uuid"], "patient_uuid": patient["uuid"]}]})
    assert result.status_code == 200, result.text
    assert result.json()["patient_uuid"] == patient["uuid"]
    assert len(staff.get("/clients").json()) == 1


def _publication(db, doctor, visit_type, labels, updated, tenant_id=None, questionnaire_id=None):
    from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire

    row = VisitQuestionnaire(uuid=questionnaire_id or uuid4(), doctor_user_id=doctor, tenant_id=tenant_id,
                             visit_type=visit_type, created_at=updated, updated_at=updated)
    db.add(row)
    db.flush()
    for position, label in enumerate(labels):
        db.add(VisitQuestion(questionnaire_uuid=row.uuid, position=position, kind="text", label=label, options=[]))
    return row


def test_empty_publication_does_not_require_membership(visits):
    from sqlalchemy import delete

    from vetdietderm_api.auth import BrowserSession

    _, owner, factory, *_ = visits
    with factory() as db:
        db.execute(delete(BrowserSession))
        db.commit()
    listed = owner.get("/owner/visit-questions")
    assert listed.status_code == 200, listed.text
    assert listed.json() == []


def test_unresolved_membership_does_not_accept_an_empty_publication(visits):
    from datetime import datetime, timezone

    from sqlalchemy import delete

    from vetdietderm_api.auth import BrowserSession
    from vetdietderm_api.questionnaires.models import VisitQuestionnaire
    from vetdietderm_api.questionnaires.repository import PUBLICATION_RETRY

    _, owner, factory, user, animal, _ = visits
    clinic_id = UUID(user["organization"]["org_id"])
    with factory() as db:
        db.execute(delete(BrowserSession))
        _publication(db, uuid4(), "primary", ["Обязательный"], datetime(2026, 1, 1, tzinfo=timezone.utc))
        db.commit()
    listed = owner.get("/owner/visit-questions")
    assert listed.status_code == 503, listed.text
    assert listed.json()["detail"] == PUBLICATION_RETRY
    refused = request_visit(owner, animal, answers=[])
    assert refused.status_code == 503, refused.text
    with factory() as db:
        row = db.scalar(select(VisitQuestionnaire).where(VisitQuestionnaire.visit_type == "primary"))
        assert row.tenant_id is None
        assert db.scalars(select(VisitQuestionnaire).where(VisitQuestionnaire.tenant_id == clinic_id)).all() == []


def test_owner_receives_legacy_questions_before_settings(visits, monkeypatch):
    from datetime import datetime, timezone

    import httpx

    from vetdietderm_api import auth
    from vetdietderm_api.owners.models import OwnerAccount
    from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire

    _staff, owner, factory, user, animal, _ = visits
    clinic_id = UUID(user["organization"]["org_id"])
    other_clinic = uuid4()
    owner_doctor, admin_doctor, member_doctor, outsider = uuid4(), uuid4(), uuid4(), uuid4()
    early = datetime(2026, 1, 1, tzinfo=timezone.utc)
    later = datetime(2026, 2, 1, tzinfo=timezone.utc)
    newest = datetime(2026, 3, 1, tzinfo=timezone.utc)
    tied = datetime(2026, 4, 1, tzinfo=timezone.utc)
    first_tie, second_tie = uuid4(), uuid4()
    calls = []

    def remote(method, path, body=None, token=None):
        if path == "/me":
            return httpx.Response(200, json=user)
        if path == f"/organizations/{clinic_id}/members":
            assert token == "staff-access"
            calls.append(path)
            return httpx.Response(200, json={"members": [
                {"user_id": str(owner_doctor), "org_role": "owner"},
                {"user_id": str(admin_doctor), "org_role": "admin"},
                {"user_id": str(member_doctor), "org_role": "member"},
            ]})
        pytest.fail(f"Unexpected authority call: {path}")

    monkeypatch.setattr(auth, "upstream", remote)
    with factory() as db:
        account = db.scalar(select(OwnerAccount))
        stored = [{"question_id": str(uuid4()), "label": "Старое", "kind": "text", "value": "как было", "options": []}]
        previous = VisitRequest(owner_account_uuid=account.uuid, owner_animal_uuid=UUID(animal["uuid"]),
                                 visit_type="supervision", proposed_starts_at=early, answers=stored)
        db.add(previous)
        _publication(db, owner_doctor, "primary", ["Старый владелец"], early)
        admin_primary = _publication(db, admin_doctor, "primary", ["Актуально", "Уточнение"], later)
        _publication(db, member_doctor, "primary", ["Новее сотрудника"], newest)
        _publication(db, outsider, "primary", ["Другая клиника"], newest, tenant_id=other_clinic)
        _publication(db, member_doctor, "secondary", ["Только сотрудник"], newest)
        stranger = _publication(db, outsider, "secondary", ["Чужая новая"], newest)
        tie_rows = [
            _publication(db, owner_doctor, "consultation", ["Первая"], tied, questionnaire_id=first_tie),
            _publication(db, admin_doctor, "consultation", ["Вторая"], tied, questionnaire_id=second_tie),
        ]
        db.commit()
        previous_id = previous.uuid
        admin_question_ids = list(db.scalars(select(VisitQuestion.uuid).where(
            VisitQuestion.questionnaire_uuid == admin_primary.uuid).order_by(VisitQuestion.position)))
        expected_tie = max(tie_rows, key=lambda row: row.uuid).uuid
        stranger_id = stranger.uuid

    assert owner.get("/visit-questionnaires").status_code == 401
    selected = owner.get("/owner/visit-questions")
    assert selected.status_code == 200, selected.text
    assert [item["label"] for item in selected.json()] == ["Актуально", "Уточнение"]
    assert [UUID(item["uuid"]) for item in selected.json()] == admin_question_ids
    missing = request_visit(owner, animal, answers=[
        {"question_id": selected.json()[0]["uuid"], "value": "зуд"}])
    assert missing.status_code == 201, missing.text
    accepted = request_visit(owner, animal, answers=[
        {"question_id": item["uuid"], "value": "зуд"} for item in selected.json()])
    assert accepted.status_code == 201, accepted.text
    again = owner.get("/owner/visit-questions")
    assert [item["uuid"] for item in again.json()] == [item["uuid"] for item in selected.json()]
    assert len(_staff.get("/visit-questionnaires").json()) == 1
    assert owner.get("/owner/visit-questions/primary").status_code == 404
    assert calls == [f"/organizations/{clinic_id}/members"]
    kept = owner.get(f"/owner/animals/{animal['uuid']}/visits").json()
    historical = next(item for item in kept if item["uuid"] == str(previous_id))
    assert historical["answers"] == stored
    with factory() as db:
        slots = db.scalars(select(VisitQuestionnaire).where(VisitQuestionnaire.tenant_id == clinic_id)).all()
        assert sorted(row.visit_type for row in slots) == ["consultation", "primary", "secondary"]
        assert db.get(VisitQuestionnaire, stranger_id).tenant_id is None
        assert db.get(VisitQuestionnaire, expected_tie).tenant_id == clinic_id
        foreign = db.scalar(select(VisitQuestionnaire).where(VisitQuestionnaire.doctor_user_id == outsider,
                                                             VisitQuestionnaire.visit_type == "primary"))
        assert foreign.tenant_id == other_clinic
        assert db.scalar(select(func.count()).select_from(VisitQuestion).where(
            VisitQuestion.questionnaire_uuid == foreign.uuid)) == 1
        assert db.get(VisitRequest, previous_id).answers == stored


def test_concurrent_publication_is_complete():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from sqlalchemy import create_engine, event, text
    from sqlalchemy.engine import make_url
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import NullPool

    from vetdietderm_api.db import sqlalchemy_url
    from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire
    from vetdietderm_api.questionnaires.repository import published_clinic_questionnaire, replace_questionnaire
    from vetdietderm_api.questionnaires.schemas import QuestionWrite, QuestionnaireWrite, VisitType
    from vetdietderm_api.settings import Settings

    database_url = Settings().DATABASE_URL
    if not database_url.startswith("postgres"):
        pytest.skip("Concurrent publication lock requires PostgreSQL")
    schema = f"qm_{uuid4().hex}"
    admin = create_engine(sqlalchemy_url(database_url), poolclass=NullPool,
                           connect_args={"connect_timeout": 5})
    try:
        with admin.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    except Exception as exc:
        admin.dispose()
        pytest.skip(f"Isolated PostgreSQL schema is unavailable: {type(exc).__name__}")
    scoped = make_url(sqlalchemy_url(database_url)).update_query_dict({"options": f"-csearch_path={schema}"})
    engine = create_engine(scoped.render_as_string(hide_password=False), poolclass=NullPool,
                           connect_args={"connect_timeout": 5})

    def set_lock_timeout(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("SET lock_timeout = '5s'")
        cursor.close()

    event.listen(engine, "connect", set_lock_timeout)
    VisitQuestionnaire.__table__.create(engine)
    VisitQuestion.__table__.create(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        _assert_concurrent_freeze(Session, Barrier, ThreadPoolExecutor)
        _assert_concurrent_replacement(Session, Barrier, ThreadPoolExecutor, published_clinic_questionnaire,
                                       replace_questionnaire, QuestionWrite, QuestionnaireWrite, VisitType)
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin.dispose()


def _assert_concurrent_freeze(Session, Barrier, ThreadPoolExecutor):
    from datetime import datetime, timezone

    from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire
    from vetdietderm_api.questionnaires.repository import published_clinic_questionnaire
    from vetdietderm_api.questionnaires.schemas import VisitType

    clinic, admin_id, member_id = uuid4(), uuid4(), uuid4()
    members = [{"user_id": str(admin_id), "org_role": "admin"},
               {"user_id": str(member_id), "org_role": "member"}]
    with Session() as db:
        _publication(db, admin_id, "primary", ["A1", "A2", "A3"], datetime(2026, 1, 1, tzinfo=timezone.utc))
        _publication(db, member_id, "primary", ["M1", "M2", "M3"], datetime(2026, 2, 1, tzinfo=timezone.utc))
        db.commit()
    barrier = Barrier(2)

    def migrate():
        barrier.wait(5)
        with Session() as db:
            published_clinic_questionnaire(db, clinic, members=members)
            db.commit()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: migrate(), range(2)))
    assert results == [None, None]
    with Session() as db:
        slots = db.scalars(select(VisitQuestionnaire).where(VisitQuestionnaire.tenant_id == clinic)).all()
        assert len(slots) == 1 and slots[0].doctor_user_id == admin_id
        assert db.scalar(select(VisitQuestionnaire).where(VisitQuestionnaire.doctor_user_id == member_id)) is None
        labels = db.scalars(select(VisitQuestion.label).where(
            VisitQuestion.questionnaire_uuid == slots[0].uuid).order_by(VisitQuestion.position)).all()
        assert list(labels) == ["A1", "A2", "A3"]


def _assert_concurrent_replacement(Session, Barrier, ThreadPoolExecutor, published_clinic_questionnaire,
                                   replace_questionnaire, QuestionWrite, QuestionnaireWrite, VisitType):
    from datetime import datetime, timezone

    from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire

    clinic, admin_id, member_id = uuid4(), uuid4(), uuid4()
    members = [{"user_id": str(admin_id), "org_role": "admin"},
               {"user_id": str(member_id), "org_role": "member"}]
    with Session() as db:
        _publication(db, admin_id, "primary", ["A1", "A2", "A3"], datetime(2026, 1, 1, tzinfo=timezone.utc))
        _publication(db, member_id, "primary", ["M1", "M2", "M3"], datetime(2026, 2, 1, tzinfo=timezone.utc))
        db.commit()
    barrier = Barrier(2)
    replacement = QuestionnaireWrite(questions=[QuestionWrite(kind="text", label="N1"),
                                                QuestionWrite(kind="text", label="N2")])

    def migrate():
        barrier.wait(5)
        with Session() as db:
            published_clinic_questionnaire(db, clinic, members=members)
            db.commit()

    def replace():
        barrier.wait(5)
        with Session() as db:
            published_clinic_questionnaire(db, clinic, admin_id, members)
            replace_questionnaire(db, clinic, admin_id, VisitType.primary, replacement)

    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = [pool.submit(migrate), pool.submit(replace)]
        for job in jobs:
            job.result(timeout=20)
    with Session() as db:
        slots = db.scalars(select(VisitQuestionnaire).where(
            VisitQuestionnaire.tenant_id == clinic, VisitQuestionnaire.visit_type == "primary")).all()
        assert len(slots) == 1
        labels = list(db.scalars(select(VisitQuestion.label).where(
            VisitQuestion.questionnaire_uuid == slots[0].uuid).order_by(VisitQuestion.position)))
        assert labels == ["N1", "N2"]


def test_problem_contract_and_null_confirmation(visits):
    staff, owner, factory, _, animal, _ = visits
    url = f"/owner/animals/{animal['uuid']}/visits"
    base = {"proposed_starts_at": "2026-11-01T10:00:00Z", "answers": []}
    for changes in ({}, {"reason": ""}, {"reason": "   "}, {"reason": None},
                    {"reason": "x" * 4001}, {"reason": "Зуд", "visit_type": "primary"},
                    {"reason": "Зуд", "specialty": "dermatology"}):
        assert owner.post(url, json={**base, **changes}).status_code == 422
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(VisitRequest)) == 0
    visit = owner.post(url, json={**base, "reason": "  " + "x" * 4000 + "  "})
    assert visit.status_code == 201, visit.text
    row = visit.json()
    assert row["reason"] == "x" * 4000 and row["visit_type"] is None and row["answers"] == []
    assert staff.get("/visit-requests").json()[0]["visit_type"] is None
    assert owner.get(url).json()[0]["reason"] == row["reason"]
    refused = staff.post(f"/visit-requests/{row['uuid']}/confirm", json={
        "starts_at": "2026-11-02T12:00:00Z", "duration_min": 45, "registration": {"mode": "create"}})
    assert refused.status_code == 422
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0
        assert db.scalar(select(OwnerRegistration)).status == "pending"


@pytest.mark.parametrize("primary", [True, False, "newest"])
def test_one_publication_selection_permissions_and_preservation(visits, primary):
    from vetdietderm_api.questionnaires.models import VisitQuestionnaire
    from vetdietderm_api.encounters.models import Encounter

    staff, owner, factory, user, animal, _ = visits
    clinic = UUID(user["organization"]["org_id"])
    tied = datetime(2026, 1, 1)
    with factory() as db:
        rows = [_publication(db, uuid4(), kind, [kind], tied, clinic, UUID(int=i))
                for i, kind in enumerate(("secondary", "consultation", "supervision"), 1)]
        if primary is True:
            rows.append(_publication(db, uuid4(), "primary", ["primary"], datetime(2025, 1, 1), clinic))
        if primary == "newest":
            rows[0].updated_at = datetime(2026, 2, 1)
        expected = rows[0] if primary == "newest" else rows[-1]
        expected_id, expected_type = str(expected.uuid), expected.visit_type
        saved_ids = [row.uuid for row in rows]
        db.commit()
    listed = staff.get("/visit-questionnaires").json()
    assert len(listed) == 1 and listed[0]["uuid"] == expected_id
    questions = owner.get("/owner/visit-questions").json()
    assert questions[0]["label"] == expected_type
    answer = [{"question_id": questions[0]["uuid"], "value": "Снимок"}]
    visit = request_visit(owner, animal, answers=answer).json()
    snapshot = visit["answers"]
    for role in ("member", "viewer"):
        user["organization"]["org_role"] = role
        assert staff.get("/visit-questionnaires").status_code == 200
        denied = staff.put(f"/visit-questionnaires/{expected_type}", json={"questions": []})
        assert denied.status_code == 403
        assert denied.json()["detail"] == "Анкету клиники изменяют владелец и администратор"
    for role in ("owner", "admin"):
        user["organization"]["org_role"] = role
        for kind in ("primary", "secondary", "consultation", "supervision"):
            if kind != expected_type:
                assert staff.put(f"/visit-questionnaires/{kind}", json={"questions": []}).status_code == 404
        assert staff.put(f"/visit-questionnaires/{expected_type}", json={"questions": []}).status_code == 200
    with factory() as db:
        assert all(db.get(VisitQuestionnaire, id) is not None for id in saved_ids)
        assert db.get(VisitRequest, UUID(visit["uuid"])).answers == snapshot
        assert db.scalar(select(func.count()).select_from(Encounter)) == 0


def test_optional_snapshot_empty_values_and_invalid_ids(visits):
    staff, owner, factory, user, animal, _ = visits
    user["organization"]["org_role"] = "owner"
    questions = staff.put("/visit-questionnaires/primary", json={"questions": [
        {"kind": "text", "label": "Текст"}, {"kind": "number", "label": "Число"},
        {"kind": "multi_select", "label": "Выбор", "options": [
            {"value": "a", "label": "А"}, {"value": "b", "label": "Б"}]}]}).json()["questions"]
    assert request_visit(owner, animal, answers=[]).json()["answers"] == []
    answers = [{"question_id": q["uuid"], "value": value}
               for q, value in zip(questions, ("  ", 0, []))]
    stored = request_visit(owner, animal, answers=answers).json()["answers"]
    assert len(stored) == 1 and stored[0]["value"] == 0 and stored[0]["label"] == "Число"
    for invalid in ([{"question_id": str(uuid4()), "value": "x"}],
                    [answers[1], answers[1]],
                    [{"question_id": questions[2]["uuid"], "value": ["unknown"]}]):
        assert request_visit(owner, animal, answers=invalid).status_code == 422
    with factory() as db:
        assert len(db.scalars(select(VisitRequest)).all()) == 2


@pytest.mark.parametrize("first_read", ["owner", "staff"])
def test_empty_clinic_seeds_one_questionnaire(visits, first_read):
    from vetdietderm_api.questionnaires.models import VisitQuestionnaire

    staff, owner, factory, user, animal, _ = visits
    user["organization"]["org_role"] = "owner"
    assert staff.put("/visit-questionnaires/secondary", json={"questions": []}).status_code == 404
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(VisitQuestionnaire)) == 0
    if first_read == "owner":
        assert owner.get("/owner/visit-questions").json() == []
    else:
        assert len(staff.get("/visit-questionnaires").json()) == 1
    assert owner.get("/owner/visit-questions").json() == []
    listed = staff.get("/visit-questionnaires").json()
    assert len(listed) == 1 and listed[0]["visit_type"] == "primary"
    user["organization"]["org_role"] = "owner"
    assert staff.put("/visit-questionnaires/secondary", json={"questions": []}).status_code == 404
    with factory() as db:
        rows = db.scalars(select(VisitQuestionnaire)).all()
        assert len(rows) == 1 and rows[0].visit_type == "primary"


@pytest.mark.parametrize("kind", ["primary", "secondary", "consultation", "supervision"])
@pytest.mark.parametrize("stored_type", [None, "primary"])
def test_confirm_classifies_new_request(visits, kind, stored_type):
    staff, owner, factory, _, animal, _ = visits
    visit = request_visit(owner, animal).json()
    if stored_type:
        with factory() as db:
            db.get(VisitRequest, UUID(visit["uuid"])).visit_type = stored_type
            db.commit()
    assert staff.get("/appointments").json() == []
    response = staff.post(f"/visit-requests/{visit['uuid']}/confirm", json={
        "starts_at": "2026-11-02T12:00:00Z", "duration_min": 45,
        "visit_type": kind, "registration": {"mode": "create"}})
    assert response.status_code == 200, response.text
    assert response.json()["visit_type"] == kind
    appointments = staff.get("/appointments").json()
    assert len(appointments) == 1 and appointments[0]["visit_type"] == kind
    appointment = appointments[0]
    assert appointment["owner_problem"] == visit["reason"]
    assert appointment["notes"] == visit["reason"]
    # The read contract always uses the request, even after staff edit notes.
    changed = staff.patch(f"/appointments/{appointment['uuid']}", json={"notes": "Staff notes"})
    assert changed.json()["owner_problem"] == visit["reason"]
    public = owner.get(f"/owner/animals/{appointment['patient_uuid']}/visits").json()[0]
    assert public["reason"] == visit["reason"] and public["answers"] == visit["answers"]
    direct = staff.post("/appointments", json={"patient_uuid": appointment["patient_uuid"],
        "starts_at": "2026-11-03T12:00:00Z", "visit_type": kind, "notes": "Only staff notes"})
    assert direct.status_code == 201 and direct.json()["owner_problem"] is None
    with factory() as db:
        assert db.get(VisitRequest, UUID(visit["uuid"])).visit_type == kind


@pytest.mark.parametrize("kind", [None, "recheck", "procedure", "telemedicine"])
def test_confirm_rejects_missing_or_legacy_type_atomically(visits, kind):
    staff, owner, factory, _, animal, _ = visits
    visit = request_visit(owner, animal).json()
    body = {"starts_at": "2026-11-02T12:00:00Z", "duration_min": 45,
            "registration": {"mode": "create"}}
    if kind is not None:
        body["visit_type"] = kind
    response = staff.post(f"/visit-requests/{visit['uuid']}/confirm", json=body)
    assert response.status_code == 422, response.text
    with factory() as db:
        row = db.get(VisitRequest, UUID(visit["uuid"]))
        assert row.status == "requested" and row.appointment_uuid is None and row.visit_type is None
        assert db.scalar(select(OwnerRegistration)).status == "pending"
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0


@pytest.mark.parametrize("complaint", [None, "   ", "Doctor wrote this"])
def test_first_encounter_link_fills_only_blank_complaint_once(visits, complaint):
    staff, owner, _, _, animal, _ = visits
    visit = request_visit(owner, animal).json()
    assert confirm_legacy(staff, visit).status_code == 200
    appointment = staff.get("/appointments").json()[0]
    encounter = staff.post(f"/patients/{appointment['patient_uuid']}/encounters", json={
        "specialty": "general", "chief_complaint": complaint}).json()
    url = f"/appointments/{appointment['uuid']}"
    assert staff.patch(url, json={"encounter_uuid": encounter["uuid"]}).status_code == 200
    expected = complaint if complaint and complaint.strip() else visit["reason"]
    assert staff.get(f"/encounters/{encounter['uuid']}").json()["chief_complaint"] == expected
    assert staff.patch(f"/encounters/{encounter['uuid']}", json={"chief_complaint": None}).status_code == 200
    assert staff.patch(url, json={"encounter_uuid": encounter["uuid"], "notes": "Changed"}).status_code == 200
    assert staff.get(f"/encounters/{encounter['uuid']}").json()["chief_complaint"] is None


@pytest.mark.parametrize("source", ["no_request", None, "   "])
def test_notes_never_fill_complaint_without_nonblank_request_reason(visits, source):
    staff, owner, factory, _, animal, _ = visits
    visit = request_visit(owner, animal).json()
    assert confirm_legacy(staff, visit).status_code == 200
    appointment = staff.get("/appointments").json()[0]
    with factory() as db:
        row = db.get(VisitRequest, UUID(visit["uuid"]))
        if source == "no_request":
            row.appointment_uuid = None
        else:
            row.reason = source
        db.commit()
    encounter = staff.post(f"/patients/{appointment['patient_uuid']}/encounters", json={"specialty": "general"}).json()
    result = staff.patch(f"/appointments/{appointment['uuid']}", json={
        "encounter_uuid": encounter["uuid"], "notes": "Staff notes"})
    assert result.status_code == 200, result.text
    assert result.json()["owner_problem"] == (None if source == "no_request" else source)
    assert staff.get(f"/encounters/{encounter['uuid']}").json()["chief_complaint"] is None


def _confirmed(staff, owner, factory, animal):
    visit = request_visit(owner, animal).json()
    assert confirm_legacy(staff, visit).status_code == 200
    with factory() as db:
        appointment_id = str(db.get(VisitRequest, UUID(visit["uuid"])).appointment_uuid)
    appointment = staff.get(f"/appointments/{appointment_id}").json()
    return visit, appointment, f"/appointments/{appointment_id}", f"/owner/animals/{appointment['patient_uuid']}/visits"


def test_post_visit_charge_is_entered_changed_and_frozen(visits):
    staff, owner, factory, _, animal, _ = visits
    _, appointment, url, listing = _confirmed(staff, owner, factory, animal)
    assert staff.get(url).json()["amount_rub"] is None
    assert owner.get(listing).json()[0]["amount_rub"] is None
    early = staff.patch(url, json={"amount_rub": "1500.50"})
    assert early.status_code == 422 and early.json()["detail"] == "Сумму указывают после проведения визита"
    rolled = staff.patch(url, json={"status": "completed", "amount_rub": 10.999})
    assert rolled.status_code == 422 and rolled.json()["detail"] == "Сумма должна быть больше нуля"
    assert staff.get(url).json()["status"] == "scheduled" and staff.get(url).json()["amount_rub"] is None
    saved = staff.patch(url, json={"status": "completed", "amount_rub": 1500.50})
    assert saved.status_code == 200, saved.text
    assert saved.json()["amount_rub"] == "1500.50" and saved.json()["paid"] is False and saved.json()["status"] == "completed"
    assert owner.get(listing).json()[0]["amount_rub"] == "1500.50"
    for amount in (0, -1, 10.999):
        refused = staff.patch(url, json={"amount_rub": amount})
        assert refused.status_code == 422, refused.text
        assert refused.json()["detail"] == "Сумма должна быть больше нуля"
    with factory() as db:
        row = db.get(Appointment, UUID(appointment["uuid"]))
        assert row.status == "completed" and row.amount_rub == Decimal("1500.50") and row.paid is False
    changed = staff.patch(url, json={"amount_rub": "1600.00"})
    assert changed.status_code == 200 and changed.json()["amount_rub"] == "1600.00" and changed.json()["paid"] is False
    paid = staff.patch(url, json={"paid": True})
    assert paid.status_code == 200 and paid.json()["paid"] is True and paid.json()["amount_rub"] == "1600.00"
    assert owner.get(listing).json()[0]["paid"] is True
    frozen = staff.patch(url, json={"amount_rub": "1700.00"})
    unpaid = staff.patch(url, json={"paid": False})
    assert frozen.status_code == 422 and frozen.json()["detail"] == "Оплаченная сумма не изменяется"
    assert unpaid.status_code == 422 and unpaid.json()["detail"] == "Оплату нельзя отменить"
    with factory() as db:
        row = db.get(Appointment, UUID(appointment["uuid"]))
        assert row.amount_rub == Decimal("1600.00") and row.paid is True


@pytest.mark.parametrize("amount", ["10000000000.00", "1e100", "9" * 100])
def test_charge_rejects_amounts_outside_storage_range(visits, amount):
    staff, owner, factory, _, animal, _ = visits
    _, appointment, url, _ = _confirmed(staff, owner, factory, animal)
    for response in (
        staff.patch(url, json={"status": "completed", "amount_rub": amount}),
        staff.post("/appointments", json={
            "patient_uuid": appointment["patient_uuid"], "starts_at": "2026-11-04T10:00:00Z",
            "status": "completed", "amount_rub": amount}),
    ):
        assert response.status_code == 422, response.text
        assert response.json()["detail"] == "Сумма не должна превышать 9999999999.99 руб."
    unchanged = staff.get(url).json()
    assert unchanged["status"] == "scheduled" and unchanged["amount_rub"] is None
    assert len(staff.get("/appointments").json()) == 1


def test_charge_accepts_largest_storable_amount(visits):
    staff, owner, factory, _, animal, _ = visits
    _, _, url, listing = _confirmed(staff, owner, factory, animal)
    saved = staff.patch(url, json={"status": "completed", "amount_rub": "9999999999.99"})
    assert saved.status_code == 200, saved.text
    assert saved.json()["amount_rub"] == "9999999999.99"
    assert owner.get(listing).json()[0]["amount_rub"] == "9999999999.99"


def test_unpaid_charge_clears_and_paid_charge_remains(visits):
    staff, owner, factory, _, animal, _ = visits
    _, appointment, url, listing = _confirmed(staff, owner, factory, animal)
    assert staff.patch(url, json={"status": "completed", "amount_rub": "400.00"}).status_code == 200
    assert staff.patch(url, json={"status": "cancelled"}).status_code == 200
    cleared = staff.get(url).json()
    assert cleared["amount_rub"] is None and cleared["paid"] is False and cleared["status"] == "cancelled"
    assert owner.get(listing).json()[0]["amount_rub"] is None
    patient = {"uuid": appointment["patient_uuid"]}
    second = request_visit(owner, patient).json()
    assert confirm_legacy(staff, second).status_code == 200
    kept = next(item for item in staff.get("/appointments").json() if item["notes"] == "Питомец плохо ест" and item["uuid"] != appointment["uuid"])
    kept_url = f"/appointments/{kept['uuid']}"
    assert staff.patch(kept_url, json={"status": "completed", "amount_rub": "400.00", "paid": True}).status_code == 200
    assert staff.patch(kept_url, json={"status": "no_show"}).status_code == 200
    stored = staff.get(kept_url).json()
    assert stored["amount_rub"] == "400.00" and stored["paid"] is True and stored["status"] == "no_show"
    owner_row = next(item for item in owner.get(listing).json() if item["uuid"] == second["uuid"])
    assert owner_row["amount_rub"] == "400.00" and owner_row["paid"] is True
    with factory() as db:
        first = db.get(Appointment, UUID(appointment["uuid"]))
        assert first.amount_rub is None and first.paid is False


def test_reject_withdraw_cancel_and_encounter_do_not_create_a_charge(visits):
    staff, owner, factory, _, animal, _ = visits
    rejected = request_visit(owner, animal).json()
    assert staff.post(f"/visit-requests/{rejected['uuid']}/reject", json={}).status_code == 200
    withdrawn = request_visit(owner, animal).json()
    assert owner.post(f"/owner/visits/{withdrawn['uuid']}/withdraw").status_code == 200
    visit, appointment, url, _listing = _confirmed(staff, owner, factory, animal)
    assert owner.post(f"/owner/visits/{visit['uuid']}/cancel").status_code == 200
    cancelled = staff.get(url).json()
    assert cancelled["status"] == "cancelled" and cancelled["amount_rub"] is None
    _visit, scheduled, scheduled_url, _listing = _confirmed(staff, owner, factory, {"uuid": appointment["patient_uuid"]})
    encounter = staff.post(f"/patients/{scheduled['patient_uuid']}/encounters", json={"status": "completed"}).json()
    linked = staff.patch(scheduled_url, json={"encounter_uuid": encounter["uuid"]})
    assert linked.status_code == 200, linked.text
    current = staff.get(scheduled_url).json()
    assert current["status"] == "scheduled" and current["amount_rub"] is None
    assert staff.get(f"/encounters/{encounter['uuid']}").json()["status"] == "completed"
    with factory() as db:
        assert all(row.amount_rub is None and row.paid is False for row in db.scalars(select(Appointment)))


def test_viewer_can_read_a_charge_and_cannot_change_it(visits):
    staff, owner, factory, user, animal, _ = visits
    _, appointment, url, _ = _confirmed(staff, owner, factory, animal)
    assert staff.patch(url, json={"status": "completed", "amount_rub": "250.00"}).status_code == 200
    user["organization"]["org_role"] = "viewer"
    visible = staff.get(url)
    assert visible.status_code == 200 and visible.json()["amount_rub"] == "250.00" and visible.json()["paid"] is False
    denied = staff.patch(url, json={"amount_rub": "260.00"})
    assert denied.status_code == 403 and denied.json()["detail"] == "Роль наблюдателя разрешает только просмотр"
    user["organization"]["org_role"] = "member"
    saved = staff.patch(url, json={"amount_rub": "260.00"})
    assert saved.status_code == 200 and saved.json()["amount_rub"] == "260.00"


def test_direct_charge_is_visible_only_in_the_linked_owner_cabinet(visits):
    staff, owner, factory, _, animal, _ = visits
    _, appointment, _, listing = _confirmed(staff, owner, factory, animal)
    direct = staff.post("/appointments", json={
        "patient_uuid": appointment["patient_uuid"], "starts_at": "2026-11-04T10:00:00Z",
        "duration_min": 30, "visit_type": "consultation", "status": "completed", "amount_rub": "700.00"})
    assert direct.status_code == 201, direct.text
    row = next(item for item in owner.get(listing).json() if item["uuid"] == direct.json()["uuid"])
    assert row["read_only"] is True and row["reason"] is None and row["visit_type"] is None
    assert row["amount_rub"] == "700.00" and row["paid"] is False
    assert row["answers"] == [] and row["files"] == [] and row["result_files"] == []
    client = staff.post("/clients", json={"name": "Без кабинета"}).json()
    stranger = staff.post("/patients", json={"name": "Чужак", "species": "dog", "client_uuid": client["uuid"]}).json()
    hidden = staff.post("/appointments", json={
        "patient_uuid": stranger["uuid"], "starts_at": "2026-11-04T11:00:00Z", "duration_min": 30,
        "visit_type": "consultation", "status": "completed", "amount_rub": "800.00"})
    assert hidden.status_code == 201, hidden.text
    assert all(item["uuid"] != hidden.json()["uuid"] for item in owner.get(listing).json())
    assert staff.get(f"/appointments/{hidden.json()['uuid']}").json()["amount_rub"] == "800.00"
    assert staff.patch(f"/appointments/{direct.json()['uuid']}", json={"status": "cancelled"}).status_code == 200
    assert all(item["uuid"] != direct.json()["uuid"] for item in owner.get(listing).json())
    paid = staff.post("/appointments", json={
        "patient_uuid": appointment["patient_uuid"], "starts_at": "2026-11-04T12:00:00Z",
        "duration_min": 30, "visit_type": "consultation", "status": "completed",
        "amount_rub": "900.00", "paid": True})
    assert paid.status_code == 201, paid.text
    assert staff.patch(f"/appointments/{paid.json()['uuid']}", json={"status": "cancelled"}).status_code == 200
    kept = next(item for item in owner.get(listing).json() if item["uuid"] == paid.json()["uuid"])
    assert kept["read_only"] is True and kept["amount_rub"] == "900.00" and kept["paid"] is True and kept["status"] == "cancelled"


def test_due_charge_does_not_block_owner_actions_or_notify(visits, monkeypatch):
    import vetdietderm_api.owners.telegram as telegram

    staff, owner, factory, _, animal, _ = visits
    called = []

    def watch(label):
        def inner(*_args, **_kwargs):
            called.append(label)
        return inner

    for name in ("fetch_bot_identity", "validate_init_data", "validate_widget"):
        monkeypatch.setattr(telegram, name, watch(name))
    visit, appointment, url, listing = _confirmed(staff, owner, factory, animal)
    assert staff.patch(url, json={"status": "completed", "amount_rub": "1500.50"}).status_code == 200
    patient_id = appointment["patient_uuid"]
    assert request_visit(owner, {"uuid": patient_id}).status_code == 201
    assert owner.post(f"/owner/animals/{patient_id}/chat", json={"body": "Можно прийти раньше?"}).status_code == 201
    encounter = staff.post(f"/patients/{patient_id}/encounters", json={"status": "completed"}).json()
    assert staff.patch(url, json={"encounter_uuid": encounter["uuid"]}).status_code == 200
    uploaded = staff.post(f"/patients/{patient_id}/attachments", data={"kind": "document", "encounter_uuid": encounter["uuid"]},
                          files={"file": ("result.pdf", b"result", "application/pdf")})
    assert uploaded.status_code == 201, uploaded.text
    file_id = uploaded.json()["uuid"]
    assert staff.patch(f"/attachments/{file_id}", json={"owner_visible": True}).status_code == 200
    assert owner.get(f"/owner/files/{file_id}").content == b"result"
    charged = next(item for item in owner.get(listing).json() if item["uuid"] == visit["uuid"])
    assert charged["amount_rub"] == "1500.50" and charged["paid"] is False
    assert called == []
