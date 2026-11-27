---
source_prd: docs/prd/2026-11-27_client-contacts-messaging_prd.md
prd_id: 2026-11-27-client-contacts-messaging
cycle_id: 2026-11-27-client-contacts-messaging
cycle_slug: client-contacts-messaging
project_doc: docs/PROJECT.md
status: Done
complexity: L
criticality: High
---

# Outbound Delivery

## Implementation Status
Status: Done

## Description
A staff reply is stored before Telegram is called. A repeated request for the same send returns that message and does not insert another. Telegram acceptance is stored once as sent. Definite non-acceptance is retried a finite number of times. An ambiguous result stays unconfirmed and is not sent again.

## Requirements
- Add columns on `conversation_messages` in a new Alembic revision chained from the current head: `delivery_status` text null, `delivery_attempt_count` integer not null default 0, `next_attempt_at` timestamptz null, `idempotency_key` text null, `target_bot_id` bigint null, `delivery_error` text null. Check `delivery_status` in `queued`, `sent`, `failed`, `unconfirmed` or null. Partial unique index on `(conversation_uuid, idempotency_key)` where `idempotency_key` is not null. Inbound and migrated rows leave `delivery_status` null.
- The automatic-attempt bound is 3. Constant name: `DELIVERY_ATTEMPT_LIMIT`. The product rule leaves the number open; this issue chooses 3, the same bound as transport `RETRY_LIMIT`.
- `POST /contacts/{contact_id}/messages` requires header `Idempotency-Key` of 1 to 200 characters. Assumption: the header is the identity of one outbound action, because the PRD requires a repeated request to return the existing message. The first request inserts one outbound row with `delivery_status` `queued`, `target_bot_id` equal to the clinic's current `clinic_bots.bot_id`, `author_user_id` and `author_label` from the signed-in user, and `origin` `telegram`. It returns 201. The same key and contact returns 200 and the same uuid with no second insert. A missing header returns 422.
- Body is text, one file, or both, checked by `validate_staff_composition` from the content issue. Neither text nor a file returns 422. The file is stored before the response, through the existing attachment store, and is not a gallery row.
- Accept the send only when this contact has an inbound `conversation_messages` row with `origin` `telegram`, `direction` `inbound`, and `bot_id` equal to the clinic's current `clinic_bots.bot_id`. A stored Telegram user id is not enough. `origin` `owner_cabinet` does not count. An inbound row for a previous bot id does not count. No current connected bot, or no qualifying inbound row, returns 422 and inserts nothing. Viewers receive 403.
- `run_delivery_worker` is one more lifespan task, cancelled on shutdown, using `get_session_factory()`. It claims `delivery_status` `queued` rows whose `next_attempt_at` is null or due, with `FOR UPDATE SKIP LOCKED`, ordered by `created_at`, then `uuid`.
- Before the HTTP call, if the clinic bot is disconnected and `clinic_bots.bot_id` still equals `target_bot_id`, leave the row `queued` and do not call Telegram. If `clinic_bots.bot_id` is different or null, set `failed` and do not send.
- When the worker will call Telegram, commit `delivery_status` `unconfirmed` and increment `delivery_attempt_count` first. A crash after that commit and before the result is saved leaves `unconfirmed`.
- After the call: `ok` true and an integer `result.message_id` sets `sent` and stores that id. `ok` false with a positive `parameters.retry_after`, or a connect failure before any response, sets `queued` and `next_attempt_at` at least `retry_after` seconds ahead when Telegram sent `retry_after`, otherwise now, but only when `delivery_attempt_count` is still below 3. At 3 such attempts, set `failed`. `ok` false without `retry_after` sets `failed`. Timeout, HTTP 5xx, or a non-JSON body leaves `unconfirmed`.
- A later worker does not claim `unconfirmed`. `POST /messages/{message_id}/retry` is allowed only for `failed`. It sets the same row back to `queued`, clears `delivery_error`, and does not insert a row. `sent` and `unconfirmed` return 409. A new composition with a new idempotency key inserts a new message.
- `save_clinic_bot` , when the stored `bot_id` changes to a different id, sets this clinic's `queued` messages to `failed` in that transaction and does not hand them to the new bot. `sent` and `unconfirmed` stay as they are. `disconnect_clinic_bot` does not change delivery status.
- `delivery_error` stores a scrubbed Telegram description, at most 500 characters, with the token and webhook secret removed. Logs name the message uuid and the status only.
- Send methods are `sendMessage`, `sendPhoto`, and `sendDocument` only. Reuse the host lock in `owners/telegram.py` so the token cannot change the host. Do not add a broker.
- In `docs/PROJECT.md`, state that outbound delivery is a PostgreSQL worker in the API process, sent means Telegram accepted the message, and unconfirmed is not retried automatically.

## Acceptance Criteria
- The first `POST` with an idempotency key stores one `queued` message and does not require Telegram to have answered before the response. The same key returns that uuid and the message count stays one.
- A contact with only an `owner_cabinet` message, or only an inbound message for a previous bot id, gets 422 and no new row.
- A definite connect failure before a response moves the row to `queued` until attempt 3, then `failed`. A Telegram `retry_after` of 5 keeps the next attempt at least 5 seconds later.
- After the worker commits `unconfirmed` and the process stops before the result is saved, a new worker leaves that row `unconfirmed` and does not call Telegram for it. `POST /messages/{id}/retry` on that row returns 409.
- `POST /messages/{id}/retry` on a `failed` row returns the same uuid with `queued`. A later send with a new key inserts a second message.
- Disconnecting the same bot leaves `queued` rows `queued`. Replacing `clinic_bots.bot_id` sets those `queued` rows to `failed` and leaves a `sent` row `sent`.
- A viewer `POST` returns 403. Tokens do not appear in `delivery_error`.

## Dependencies
- `docs/issues/client-contacts-messaging/contact-and-conversation.md`
- `docs/issues/client-contacts-messaging/inbound-message-intake.md`
- `docs/issues/client-contacts-messaging/message-content-and-attachments.md`
- Existing `clinic_bots` connect, replace, and disconnect flow.

## Files Likely Touched
- `apps/api/alembic/versions/`
- `apps/api/src/vetdietderm_api/messaging/models.py`
- `apps/api/src/vetdietderm_api/messaging/delivery.py`
- `apps/api/src/vetdietderm_api/messaging/router.py`
- `apps/api/src/vetdietderm_api/messaging/schemas.py`
- `apps/api/src/vetdietderm_api/main.py`
- `apps/api/src/vetdietderm_api/owners/telegram.py`
- `apps/api/src/vetdietderm_api/owners/clinic_bots.py`
- `docs/PROJECT.md`
- `packages/api-contract/openapi.json`
- `packages/api-contract/src/generated.ts`

## Implementation Steps
- [x] Add the delivery columns, check, and idempotency index.
- [x] Add `POST /contacts/{contact_id}/messages` and `POST /messages/{message_id}/retry` with the current-bot inbound gate and the staff composition check.
- [x] Add `run_delivery_worker` with the unconfirmed-before-call rule, the 3-attempt bound, and `retry_after`. Start it from the lifespan.
- [x] On bot id replacement, fail queued messages for that clinic. Leave queued messages in place on disconnect of the same bot.
- [x] Add the PROJECT.md sentence, run `pnpm api:generate`, and run the checks in Verification.

## Verification
- `uv run --project apps/api python -c "from vetdietderm_api.messaging.delivery import DELIVERY_ATTEMPT_LIMIT; assert DELIVERY_ATTEMPT_LIMIT == 3"` exits 0. The lifespan source starts the delivery worker.
- Post two sends with one idempotency key and confirm one row. Post a send for a contact whose only inbound `bot_id` is not the current bot and confirm 422.
- Simulate a connect failure three times and confirm the row ends `failed`. Simulate `retry_after` 5 and confirm `next_attempt_at` is at least 5 seconds ahead.
- Set a row to `unconfirmed` and run one worker pass. Confirm it is not selected and retry returns 409. Retry a `failed` row and confirm the uuid is unchanged and the status is `queued`.
- Change `clinic_bots.bot_id` and confirm previously `queued` rows are `failed` and a `sent` row stays `sent`. Disconnect without changing `bot_id` and confirm `queued` rows stay `queued`.
- `pnpm api:check` passes.
