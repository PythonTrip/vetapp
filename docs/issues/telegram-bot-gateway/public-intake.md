---
source_prd: docs/prd/2026-11-26_telegram-bot-gateway_prd.md
prd_id: 2026-11-26-telegram-bot-gateway
cycle_id: 2026-11-26-telegram-bot-gateway
cycle_slug: telegram-bot-gateway
project_doc: docs/PROJECT.md
status: Done
complexity: L
criticality: Blocker
---

# Public Intake

## Implementation Status
Status: Done

## Description
Telegram delivers updates to one deployment-wide HTTPS path. The path carries the clinic integration id, and the clinic is resolved from that stored id. A private `message` or `edited_message` is stored once and then acknowledged. Every other update kind is acknowledged and stored nowhere. Staff routes stay on the clinical session and the Next.js proxy.

## Requirements
- Alembic revision `0043_telegram_updates` revises `0042_clinic_bot_credentials` and creates `telegram_updates`:
  - `uuid` UUID primary key, default `uuid6`.
  - `clinic_id` UUID, not null.
  - `integration_id` UUID, not null.
  - `bot_id` bigint, not null.
  - `update_id` bigint, not null.
  - `update_kind` string, not null, check constraint values `message` and `edited_message`.
  - `payload` JSONB, not null. This is the Telegram update object. The clinic UI does not read it in this cycle.
  - `transport_status` string, not null, default `queued`, check constraint values `queued`, `claimed`, `complete`, and `error`.
  - `attempt_count` integer, not null, default 0.
  - `claimed_at` timestamptz, nullable.
  - `transport_completed_at` timestamptz, nullable.
  - `created_at` timestamptz, not null.
  - Unique constraint on (`bot_id`, `update_id`).
  - Index on (`transport_status`, `created_at`).
- There is no business-consumption column. Disconnect does not delete these rows.
- Replace the matching-secret 503 branch on `POST /telegram/webhooks/{integration_id}`. Keep the 404 and 401 branches from the clinic-bot contract. The route stays off the clinical session, off CSRF, and off `/v1/staff`.
- The expected body is a Telegram update. Invalid JSON returns 400 and writes no row. A missing `update_id` returns 400 and writes no row.
- When `message` or `edited_message` is present and `chat.type` is exactly `private`, insert one row and commit it before the response. `clinic_id`, `integration_id`, and `bot_id` come from the `clinic_bots` row, not from the JSON. `update_kind` is `message` or `edited_message`. `transport_status` is `queued`. The response after commit is 200.
- The same `bot_id` and `update_id` return 200 and do not insert a second row. A unique-constraint conflict is that acknowledgement.
- Group, supergroup, channel, callback, and every other update kind return 200 and insert nothing. A `message` whose `chat.type` is not `private` returns 200 and inserts nothing.
- A crash after the commit and before the response must not create a second logical update. The unique constraint is what makes the Telegram retry safe.
- Do not log the update payload, the token, or the webhook secret.
- Update `docs/PROJECT.md` so the webhook path is the one nginx location that reaches FastAPI, private updates are stored on `telegram_updates`, and other update kinds are acknowledged without a row.

## Acceptance Criteria
- A private `message` to a connected bot inserts one `telegram_updates` row with `transport_status` `queued` and returns 200 only after that commit.
- Repeating the same `update_id` for that `bot_id` returns 200 and the table still has one row.
- A private `edited_message` inserts one row with `update_kind` `edited_message`.
- A group `message`, a `callback_query`, and a channel post each return 200 and leave the table unchanged.
- A request with a missing or wrong webhook secret returns 401 and leaves the table unchanged.
- A disconnected integration, whose webhook secret was cleared, returns 401 for a later delivery and leaves stored rows in place.
- `GET /patients` and `GET /ready` still require the clinical session. The webhook is not implemented under `apps/clinic-web/src/app/api/[...path]/route.ts`.

## Dependencies
- `docs/issues/telegram-bot-gateway/existing-clinic-bot-contract.md`
- `docs/issues/telegram-bot-gateway/bot-lifecycle.md`
- `TELEGRAM_PUBLIC_BASE_URL` is the HTTPS origin used in the expected webhook URL.

## Files Likely Touched
- `apps/api/alembic/versions/0043_telegram_updates.py`
- `apps/api/src/vetdietderm_api/telegram/models.py`
- `apps/api/src/vetdietderm_api/telegram/router.py`
- `apps/api/src/vetdietderm_api/telegram/intake.py`
- `apps/api/src/vetdietderm_api/orm.py`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Add the `0043_telegram_updates` revision and the `TelegramUpdate` model with the columns and constraints in Requirements. Register the model in `load_models`.
- [x] Move the webhook handler body into `telegram/intake.py`. Keep the contract issue's unknown-integration and secret checks. On a matching secret, apply the JSON, privacy, dedupe, and commit-before-200 rules in Requirements.
- [x] On `IntegrityError` for (`bot_id`, `update_id`), roll back the failed insert and return 200.
- [x] Keep payload, token, and webhook secret out of loguru calls.
- [x] Update the webhook and intake sentences in `docs/PROJECT.md`.
- [x] Run `pnpm api:generate` after the webhook responses change, then run the checks in Verification.

## Verification
- `uv run --project apps/api alembic upgrade head` applies `0043_telegram_updates`.
- `pnpm api:check` passes.
- Post a private `message` fixture to `POST /telegram/webhooks/{integration_id}` with the bot's webhook secret and confirm one queued row and a 200 response after the row is committed.
- Post that same body again and confirm the row count stays 1.
- Post a group `message` and a `callback_query` and confirm both return 200 with no new row.
- Post the private fixture with the wrong secret and confirm 401 and no new row.
- Disconnect the bot, post the private fixture again, and confirm 401 while the earlier row remains.
