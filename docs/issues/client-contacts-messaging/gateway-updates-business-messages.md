---
source_prd: docs/prd/2026-11-27_client-contacts-messaging_prd.md
prd_id: 2026-11-27-client-contacts-messaging
cycle_id: 2026-11-27-client-contacts-messaging
cycle_slug: client-contacts-messaging
project_doc: docs/PROJECT.md
status: Done
complexity: L
criticality: Blocker
---

# Gateway Updates Become Business Messages

## Implementation Status
Status: Done

## Description
Stored private Telegram updates stay available after a bot disconnect. Business processing can select the ones that are transport-complete and not yet consumed. A transport retry does not hide them and does not create a conversation message. Group, channel, and other non-private updates stay outside the conversation.

## Requirements
- Add an Alembic revision whose `down_revision` is the current head. Add nullable `business_consumed_at` timestamptz on `telegram_updates`. Do not change `transport_status`, `attempt_count`, `claimed_at`, or `transport_completed_at`.
- Add index `ix_telegram_updates_business_pending` on `(created_at, uuid)` with predicate `transport_status = 'complete' AND business_consumed_at IS NULL`.
- Add `unconsumed_updates(session)` in `telegram/worker.py`. It returns rows where `transport_status` is `complete` and `business_consumed_at` is null, ordered by `created_at`, then `uuid`. It does not update those rows.
- `mark_transport_complete`, `record_transport_failure`, and `release_abandoned_claims` must not write `business_consumed_at`. A row already `complete` is not claimed again by `claim_next`.
- Disconnect in `disconnect_clinic_bot` must not delete `telegram_updates` and must not set `business_consumed_at`.
- This issue does not insert `clinic_contacts`, `clinic_conversations`, or conversation messages. It does not call Telegram.
- `telegram/intake.py` keeps the current rule: only private `message` and `edited_message` are stored. Group, channel, and other update kinds are acknowledged and do not insert a row, so `unconsumed_updates` cannot return them.
- In `docs/PROJECT.md` Known Decisions, state that business processing selects transport-complete `telegram_updates` whose `business_consumed_at` is null, and that disconnect keeps those rows.

## Acceptance Criteria
- After the transport worker marks a private update `complete`, `unconsumed_updates` returns that uuid and `business_consumed_at` is still null.
- Running `mark_transport_complete` again, or restarting the transport worker, leaves `business_consumed_at` null and does not insert a conversation message.
- `disconnect_clinic_bot` leaves the `complete` row in place with `business_consumed_at` null.
- A group or channel update fixture that the intake already acknowledges still produces no `telegram_updates` row.
- `claim_next` does not return a row whose `transport_status` is `complete`.

## Dependencies
- The shipped `telegram_updates` table and transport worker from cycle `telegram-bot-gateway`.
- Alembic head at implementation time. Chain this revision after whatever head is current; do not edit `0043_telegram_updates`.

## Files Likely Touched
- `apps/api/alembic/versions/`
- `apps/api/src/vetdietderm_api/telegram/models.py`
- `apps/api/src/vetdietderm_api/telegram/worker.py`
- `apps/api/src/vetdietderm_api/telegram/intake.py`
- `apps/api/src/vetdietderm_api/owners/clinic_bots.py`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Add `business_consumed_at` and the partial index in a new Alembic revision and on `TelegramUpdate`.
- [x] Add `unconsumed_updates(session)` with the filter and order in Requirements. Do not set `business_consumed_at` there.
- [x] Confirm `mark_transport_complete`, `record_transport_failure`, `release_abandoned_claims`, and `disconnect_clinic_bot` do not write `business_consumed_at` or delete update rows.
- [x] Add the Known Decisions sentence in `docs/PROJECT.md`.
- [x] Run the checks in Verification.

## Verification
- `uv run --project apps/api python -c "from vetdietderm_api.telegram.worker import unconsumed_updates, mark_transport_complete"` imports.
- Insert a `telegram_updates` row with `transport_status` `complete` and null `business_consumed_at`. Confirm `unconsumed_updates` returns it. Call `mark_transport_complete` on that uuid and confirm `business_consumed_at` is still null.
- Insert a second row with `transport_status` `queued`. Confirm `claim_next` can return it and `unconsumed_updates` does not.
- Read `disconnect_clinic_bot` and confirm it does not delete from `telegram_updates`.
- Post a fixture update whose `message.chat.type` is `group` through the intake path and confirm no new `telegram_updates` row.
