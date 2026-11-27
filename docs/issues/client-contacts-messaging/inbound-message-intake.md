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

# Inbound Message Intake

## Implementation Status
Status: Done

## Description
Business processing reads stored private updates after transport completion and turns each one into a single conversation message. Processing the same update again does not create a second message. An edit changes the stored message only when it is newer. A Client and a Patient are not created by that message.

## Requirements
- Add `conversation_messages` in a new Alembic revision chained from the current head. Columns: `uuid` UUID primary key, `clinic_id` UUID not null, `conversation_uuid` UUID not null foreign key to `clinic_conversations.uuid` ON DELETE CASCADE, `direction` text not null check `inbound` or `outbound`, `channel` text not null check `telegram`, `origin` text not null check `telegram` or `owner_cabinet` default `telegram`, `occurred_at` timestamptz not null, `bot_id` bigint null, `telegram_chat_id` bigint null, `telegram_message_id` bigint null, `source_update_id` bigint null, `edited_at` timestamptz null, `body` text null, `author_user_id` UUID null, `author_label` text null, `source_chat_message_uuid` UUID null, `created_at` timestamptz not null.
- Partial unique index `uq_conversation_messages_external` on `(bot_id, telegram_chat_id, telegram_message_id)` where all three are not null. Partial unique index `uq_conversation_messages_source` on `source_chat_message_uuid` where it is not null. Telegram intake leaves `source_chat_message_uuid` null. This issue does not copy Owner Cabinet rows.
- Do not add `patient_uuid`, attachment columns, or `delivery_status` in this revision. Those belong to the later issues.
- Add `run_business_worker` and start one task from the FastAPI lifespan next to `run_worker`. Cancel and await it on shutdown. Use `get_session_factory()`, not a request session. Decorate the worker with `@logger.catch`. On an empty queue, sleep 1 second.
- Claim with `SELECT ... WHERE transport_status = 'complete' AND business_consumed_at IS NULL ORDER BY created_at, uuid LIMIT 1 FOR UPDATE SKIP LOCKED`. In that same transaction, call `open_contact` and insert or update the conversation message, then set `business_consumed_at`. Do not change `transport_status`.
- Resolve the clinic and bot from the `telegram_updates` row. Read the private `message` or `edited_message`. User id is `from.id`. Chat id is `chat.id`. A missing `from.id` or `chat.id` leaves the update unconsumed and logs the update uuid only.
- The first private update, including `/start` and a message with no text, creates the contact, one conversation, and one inbound message. It does not insert a client or a patient. `body` is `message.text` when that string is present, otherwise null. `occurred_at` is the Telegram `date` as UTC. `direction` is `inbound`, `origin` is `telegram`, `channel` is `telegram`.
- Call `open_contact` so a later user payload refreshes `profile_name` and `username` and does not change `local_name`.
- External identity is `bot_id`, `chat_id`, and `message_id`. A second delivery of the same identity does not insert another row. If the unique index conflicts, keep the existing row and still set `business_consumed_at` on the update being processed.
- An `edited_message` updates that identity only when the incoming version is newer. Newer means a greater Telegram `edit_date`, and the greater `update_id` when `edit_date` is absent or equal. When the edit arrives first, create the message from the edit and store its `edit_date` in `edited_at`. A later original with no `edit_date`, or an older `edit_date`, does not change `body` or `edited_at`. Still mark that older update consumed.
- Inbound messages leave `author_user_id` and `author_label` null. They do not set a patient.
- Log the update uuid and the exception type on failure. Do not log `payload`, the bot token, or the webhook secret. A failed transaction leaves `business_consumed_at` null so a later pass can try again. The unique index stops a duplicate message.
- `GET /contacts/{contact_id}/messages` returns that clinic's messages ordered by `occurred_at`, then `uuid`. A viewer can read. Another clinic's contact returns 404.
- In `docs/PROJECT.md`, state that a transport-complete private update becomes one inbound conversation message and that a repeat does not insert a second row.

## Acceptance Criteria
- A private `message` with text creates one contact, one conversation, and one inbound message, then sets `business_consumed_at`. `clients` and `patients` counts stay the same.
- A second pass over that update does not add a message. A second update with the same `bot_id`, `chat_id`, and `message_id` does not add a message.
- An `edited_message` with a later `edit_date` changes `body` and sets `edited_at`. An original update that arrives after that edit leaves `body` and `edited_at` as the edit wrote them, and its `business_consumed_at` is set.
- An edit that arrives before the original creates the message. `/start` with no other text creates a message whose `body` is `/start` or null when Telegram sent no text, and still creates the contact.
- `GET /contacts/{id}/messages` as a viewer returns the inbound message. The same id from another clinic returns 404.
- Restarting the API while a business transaction is open leaves `business_consumed_at` null and the unique index still prevents two messages for one identity.

## Dependencies
- `docs/issues/client-contacts-messaging/contact-and-conversation.md`
- `docs/issues/client-contacts-messaging/gateway-updates-business-messages.md`
- `unconsumed_updates` selection rule and `open_contact` from those issues.

## Files Likely Touched
- `apps/api/alembic/versions/`
- `apps/api/src/vetdietderm_api/messaging/models.py`
- `apps/api/src/vetdietderm_api/messaging/intake.py`
- `apps/api/src/vetdietderm_api/messaging/router.py`
- `apps/api/src/vetdietderm_api/messaging/schemas.py`
- `apps/api/src/vetdietderm_api/main.py`
- `apps/api/src/vetdietderm_api/telegram/worker.py`
- `docs/PROJECT.md`
- `packages/api-contract/openapi.json`
- `packages/api-contract/src/generated.ts`

## Implementation Steps
- [x] Add the `conversation_messages` revision, model, and both partial unique indexes.
- [x] Implement the version compare and the one-transaction consume path in `messaging/intake.py`. Call `open_contact`. Set `business_consumed_at` only after the message insert or the newer-edit update.
- [x] Add `run_business_worker` and start one lifespan task beside `run_worker`.
- [x] Add `GET /contacts/{contact_id}/messages` for the contact's clinic, including viewers.
- [x] Add the PROJECT.md sentence and run `pnpm api:generate`.
- [x] Run the checks in Verification.

## Verification
- `uv run --project apps/api python -c "from vetdietderm_api.main import app"` imports, and the lifespan source starts `run_worker` and `run_business_worker`.
- Insert a transport-complete private text update. Run one business transaction. Confirm one message, one contact, `business_consumed_at` set, and unchanged client and patient counts. Run it again and confirm the message count is unchanged.
- Insert an `edited_message` for that identity with a higher `edit_date`. Confirm `body` changes once. Insert the original `message` after that and confirm `body` stays on the edit.
- Insert an `edited_message` for a new identity before any original. Confirm one message exists. Then insert the original and confirm the row count is still one and `body` is unchanged.
- `GET /contacts/{id}/messages` as a viewer returns 200. The same path with another clinic's session returns 404.
- `pnpm api:check` passes.
