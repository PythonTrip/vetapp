from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.postgres_auth_stub import CLINIC_ID, STAFF_IDS


pytestmark = pytest.mark.integration
API_ROOT = Path(__file__).resolve().parents[3]
LEGACY_REVISION = "0039_owner_problem_request"
START = datetime(2030, 4, 12, 10, tzinfo=UTC)
APPOINTMENT_ID = UUID(int=101)
PATIENT_ID = UUID(int=102)
VISIT_ID = UUID(int=103)


def seed_legacy_visit(engine):
    values = {
        "client": UUID(int=104),
        "owner": UUID(int=105),
        "patient": PATIENT_ID,
        "appointment": APPOINTMENT_ID,
        "visit": VISIT_ID,
        "starts": START,
        "tenant": UUID(CLINIC_ID),
        "staff": UUID(STAFF_IDS["owner@example.test"]),
    }
    with engine.begin() as db:
        for insert in (
            """
            INSERT INTO clients (uuid, name, created_at, updated_at, tenant_id, created_by)
            VALUES (:client, 'Legacy client', :starts, :starts, :tenant, :staff)
            """,
            """
            INSERT INTO patients (
                uuid, client_uuid, name, species, allergies, chronic_conditions,
                created_at, updated_at, tenant_id, created_by
            ) VALUES (:patient, :client, 'Legacy dog', 'dog', '[]', '[]',
                      :starts, :starts, :tenant, :staff)
            """,
            """
            INSERT INTO owner_accounts (uuid, name, phone, created_at, updated_at)
            VALUES (:owner, 'Legacy owner', '+70000000000', :starts, :starts)
            """,
            """
            INSERT INTO appointments (
                uuid, patient_uuid, starts_at, duration_min, visit_type, status,
                created_at, updated_at, tenant_id, created_by
            ) VALUES (:appointment, :patient, :starts, 45, 'consultation', 'completed',
                      :starts, :starts, :tenant, :staff)
            """,
            """
            INSERT INTO visit_requests (
                uuid, owner_account_uuid, patient_uuid, appointment_uuid, proposed_starts_at,
                confirmed_starts_at, duration_min, visit_type, status, reason, created_at, updated_at
            ) VALUES (:visit, :owner, :patient, :appointment, :starts,
                      :starts, 45, 'consultation', 'completed', 'Legacy problem', :starts, :starts)
            """,
        ):
            db.execute(text(insert), values)


@pytest.mark.parametrize("origin", ["fresh", "legacy"])
def test_alembic_head_preserves_appointments(
    origin, postgres_database, postgres_application, staff_client
):
    """CHECK-API-PG-ALEMBIC"""
    app, engine = postgres_application(postgres_database)
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    head = ScriptDirectory.from_config(config).get_current_head()
    assert head is not None
    if origin == "legacy":
        command.upgrade(config, LEGACY_REVISION)
        seed_legacy_visit(engine)
    command.upgrade(config, "head")
    if origin == "legacy":
        command.upgrade(config, "head")

    with engine.connect() as db:
        assert (
            db.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            == head
        )
        if origin == "legacy":
            preserved = db.execute(
                text("""
                SELECT a.uuid, a.patient_uuid, a.starts_at, a.status, a.amount_rub, a.paid,
                       v.uuid, v.patient_uuid, v.confirmed_starts_at, v.status
                FROM appointments a JOIN visit_requests v ON v.appointment_uuid = a.uuid
            """)
            ).one()
            assert tuple(preserved) == (
                APPOINTMENT_ID,
                PATIENT_ID,
                START,
                "completed",
                None,
                False,
                VISIT_ID,
                PATIENT_ID,
                START,
                "completed",
            )

    with staff_client(app) as staff:
        appointment_id = APPOINTMENT_ID
        if origin == "fresh":
            client = staff.post("/clients", json={"name": "Fresh client"})
            assert client.status_code == 201, client.text
            patient = staff.post(
                "/patients",
                json={
                    "name": "Fresh dog",
                    "species": "dog",
                    "client_uuid": client.json()["uuid"],
                },
            )
            assert patient.status_code == 201, patient.text
            appointment = staff.post(
                "/appointments",
                json={
                    "patient_uuid": patient.json()["uuid"],
                    "starts_at": START.isoformat(),
                    "duration_min": 45,
                    "visit_type": "consultation",
                    "status": "completed",
                },
            )
            assert appointment.status_code == 201, appointment.text
            appointment_id = UUID(appointment.json()["uuid"])

        url = f"/appointments/{appointment_id}"
        current = staff.get(url)
        assert current.status_code == 200, current.text
        assert current.json()["uuid"] == str(appointment_id)
        assert current.json()["amount_rub"] is None and current.json()["paid"] is False
        if origin == "legacy":
            assert current.json()["owner_problem"] == "Legacy problem"
        with pytest.raises(IntegrityError) as error, engine.begin() as db:
            db.execute(
                text("""
                UPDATE appointments SET amount_rub = NULL, paid = TRUE WHERE uuid = :id
            """),
                {"id": appointment_id},
            )
        assert error.value.orig.sqlstate == "23514"
        assert error.value.orig.diag.constraint_name == "ck_appointments_charge"
        changed = staff.patch(url, json={"amount_rub": "240.25"})
        assert changed.status_code == 200, changed.text
        assert changed.json()["amount_rub"] == "240.25"

    with engine.connect() as db:
        stored = db.execute(
            text("""
            SELECT amount_rub, paid FROM appointments WHERE uuid = :id
        """),
            {"id": appointment_id},
        ).one()
        assert tuple(stored) == (Decimal("240.25"), False)
