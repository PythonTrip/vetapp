"""Visit lifecycle and privacy checks against an isolated store and filesystem."""
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
    result = confirm(staff, visit)
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
    assert confirm(staff, visit).status_code == 409
    assert len(staff.get(gallery_url, headers=headers).json()) == 1
    # Uploading to a new request after linking copies immediately, before confirmation.
    next_visit = request_visit(owner, patient).json()
    response = owner.post(f"/owner/visits/{next_visit['uuid']}/files",
                          files={"file": ("next.pdf", b"next", "application/pdf")})
    assert response.status_code == 201, response.text
    assert_copy(b"next")
    assert confirm(staff, next_visit, registration=None).status_code == 200
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
    staff, owner, factory, user, animal, _ = visits
    user["organization"]["org_role"] = "owner"
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


def test_reason_without_questionnaire_is_preserved_and_bounded(visits):
    staff, owner, _, _, animal, _ = visits
    result = request_visit(owner, animal, reason="Питомец плохо ест")
    assert result.status_code == 201, result.text
    assert result.json()["reason"] == "Питомец плохо ест"
    assert staff.get("/visit-requests").json()[0]["reason"] == "Питомец плохо ест"
    assert request_visit(owner, animal, reason="x" * 4001).status_code == 422
    assert confirm(staff, result.json()).status_code == 200
    assert staff.get("/appointments").json()[0]["notes"] == "Питомец плохо ест"


def test_results_use_exact_encounter_patient_and_explicit_visibility(visits):
    staff, owner, factory, _, animal, _ = visits
    visit = request_visit(owner, animal).json()
    assert confirm(staff, visit).status_code == 200
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
    ("multi_select", [{"value": "a", "label": "А"}, {"value": "b", "label": "Б"}], ["a", "b"], [[], ["c"], ["a", "a"], "a", [True], [{}]]),
    ("number", [], 0, ["1", True, None, [], "Infinity"]),
    ("text", [], "ответ", ["   ", 1, "x" * 4001]),
    ("date", [], "2026-11-01", ["2026-02-30", "20261101", "", 1]),
])
def test_answer_shapes(visits, kind, options, valid, invalid):
    staff, owner, _, user, animal, _ = visits
    user["organization"]["org_role"] = "owner"
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


def test_booked_visit_type_syncs_onto_owner_request(visits):
    staff, owner, factory, user, animal, _ = visits
    user["organization"]["org_role"] = "owner"
    published = staff.put("/visit-questionnaires/supervision", json={"questions": [
        {"kind": "text", "label": "Жалоба"}]})
    assert published.status_code == 200, published.text
    question_id = owner.get("/owner/visit-questions/supervision").json()[0]["uuid"]
    submitted = request_visit(owner, animal, answers=[{"question_id": question_id, "value": "  зуд  "}])
    assert submitted.status_code == 201, submitted.text
    visit = submitted.json()
    answers = visit["answers"]
    confirmed = confirm(staff, visit)
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
    assert confirm(staff, visit).status_code == 404
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
    listed = owner.get("/owner/visit-questions/consultation")
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
    listed = owner.get("/owner/visit-questions/primary")
    assert listed.status_code == 503, listed.text
    assert listed.json()["detail"] == PUBLICATION_RETRY
    refused = request_visit(owner, animal, visit_type="primary", answers=[])
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
    selected = owner.get("/owner/visit-questions/primary")
    assert selected.status_code == 200, selected.text
    assert [item["label"] for item in selected.json()] == ["Актуально", "Уточнение"]
    assert [UUID(item["uuid"]) for item in selected.json()] == admin_question_ids
    missing = request_visit(owner, animal, visit_type="primary", answers=[
        {"question_id": selected.json()[0]["uuid"], "value": "зуд"}])
    assert missing.status_code == 422, missing.text
    accepted = request_visit(owner, animal, visit_type="primary", answers=[
        {"question_id": item["uuid"], "value": "зуд"} for item in selected.json()])
    assert accepted.status_code == 201, accepted.text
    again = owner.get("/owner/visit-questions/primary")
    assert [item["uuid"] for item in again.json()] == [item["uuid"] for item in selected.json()]
    secondary = owner.get("/owner/visit-questions/secondary")
    assert [item["label"] for item in secondary.json()] == ["Только сотрудник"]
    consultation = owner.get("/owner/visit-questions/consultation")
    assert consultation.json()[0]["label"] == ("Первая" if expected_tie == first_tie else "Вторая")
    assert owner.get("/owner/visit-questions/supervision").json() == []
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
    from vetdietderm_api.questionnaires.repository import published_questions, replace_questionnaire
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
        _assert_concurrent_replacement(Session, Barrier, ThreadPoolExecutor, published_questions,
                                       replace_questionnaire, QuestionWrite, QuestionnaireWrite, VisitType)
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin.dispose()


def _assert_concurrent_freeze(Session, Barrier, ThreadPoolExecutor):
    from datetime import datetime, timezone

    from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire
    from vetdietderm_api.questionnaires.repository import published_questions
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
            published_questions(db, clinic, VisitType.primary, members)
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


def _assert_concurrent_replacement(Session, Barrier, ThreadPoolExecutor, published_questions,
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
            published_questions(db, clinic, VisitType.primary, members)
            db.commit()

    def replace():
        barrier.wait(5)
        with Session() as db:
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
