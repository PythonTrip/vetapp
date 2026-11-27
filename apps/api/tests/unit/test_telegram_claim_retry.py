import asyncio
from contextlib import nullcontext
from unittest.mock import Mock
from uuid import uuid4

import pytest

from vetdietderm_api.telegram import worker


def test_worker_resumes_after_claim_failure_and_can_be_cancelled(monkeypatch):
    update_id = uuid4()
    session = Mock()
    factory = Mock()
    factory.begin.side_effect = lambda: nullcontext(session)
    monkeypatch.setattr(worker, "get_session_factory", lambda: factory)
    monkeypatch.setattr(worker, "release_abandoned_claims", Mock())
    claim = Mock(side_effect=[ConnectionError(), update_id, None])
    monkeypatch.setattr(worker, "claim_next", claim)
    complete = Mock()
    monkeypatch.setattr(worker, "mark_transport_complete", complete)

    async def exercise():
        idle = asyncio.Event()
        delays = []

        async def sleep(seconds):
            delays.append(seconds)
            if len(delays) == 2:
                idle.set()
                await asyncio.Future()

        monkeypatch.setattr(worker.asyncio, "sleep", sleep)
        task = asyncio.create_task(worker.run_worker())
        try:
            await asyncio.wait_for(idle.wait(), timeout=5)
        finally:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        assert delays == [1, 1]

    asyncio.run(exercise())
    complete.assert_called_once_with(session, update_id)
    assert claim.call_count == 3
