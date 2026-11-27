---
source_prd: docs/prd/2026-11-26_telegram-bot-gateway_prd.md
prd_id: 2026-11-26-telegram-bot-gateway
cycle_id: 2026-11-26-telegram-bot-gateway
cycle_slug: telegram-bot-gateway
project_doc: docs/PROJECT.md
status: Done
complexity: M
criticality: High
---

# Durable Worker

## Implementation Status
Status: Done

## Description
The existing FastAPI process runs one worker for every clinic bot. The worker claims queued `telegram_updates` atomically in PostgreSQL, marks transport complete, and leaves those rows available for cycle #13. A restart returns an unfinished claim to the queue. A transport failure is retried and does not stop other clinics.

## Requirements
- Start exactly one worker task from the FastAPI lifespan in `create_app`. Cancel and await that task on shutdown. Do not start a process per clinic bot. Do not add Redis or another broker.
- Claim with one statement: update a row from `transport_status` `queued` to `claimed`, set `claimed_at` to the current timestamp, and return its `uuid`. The selected row is `SELECT ... WHERE transport_status = 'queued' ORDER BY created_at, uuid LIMIT 1 FOR UPDATE SKIP LOCKED`. Two claimers cannot own the same row.
- On process startup, before the claim loop, release rows left in `claimed`. For each of those rows, increment `attempt_count`. When `attempt_count` reaches 3, set `transport_status` to `error` and clear `claimed_at`. Otherwise set `transport_status` back to `queued` and clear `claimed_at`. Do not change rows already in `complete` or `error`.
- The handler in this cycle sets `transport_status` to `complete` and `transport_completed_at` to the current timestamp, then clears `claimed_at`. It does not create a client, patient, or chat message. It does not call Telegram. It does not set a business-consumption column. A later transport retry of a `complete` row does not run, so the row stays visible to cycle #13.
- The fixed retry limit is 3. The PRD leaves the exact number open; this issue chooses 3. `record_transport_failure` increments `attempt_count`. At 3 attempts it sets `transport_status` to `error` and clears `claimed_at`. Below 3 it sets `transport_status` back to `queued` and clears `claimed_at`. The loop calls that function when the handler raises, commits, logs the update `uuid` and the attempt count with loguru, and continues. Do not log `payload`, the bot token, or the webhook secret.
- When the claim finds no row, sleep 1 second and look again.
- Use `get_session_factory()` for the worker sessions. Do not reuse a request-scoped session.
- Update `docs/PROJECT.md` so the API process owns one PostgreSQL-backed worker, an unfinished claim is claimable again after restart, and the transport-complete mark is not business consumption.

## Acceptance Criteria
- After a private update is stored, the worker moves that row from `queued` to `complete` and sets `transport_completed_at`. No client, patient, or chat message is created, and no Telegram method is called.
- Two concurrent claim statements do not return the same `uuid`.
- Stopping the API while a row is `claimed`, then starting it again, makes that row `queued` when `attempt_count` is still below 3, or `error` when the release increments it to 3. A `complete` row stays `complete` across the restart.
- `record_transport_failure` twice, then `mark_transport_complete`, leaves that row `complete`. `record_transport_failure` three times leaves the row `error`, and `claim_next` still returns another clinic's queued row.
- A `complete` row remains selectable by `transport_status = 'complete'`. Disconnect does not delete it.

## Dependencies
- `docs/issues/telegram-bot-gateway/public-intake.md`
- The `telegram_updates` columns `transport_status`, `attempt_count`, `claimed_at`, `transport_completed_at`, `created_at`, and `uuid` from that issue.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/telegram/worker.py`
- `apps/api/src/vetdietderm_api/main.py`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Add `telegram/worker.py` with `release_abandoned_claims(session)`, `claim_next(session)`, `mark_transport_complete(session, uuid)`, and `record_transport_failure(session, uuid)`. `mark_transport_complete` writes only the transport columns from Requirements.
- [x] Add `run_worker()` which releases abandoned claims once, then loops: claim, mark complete, or apply the 3-attempt failure rule. Sleep 1 second when the queue is empty. Catch a single-row exception inside the loop, log the update uuid and attempt count with loguru, and continue.
- [x] Decorate `run_worker` with `@logger.catch`. Keep the inner handler so one failed update does not end the task.
- [x] Start one `asyncio.Task` for `run_worker` in the lifespan and cancel it after `yield`.
- [x] Update the worker sentences in `docs/PROJECT.md`.
- [x] Run the checks in Verification.

## Verification
- `uv run --project apps/api python -c "from vetdietderm_api.main import app"` imports, and the lifespan source starts one worker task.
- Insert two `telegram_updates` rows with `transport_status` `queued` for different `clinic_id` values. Run `claim_next` in two sessions. Confirm the returned uuids differ.
- Run `mark_transport_complete` on one claimed row. Confirm `transport_status` is `complete`, `transport_completed_at` is set, and `chat_messages` has no new row.
- Set a row to `claimed` with `attempt_count` 2, call `release_abandoned_claims`, and confirm it becomes `error`. Set another to `claimed` with `attempt_count` 0 and confirm it becomes `queued` with `attempt_count` 1.
- Call `record_transport_failure` three times on one queued row and confirm `transport_status` is `error`. On a second queued row, call it once and then `mark_transport_complete`, and confirm that row is `complete`.
- Confirm a `complete` row is still returned by a select on `transport_status = 'complete'` after disconnect of that clinic's bot.
