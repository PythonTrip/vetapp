"""Idle clinical requests must not open a second pooled connection."""

from threading import BoundedSemaphore, Thread
from uuid import uuid4

from vetdietderm_api.clinic_transfer import clinic_invite_transfer


def test_idle_invite_check_uses_one_connection() -> None:
    opened = 0

    class Bind:
        class dialect:
            name = "postgresql"

    class FakeSession:
        def __enter__(self):
            nonlocal opened
            opened += 1
            if opened > 1:
                raise AssertionError("idle invite check opened a second connection")
            return self

        def __exit__(self, *_exc: object) -> bool:
            nonlocal opened
            opened -= 1
            return False

        def get_bind(self) -> Bind:
            return Bind()

        def execute(self, *_args: object, **_kwargs: object) -> None:
            raise AssertionError("idle invite check took the advisory lock")

        def scalar(self, *_args: object, **_kwargs: object) -> None:
            return None

    def session_factory():
        return FakeSession

    result = clinic_invite_transfer(
        None,  # type: ignore[arg-type]
        {"user_id": str(uuid4())},
        None,
        get_session_factory=session_factory,
        authenticated_call=lambda *_args, **_kwargs: None,
    )

    assert result is None
    assert opened == 0


def test_concurrent_idle_checks_finish_on_a_two_slot_pool() -> None:
    pool = BoundedSemaphore(2)
    errors: list[str] = []

    class Bind:
        class dialect:
            name = "postgresql"

    class FakeSession:
        def __enter__(self):
            if not pool.acquire(timeout=0.5):
                raise TimeoutError("pool")
            return self

        def __exit__(self, *_exc: object) -> bool:
            pool.release()
            return False

        def get_bind(self) -> Bind:
            return Bind()

        def execute(self, *_args: object, **_kwargs: object) -> None:
            errors.append("lock")

        def scalar(self, *_args: object, **_kwargs: object) -> None:
            return None

    def session_factory():
        return FakeSession

    def check() -> None:
        try:
            clinic_invite_transfer(
                None,  # type: ignore[arg-type]
                {"user_id": str(uuid4())},
                None,
                get_session_factory=session_factory,
                authenticated_call=lambda *_args, **_kwargs: None,
            )
        except Exception as exc:
            errors.append(type(exc).__name__)

    workers = [Thread(target=check) for _ in range(8)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=3)
    assert errors == []
    assert not any(worker.is_alive() for worker in workers)
