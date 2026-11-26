---
source_prd: docs/prd/2026-11-26_telegram-bot-gateway_prd.md
prd_id: 2026-11-26-telegram-bot-gateway
cycle_id: 2026-11-26-telegram-bot-gateway
cycle_slug: telegram-bot-gateway
project_doc: docs/PROJECT.md
status: Not Started
complexity: L
criticality: Blocker
---

# Existing Clinic Bot Contract

## Implementation Status
Status: Not Started

## Description
Staff already save one clinic bot token after `getMe` and read back its status. This issue changes that contract. The token is stored as ciphertext, the read model gains webhook status and the public `t.me` link, and owner or admin can verify or disconnect. One Telegram webhook path is registered for this deployment. Bot lifecycle, public intake, and the worker build on these columns and routes.

## Requirements
- Add `cryptography` to `apps/api` with `uv add --project apps/api cryptography`. Use `cryptography.fernet.Fernet` for the bot token and the later webhook secret.
- Add two settings on `vetdietderm_api.settings.Settings`, both excluded from `repr`:
  - `CLINIC_BOT_ENCRYPTION_KEY`, default empty. A non-empty value must be a valid Fernet key.
  - `TELEGRAM_PUBLIC_BASE_URL`, default empty. A non-empty value must be an `https` origin with no userinfo, no path other than empty or `/`, no query, and no fragment. Strip one trailing slash.
- Document both variables, empty, in `apps/api/.env.example` and `infra/.env.example`. Pass them into the `api` service in `infra/docker-compose.yml`.
- Alembic revision `0042_clinic_bot_credentials` revises `0041_revoke_owner_sessions` and updates `clinic_bots`:
  - `integration_id` UUID, not null, unique. Backfill existing rows with `vetdietderm_api.ids.uuid6`.
  - Widen `token` to text. After this migration the column holds Fernet ciphertext.
  - `webhook_secret_ciphertext` text, nullable.
  - `webhook_status` string, not null, default `not_configured`, limited to `not_configured`, `active`, and `error`.
  - Extend `ck_clinic_bots_status` to `connected`, `error`, and `disconnected`. Keep `uq_clinic_bots_bot_id`.
- The data migration reads the key through `get_settings()`. When any `token` is non-null and the key is missing or invalid, the upgrade raises and leaves that plaintext in place. When the key is valid, encrypt each non-null token that does not already start with `gAAAAA`. Leave null tokens null. Do not fill a webhook secret. Leave existing rows at `webhook_status` `not_configured`.
- `ClinicBot` defaults `integration_id` from `uuid6` and `webhook_status` from `not_configured`. `ClinicBot.__repr__` keeps clinic id, bot id, username, and status only.
- `GET /clinic-bot` returns `status`, `webhook_status`, `bot_id`, `username`, `public_url`, and `last_error`. `public_url` is `https://t.me/{username}` when username is present, otherwise null. The response omits the token, the webhook secret, the webhook URL, and `integration_id`. A missing row returns null `status` and null `webhook_status`. Stored credential values are `connected`, `error`, and `disconnected`. Absent means no row.
- `PUT /clinic-bot` still accepts only `token`. Owner and admin only. When the encryption key or the public base URL is empty, return 422 `Не задан ключ шифрования или публичный HTTPS-адрес. Токен не сохранён.` before `getMe` and before any write.
- A token Telegram rejects does not replace a row whose status is `connected`. Another clinic's `bot_id` stays 409 `Этот бот уже подключён к другой клинике`. An accepted token is stored only through `encrypt_secret`. This issue does not call `setWebhook`. A successful save sets credential status `connected`, clears `last_error`, and leaves `webhook_status` at `not_configured`.
- Add `POST /clinic-bot/verify` and `POST /clinic-bot/disconnect` on the existing owners router so they keep the clinical session, CSRF, and the `/v1/staff` alias. Owner and admin only. Other clinical roles receive 403 `Изменить бота могут владелец и администратор клиники`. Use that same 403 for `PUT`.
- Verify loads the clinic row. With no ciphertext, return 422 `Бот не подключён`. When the key or the public base URL is missing, set `last_error` to `Не задан ключ шифрования или публичный HTTPS-адрес.`, set `webhook_status` to `error`, keep the ciphertext, and do not set `disconnected`. Otherwise call `getMe`, then `getWebhookInfo`. A failed `getMe` sets credential status `error`, keeps the ciphertext, and does not set `disconnected`. Webhook status becomes `active` only when `result.url` equals `{TELEGRAM_PUBLIC_BASE_URL}/telegram/webhooks/{integration_id}`. Any other reported URL sets `webhook_status` to `error`. Verify does not create or rotate a webhook secret and does not call `setWebhook`.
- Disconnect clears `token` and `webhook_secret_ciphertext`, sets credential status `disconnected` and `webhook_status` to `not_configured`, and keeps the row, `integration_id`, `bot_id`, and `username`. It does not call `deleteWebhook` in this issue. A missing row returns 422 `Бот не подключён`.
- Register `POST /telegram/webhooks/{integration_id}` from `create_app` on its own router. Staff clinic routes stay on the clinical session. The webhook router is not added to `LEGACY_SELF_SCOPED_ROUTERS` and is not aliased under `/v1/staff`. Resolve the clinic from `clinic_bots.integration_id` only. Unknown integration id: 404 and no write. Missing `X-Telegram-Bot-Api-Secret-Token`, a null stored secret, a `disconnected` row, or a secret that does not match: 401 and no write. A matching secret: 503 and no write, so the delivery stays retryable until public intake replaces that branch.
- `hides_credentials` includes `/clinic-bot`, paths under `/clinic-bot/`, and paths under `/telegram/webhooks/`. `last_error` and clinic-bot HTTP details go through `scrub_secrets`, which removes the raw token and the raw webhook secret, then truncates to 500 characters. Telegram helpers still do not log a URL that contains the token.
- `/health` stays public. `/ready` and the other clinical routes stay on the clinical session. Do not add the webhook under `apps/clinic-web/src/app/api/[...path]/route.ts`.
- In `README.md`, add `location /telegram/webhooks/` proxying to `127.0.0.1:8001` next to the UI location for `127.0.0.1:3003`. Say in the existing Russian prose that this is the only nginx location that reaches FastAPI. Update the Compose API port comment so nginx forwards only that path to the loopback API port.
- Update the clinic-bot sentences in `docs/PROJECT.md` for ciphertext, webhook status, the public link, verify, disconnect, and the refusal to store a token when the key or the base URL is missing.

## Acceptance Criteria
- `GET /clinic-bot` for a clinic with no row returns null credential status and null webhook status, and the JSON has no token or secret field.
- Owner `PUT /clinic-bot` with either new setting empty returns 422, does not call Telegram, and does not insert a token.
- Owner `PUT` with both settings set and a token Telegram accepts stores a Fernet value that starts with `gAAAAA`, status `connected`, and webhook status `not_configured`. `GET` includes `https://t.me/{username}`.
- A later `PUT` with a token Telegram rejects, while status is `connected`, returns 422 and leaves the previous ciphertext in place.
- A member call to `POST /clinic-bot/verify` or `POST /clinic-bot/disconnect` returns 403.
- Verify sets webhook status `error` when Telegram reports a URL other than the expected integration URL, and it leaves `webhook_secret_ciphertext` null.
- Disconnect clears `token` and `webhook_secret_ciphertext`, sets status `disconnected`, and keeps `integration_id`.
- `POST /telegram/webhooks/{integration_id}` for an unknown id returns 404. A known id with a secret that does not match returns 401 and writes no row.
- `GET /health` stays available. `GET /ready` stays on the clinical session.
- Upgrading a database that already has a plaintext `clinic_bots.token` encrypts that value when the Fernet key is set, and the upgrade fails when that token exists and the key is missing.
- A stored `last_error` and the 422 body for a rejected token do not contain the submitted token.

## Dependencies
- Alembic head `0041_revoke_owner_sessions` and the `clinic_bots` table from `0035_clinic_bots`.
- Existing `GET` and `PUT /clinic-bot` on `apps/api/src/vetdietderm_api/owners/router.py`.
- `CLINIC_BOT_ENCRYPTION_KEY` must be a Fernet key before `alembic upgrade` on a database that already stores a plaintext token. A database whose bot tokens are all null can upgrade with the key empty.

## Files Likely Touched
- `apps/api/pyproject.toml`
- `apps/api/src/vetdietderm_api/settings.py`
- `apps/api/.env.example`
- `infra/.env.example`
- `infra/docker-compose.yml`
- `apps/api/alembic/versions/0042_clinic_bot_credentials.py`
- `apps/api/src/vetdietderm_api/owners/models.py`
- `apps/api/src/vetdietderm_api/owners/schemas.py`
- `apps/api/src/vetdietderm_api/owners/clinic_bots.py`
- `apps/api/src/vetdietderm_api/owners/telegram.py`
- `apps/api/src/vetdietderm_api/owners/router.py`
- `apps/api/src/vetdietderm_api/owners/bot_crypto.py`
- `apps/api/src/vetdietderm_api/telegram/__init__.py`
- `apps/api/src/vetdietderm_api/telegram/router.py`
- `apps/api/src/vetdietderm_api/main.py`
- `apps/api/src/vetdietderm_api/routing.py`
- `apps/api/src/vetdietderm_api/api_errors.py`
- `packages/api-contract/src/generated.ts`
- `README.md`
- `docs/PROJECT.md`
- `apps/api/tests/secure/test_multi_user_auth.py`

## Implementation Steps
- [ ] Add `cryptography` with `uv add --project apps/api cryptography`.
- [ ] Add the two settings and validators from Requirements. Mirror them in both env examples and in the `api` service environment.
- [ ] Add `owners/bot_crypto.py` with `encrypt_secret`, `decrypt_secret`, and `scrub_secrets(text, secrets) -> str`. `scrub_secrets` drops each secret substring and truncates to 500 characters.
- [ ] Add Alembic `0042_clinic_bot_credentials` and the matching `ClinicBot` columns. Backfill `integration_id` with `uuid6`. Encrypt existing non-null tokens through `get_settings()` and `encrypt_secret`.
- [ ] Set ORM defaults for `integration_id` and `webhook_status` so the current `ClinicBot(...)` constructors in `apps/api/tests/secure/test_multi_user_auth.py` still build. Leave those fixture token strings as direct assignments.
- [ ] Extend `ClinicBotRead` with `webhook_status` and `public_url`. Map `public_url` in `clinic_bot_read`. Keep the token off every read model.
- [ ] Change `save_clinic_bot` for the empty-settings 422, ciphertext storage, the connected-bot rejection, and the duplicate-bot 409. Leave `webhook_status` at `not_configured`.
- [ ] Add `verify_clinic_bot` and `disconnect_clinic_bot`, and wire the two POST routes on the owners router. Add `get_webhook_info` in `telegram.py` using the same host checks as `getMe`.
- [ ] Add the webhook router and include it only from `create_app`. Implement the 404, 401, and 503 outcomes from Requirements. Do not create `telegram_updates` here.
- [ ] Extend `hides_credentials` and pass `last_error` and clinic-bot HTTP details through `scrub_secrets`.
- [ ] Update the README nginx example, the Compose port comment, and the clinic-bot sentences in `docs/PROJECT.md`.
- [ ] Regenerate the contract with `pnpm api:generate`.
- [ ] Run the checks in Verification.

## Verification
- `uv run --project apps/api python -c "from vetdietderm_api.main import app"` imports.
- `pnpm api:check` passes.
- With both settings empty, owner `PUT /clinic-bot` returns 422 and the `clinic_bots` row is unchanged.
- With a Fernet key and `TELEGRAM_PUBLIC_BASE_URL=https://vetapp.syndex-ai.ru`, a rejected Telegram token does not replace a connected ciphertext row.
- `GET /clinic-bot` JSON keys are only `status`, `webhook_status`, `bot_id`, `username`, `public_url`, and `last_error`.
- An unknown integration id on `POST /telegram/webhooks/{integration_id}` returns 404. A known id whose secret does not match returns 401.
- `GET /health` returns 200. `GET /ready` stays on the clinical session.
- On a database with one plaintext `clinic_bots.token`, `alembic upgrade head` stores a `gAAAAA` prefix when the key is set, and the upgrade fails when the key is unset.
