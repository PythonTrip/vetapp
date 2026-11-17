from uuid import UUID

import pytest
from sqlalchemy import select

from vetdietderm_api.attachments.models import Attachment
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.owners.models import OwnerRegistration
from vetdietderm_api.visits.models import VisitRequest

pytestmark = pytest.mark.integration


def test_missing_visit_file_rolls_back_confirmation_and_allows_retry(
    api_client, unauthenticated_api_client, tmp_path,
):
    owner = unauthenticated_api_client
    code = api_client.get("/join-codes/current")
    assert code.status_code == 200, code.text
    registered = owner.post("/owner/register", json={
        "code": code.json()["code"], "name": "Test owner", "email": "visit@example.test",
        "phone": "+70000000000", "password": "synthetic visit password",
    }, headers={"X-Vetapp-CSRF": "1"})
    assert registered.status_code == 201, registered.text

    owner.headers["X-Vetapp-CSRF"] = "1"
    animal = owner.post("/owner/animals", json={"name": "Test pet", "species": "dog"})
    assert animal.status_code == 201, animal.text
    visit_url = f"/owner/animals/{animal.json()['uuid']}/visits"
    requested = owner.post(visit_url, json={
        "reason": "Needs a follow-up", "proposed_starts_at": "2030-03-01T10:00:00Z",
    })
    assert requested.status_code == 201, requested.text
    visit_id = requested.json()["uuid"]
    uploaded = owner.post(f"/owner/visits/{visit_id}/files", files={
        "file": ("notes.pdf", b"%PDF-1.4\n", "application/pdf"),
    })
    assert uploaded.status_code == 201, uploaded.text
    (source_file,) = (tmp_path / "attachments").iterdir()
    missing_file = source_file.with_name("held-visit-file")
    source_file.rename(missing_file)

    confirm_url = f"/visit-requests/{visit_id}/confirm"
    confirmation = {
        "starts_at": "2030-03-02T11:00:00Z", "duration_min": 45,
        "visit_type": "consultation", "registration": {"mode": "create"},
    }
    failed = api_client.post(confirm_url, json=confirmation)
    assert failed.status_code == 404, failed.text
    assert failed.json()["detail"] == "Файл заявки не найден"
    with get_session_factory()() as db:
        registration = db.scalars(select(OwnerRegistration)).one()
        assert registration.status == "pending"
        assert registration.client_uuid is None
        request = db.get(VisitRequest, UUID(visit_id))
        assert request.status == "requested"
        assert request.appointment_uuid is None
        assert db.scalars(select(Attachment)).all() == []
    assert api_client.get("/appointments").json() == []
    assert api_client.get("/patients").json() == []
    assert api_client.get("/clients").json() == []

    missing_file.rename(source_file)
    confirmed = api_client.post(confirm_url, json=confirmation)
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "scheduled"
    (appointment,) = api_client.get("/appointments").json()
    assert appointment["visit_type"] == "consultation"
    assert appointment["duration_min"] == 45
    assert appointment["owner_problem"] == "Needs a follow-up"
    with get_session_factory()() as db:
        registration = db.scalars(select(OwnerRegistration)).one()
        assert registration.status == "accepted"
        assert db.get(VisitRequest, UUID(visit_id)).appointment_uuid == UUID(appointment["uuid"])
        assert db.scalars(select(Attachment)).one().patient_uuid == UUID(appointment["patient"]["uuid"])
