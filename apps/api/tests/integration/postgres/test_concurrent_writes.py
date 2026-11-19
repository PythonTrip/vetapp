from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from decimal import Decimal
from threading import Event
from time import monotonic
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, text

from tests.postgres_auth_stub import CSRF
from vetdietderm_api.catalog.models import FoodNutrientValue
from vetdietderm_api.db import get_engine, get_session_factory


pytestmark = pytest.mark.integration
PDF = b"%PDF-1.4\nsynthetic visit attachment"
FIRST_START = "2030-03-02T11:00:00Z"
SECOND_START = "2030-03-02T12:00:00Z"


def body(response, status):
    assert response.status_code == status, response.text
    return response.json()


def overlap(engine, first, second, *, first_write, second_write=None):
    """Park the first real transaction before COMMIT and observe the contender."""
    first_at_commit, second_at_commit, release = Event(), Event(), Event()
    first_pid = None
    writers = set()

    def track_write(conn, _cursor, statement, _params, _context, _many):
        prefix = first_write if first_pid is None else second_write
        if prefix and statement.lstrip().upper().startswith(prefix):
            writers.add(conn)

    def hold_commit(conn):
        nonlocal first_pid
        if conn not in writers:
            return
        writers.remove(conn)
        if first_pid is None:
            first_pid = conn.connection.driver_connection.info.backend_pid
            first_at_commit.set()
            assert release.wait(20), (
                "Timed out waiting to release the first transaction"
            )
        else:
            second_at_commit.set()

    event.listen(engine, "after_cursor_execute", track_write)
    event.listen(engine, "commit", hold_commit)
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            first_call = executor.submit(first)
            try:
                deadline = monotonic() + 10
                while not first_at_commit.wait(0.05):
                    if first_call.done():
                        pytest.fail(
                            f"First request finished before reaching COMMIT: {first_call.result()}"
                        )
                    assert monotonic() < deadline, (
                        "First transaction did not reach COMMIT"
                    )
                second_call = executor.submit(second)
                with engine.connect().execution_options(
                    isolation_level="AUTOCOMMIT"
                ) as monitor:
                    deadline = monotonic() + 10
                    while monotonic() < deadline:
                        if second_at_commit.is_set() or monitor.scalar(
                            text("""
                            SELECT EXISTS (
                                SELECT 1 FROM pg_stat_activity
                                WHERE datname = current_database() AND pid <> pg_backend_pid()
                                  AND application_name = current_setting('application_name')
                                  AND :first_pid = ANY(pg_blocking_pids(pid))
                            )
                        """),
                            {"first_pid": first_pid},
                        ):
                            break
                        if second_call.done():
                            pytest.fail(
                                f"Second request finished without overlap: {second_call.result()}"
                            )
                        second_at_commit.wait(0.05)
                    else:
                        pytest.fail(
                            "Second transaction neither reached COMMIT nor waited on the first"
                        )
            finally:
                release.set()
            return first_call.result(timeout=35), second_call.result(timeout=35)
    finally:
        event.remove(engine, "commit", hold_commit)
        event.remove(engine, "after_cursor_execute", track_write)


def test_concurrent_as_fed_replacements(api_app, staff_client, seeded_nutrients):
    """CHECK-API-PG-NUTRIENTS-CONCURRENT"""
    engine = get_engine()
    with (
        staff_client(api_app) as first,
        staff_client(api_app, "editor@example.test") as second,
    ):
        food = body(
            first.post(
                "/foods",
                json={
                    "name": "Synthetic concurrent food",
                    "type": "commercial",
                },
            ),
            201,
        )
        food_id = UUID(food["uuid"])
        assert food["nutrient_values"] == []
        with get_session_factory()() as db:
            db.add(
                FoodNutrientValue(
                    food_uuid=food_id,
                    nutrient_uuid=seeded_nutrients["CP"],
                    value=Decimal("99"),
                    basis="per_100g_dm",
                    value_status="measured",
                )
            )
            db.commit()

        set_a = [("CP", 11, "measured"), ("Ca", 125, "measured")]
        set_b = [("CP", 22, "calculated"), ("P", 240, "estimated")]
        url = f"/foods/{food_id}/nutrient-values"

        def replace(client, values):
            return client.put(
                url,
                json=[
                    {"code": code, "value": value, "value_status": status}
                    for code, value, status in values
                ],
            )

        responses = overlap(
            engine,
            lambda: replace(first, set_a),
            lambda: replace(second, set_b),
            first_write="INSERT INTO FOOD_NUTRIENT_VALUES",
            second_write="INSERT INTO FOOD_NUTRIENT_VALUES",
        )

    for response in responses:
        body(response, 200)
    engine.dispose()
    with engine.connect() as db:
        rows = db.execute(
            text("""
            SELECT n.code, v.value, v.value_status, v.basis, v.source_uuid
            FROM food_nutrient_values v JOIN nutrients n ON n.uuid = v.nutrient_uuid
            WHERE v.food_uuid = :food_id
        """),
            {"food_id": food_id},
        ).all()
    as_fed = [
        (code, value, status, source)
        for code, value, status, basis, source in rows
        if basis == "per_100g_as_fed"
    ]
    allowed = [
        sorted((code, Decimal(value), status, None) for code, value, status in payload)
        for payload in (set_a, set_b)
    ]
    assert [tuple(row) for row in rows if row.basis != "per_100g_as_fed"] == [
        ("CP", Decimal("99"), "measured", "per_100g_dm", None),
    ]
    assert sorted(as_fed, key=lambda row: row[0]) in allowed


@pytest.fixture
def pending_visit(api_app, staff_client):
    with staff_client(api_app) as staff, TestClient(api_app, headers=CSRF) as owner:
        code = body(staff.get("/join-codes/current"), 200)["code"]
        body(
            owner.post(
                "/owner/register",
                json={
                    "code": code,
                    "name": "Synthetic owner",
                    "email": "visit@example.test",
                    "phone": "+70000000000",
                    "password": "synthetic owner password",
                },
            ),
            201,
        )
        animal = body(
            owner.post("/owner/animals", json={"name": "QA dog", "species": "dog"}), 201
        )
        listing = f"/owner/animals/{animal['uuid']}/visits"
        visit = body(
            owner.post(
                listing,
                json={
                    "reason": "Synthetic follow-up",
                    "proposed_starts_at": "2030-03-01T10:00:00Z",
                },
            ),
            201,
        )
        yield owner, listing, UUID(visit["uuid"])


def confirmation(starts_at):
    return {
        "starts_at": starts_at,
        "duration_min": 45,
        "visit_type": "consultation",
        "registration": {"mode": "create"},
    }


def test_concurrent_visit_confirmation(api_app, staff_client, pending_visit, tmp_path):
    """CHECK-API-PG-VISIT-CONFIRM-CONCURRENT"""
    owner, _, visit_id = pending_visit
    uploaded = body(
        owner.post(
            f"/owner/visits/{visit_id}/files",
            files={
                "file": ("notes.pdf", PDF, "application/pdf"),
            },
        ),
        201,
    )
    engine = get_engine()
    url = f"/visit-requests/{visit_id}/confirm"
    with (
        staff_client(api_app) as first,
        staff_client(api_app, "editor@example.test") as second,
    ):
        confirmed, rejected = overlap(
            engine,
            lambda: first.post(url, json=confirmation(FIRST_START)),
            lambda: second.post(url, json=confirmation(SECOND_START)),
            first_write="INSERT INTO APPOINTMENTS",
        )
    assert body(confirmed, 200)["status"] == "scheduled"
    assert rejected.status_code == 409, rejected.text
    engine.dispose()
    with engine.connect() as db:
        request = db.execute(
            text("""
            SELECT appointment_uuid, patient_uuid, status, confirmed_starts_at, owner_account_uuid
            FROM visit_requests WHERE uuid = :visit_id
        """),
            {"visit_id": visit_id},
        ).one()
        assert request.status == "scheduled"
        assert request.confirmed_starts_at == datetime.fromisoformat(FIRST_START)
        (appointment,) = db.execute(
            text("SELECT uuid, patient_uuid, starts_at, status FROM appointments")
        )
        assert tuple(appointment) == (
            request.appointment_uuid,
            request.patient_uuid,
            datetime.fromisoformat(FIRST_START),
            "scheduled",
        )
        (registration,) = db.execute(
            text("""
            SELECT status, client_uuid FROM owner_registrations WHERE owner_account_uuid = :owner_id
        """),
            {"owner_id": request.owner_account_uuid},
        )
        assert (
            registration.status == "accepted" and registration.client_uuid is not None
        )
        (attachment,) = db.execute(
            text("SELECT patient_uuid, storage_key, uploaded_by_owner FROM attachments")
        )
        assert (
            attachment.patient_uuid == request.patient_uuid
            and attachment.uploaded_by_owner
        )
        (source,) = db.execute(
            text("""
            SELECT storage_key, gallery_copied FROM visit_request_files WHERE uuid = :file_id
        """),
            {"file_id": UUID(uploaded["uuid"])},
        )
        assert source.gallery_copied and source.storage_key != attachment.storage_key
    storage = tmp_path / "attachments"
    assert {path.name for path in storage.iterdir()} == {
        source.storage_key,
        attachment.storage_key,
    }
    assert (storage / attachment.storage_key).read_bytes() == PDF


def test_concurrent_charge_edit_cannot_change_paid_amount(
    api_app, staff_client, pending_visit
):
    """CHECK-API-PG-CHARGE-CONCURRENT"""
    owner, _, visit_id = pending_visit
    engine = get_engine()
    amount = "1500.50"
    with (
        staff_client(api_app) as payer,
        staff_client(api_app, "editor@example.test") as editor,
    ):
        confirmed = body(
            payer.post(
                f"/visit-requests/{visit_id}/confirm", json=confirmation(FIRST_START)
            ),
            200,
        )
        with engine.connect() as db:
            appointment_id = db.execute(
                text("""
                SELECT appointment_uuid FROM visit_requests WHERE uuid = :visit_id
            """),
                {"visit_id": visit_id},
            ).scalar_one()
        url = f"/appointments/{appointment_id}"
        unpaid = body(
            payer.patch(url, json={"status": "completed", "amount_rub": amount}), 200
        )
        assert (unpaid["amount_rub"], unpaid["paid"]) == (amount, False)
        paid, edit = overlap(
            engine,
            lambda: payer.patch(url, json={"paid": True}),
            lambda: editor.patch(url, json={"amount_rub": "1700.00"}),
            first_write="UPDATE APPOINTMENTS",
            second_write="UPDATE APPOINTMENTS",
        )
    result = body(paid, 200)
    assert (result["amount_rub"], result["paid"]) == (amount, True)
    assert body(edit, 422)["detail"] == "Оплаченная сумма не изменяется"
    engine.dispose()
    with engine.connect() as db:
        stored = db.execute(
            text("""
            SELECT amount_rub, paid FROM appointments WHERE uuid = :appointment_id
        """),
            {"appointment_id": appointment_id},
        ).one()
        assert tuple(stored) == (Decimal(amount), True)
    (owner_visit,) = body(
        owner.get(f"/owner/animals/{confirmed['patient_uuid']}/visits"), 200
    )
    assert owner_visit["uuid"] == str(visit_id)
    assert (owner_visit["amount_rub"], owner_visit["paid"]) == (amount, True)
