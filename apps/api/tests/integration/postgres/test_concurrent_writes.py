from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Event
from time import monotonic
from uuid import UUID

import pytest
from sqlalchemy import event, text

from vetdietderm_api.catalog.models import FoodNutrientValue
from vetdietderm_api.db import get_engine, get_session_factory


pytestmark = pytest.mark.integration

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
