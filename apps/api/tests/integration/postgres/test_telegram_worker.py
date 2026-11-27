from concurrent.futures import ThreadPoolExecutor
from time import monotonic, sleep
from uuid import uuid4

from fastapi.testclient import TestClient

from vetdietderm_api.clock import utc_now
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.telegram import worker
from vetdietderm_api.telegram.models import TelegramUpdate


def update_row(update_id, **state):
    return TelegramUpdate(
        uuid=uuid4(),
        clinic_id=uuid4(),
        integration_id=uuid4(),
        bot_id=1,
        update_id=update_id,
        update_kind="message",
        payload={},
        **state,
    )


def transport_state(row):
    return row.transport_status, row.attempt_count, row.claimed_at


def test_claim_skips_a_row_locked_by_another_claimer(api_app):
    factory = get_session_factory()
    with factory.begin() as db:
        created_at = utc_now()
        rows = [update_row(i, created_at=created_at) for i in (1, 2)]
        db.add_all(rows)
    first, second = sorted(row.uuid for row in rows)

    def claim_in_second_session():
        with factory.begin() as db:
            return worker.claim_next(db)

    with ThreadPoolExecutor(max_workers=1) as executor, factory.begin() as db:
        assert worker.claim_next(db) == first
        assert executor.submit(claim_in_second_session).result(timeout=5) == second

    with factory.begin() as db:
        assert worker.claim_next(db) is None
        for uuid in (first, second):
            row = db.get(TelegramUpdate, uuid)
            assert row.transport_status == "claimed" and row.claimed_at is not None


def test_startup_recovers_abandoned_claims_and_preserves_completion(api_app):
    factory = get_session_factory()
    with factory.begin() as db:
        replay = update_row(1, transport_status="claimed", claimed_at=utc_now(), attempt_count=0)
        exhausted = update_row(2, transport_status="claimed", claimed_at=utc_now(), attempt_count=2)
        done = update_row(3, transport_status="complete", transport_completed_at=utc_now())
        db.add_all([replay, exhausted, done])

    # Inspect the intermediate state, then roll back so the lifespan sees the
    # same persisted claims a stopped API process would leave behind.
    with factory() as db:
        worker.release_abandoned_claims(db)
        assert transport_state(db.get(TelegramUpdate, replay.uuid)) == ("queued", 1, None)
        assert transport_state(db.get(TelegramUpdate, exhausted.uuid)) == ("error", 3, None)
        assert transport_state(db.get(TelegramUpdate, done.uuid)) == ("complete", 0, None)

    with TestClient(api_app):
        deadline = monotonic() + 5
        while True:
            with factory() as db:
                row = db.get(TelegramUpdate, replay.uuid)
                if row.transport_status == "complete":
                    assert transport_state(row) == ("complete", 1, None)
                    assert row.transport_completed_at is not None
                    assert transport_state(db.get(TelegramUpdate, exhausted.uuid)) == ("error", 3, None)
                    assert db.get(TelegramUpdate, done.uuid).transport_completed_at == done.transport_completed_at
                    break
            assert monotonic() < deadline, "The restarted API did not replay the abandoned claim"
            sleep(0.05)


def test_row_failure_retries_then_worker_continues_with_another_clinic(api_app, monkeypatch):
    factory = get_session_factory()
    with factory.begin() as db:
        recoverable = update_row(1)
        failing = update_row(2)
        next_clinic = update_row(3)
        db.add_all([recoverable, failing, next_clinic])

    def complete(db, uuid):
        if uuid == failing.uuid:
            raise RuntimeError("simulated handler failure")
        worker_complete(db, uuid)

    worker_complete = worker.mark_transport_complete
    monkeypatch.setattr(worker, "mark_transport_complete", complete)
    with factory.begin() as db:
        assert worker.record_transport_failure(db, recoverable.uuid) == 1
        assert worker.record_transport_failure(db, recoverable.uuid) == 2
        worker.mark_transport_complete(db, recoverable.uuid)
        assert worker.record_transport_failure(db, recoverable.uuid) is None

    with TestClient(api_app):
        deadline = monotonic() + 5
        while True:
            with factory() as db:
                if db.get(TelegramUpdate, next_clinic.uuid).transport_status == "complete":
                    assert transport_state(db.get(TelegramUpdate, failing.uuid)) == ("error", 3, None)
                    assert transport_state(db.get(TelegramUpdate, recoverable.uuid)) == ("complete", 2, None)
                    break
            assert monotonic() < deadline, "A failed update blocked the next clinic"
            sleep(0.05)
