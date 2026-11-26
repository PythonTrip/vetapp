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

# Bot Lifecycle

## Implementation Status
Status: Done

## Description
An organization owner or admin connects one clinic bot, checks that Telegram stored this deployment's webhook URL, replaces the bot, or disconnects it. Every clinic role can see the username, the public `t.me` link, credential status, webhook status, and the last error. The token and the webhook secret stay off the screen and out of stored errors. The integration id from the clinic-bot contract stays stable for the life of the row.

## Requirements
- Credential status shown in the clinic stays one of absent, connected, error, or disconnected. Absent is a missing `clinic_bots` row. Webhook status is `not_configured`, `active`, or `error`. Webhook status is `active` only when `getWebhookInfo` reports `{TELEGRAM_PUBLIC_BASE_URL}/telegram/webhooks/{integration_id}`.
- Connect and replace both use `PUT /clinic-bot`. `getMe` must succeed, the bot id must not belong to another clinic, and both `CLINIC_BOT_ENCRYPTION_KEY` and `TELEGRAM_PUBLIC_BASE_URL` must be set. The token is stored with `encrypt_secret`. A new webhook secret is created with `secrets.token_urlsafe(32)` and stored with `encrypt_secret`. `setWebhook` is called immediately with the expected URL, `secret_token` set to that secret, and `allowed_updates` of `message` and `edited_message`.
- When `setWebhook` fails, credential status stays `connected` and webhook status becomes `error`. `last_error` is `Telegram не принял вебхук.` A token Telegram rejects does not replace a connected bot.
- Replace keeps `integration_id`. It always stores a new webhook secret. When the new bot id differs from the stored bot id and `getMe` still succeeds for the previous decrypted token, call `deleteWebhook` with the previous token before saving the new ciphertext. A failed `deleteWebhook` still saves the new bot. Record `Telegram не снял вебхук предыдущего бота.` in `last_error` only when `setWebhook` itself succeeded; when `setWebhook` failed, keep the setWebhook error above.
- Verify keeps the `POST /clinic-bot/verify` route. It still calls `getMe` and `getWebhookInfo` and still refuses to rotate a secret that is already stored. When the reported URL is not the expected URL, verify calls `setWebhook` with the current secret. A secret is created only when `webhook_secret_ciphertext` is null. A failed `getMe` sets credential status to `error`, keeps the ciphertext, and does not set `disconnected`. A missing encryption key or public base URL still reports an error and does not clear the ciphertext.
- Disconnect keeps the `POST /clinic-bot/disconnect` route. It clears the local ciphertext and webhook secret and sets `disconnected` before calling Telegram. The public intake then rejects deliveries for that integration even when `deleteWebhook` fails. After the local clear, call `deleteWebhook` with the decrypted token when a ciphertext was present. On failure, set `last_error` to `Telegram не снял вебхук. Приём на этой стороне уже остановлен.` On success, clear `last_error`. Keep `integration_id`, `bot_id`, `username`, and any stored updates. A later connect reuses that `integration_id` and issues a new secret.
- Owner and admin are the only roles that connect, replace, verify, or disconnect. Members and viewers can read the card. Duplicate bot id across clinics stays a 409. The clinic that already holds the bot id keeps it, including after disconnect, until that same clinic replaces the bot id.
- Stored and displayed errors never contain the token or the webhook secret. Scrub Telegram `description` text before it is written to `last_error`.
- The settings card stays `ClinicBotSettings` on the existing settings screen, with Russian copy:
  - Title remains `Бот клиники`.
  - Description: `Вставьте токен из BotFather. Сервис проверяет токен, сохраняет его в зашифрованном виде и регистрирует вебхук этой установки.`
  - Credential labels: missing row `Не подключён`, `connected` `Подключён`, `error` `Ошибка`, `disconnected` `Отключён`.
  - Webhook labels: null or `not_configured` `Вебхук не настроен`, `active` `Вебхук активен`, `error` `Ошибка вебхука`.
  - When `username` is present, show a link whose href is `public_url`.
  - Owner and admin see the password token field. The submit label is `Подключить` when `bot_id` is null and `Заменить` when `bot_id` is present. Show `Проверить` when status is `connected` or `error`. Show `Отключить` when status is `connected` or `error`. Members and viewers see none of these controls.
  - Footer: `Подключено — Telegram принял токен. Вебхук активен — Telegram сообщает адрес этого сервера.`
- Keep the loading line `Загрузка бота…`, the load-error alert, and `Повторить загрузку`. Show `last_error` when credential status or webhook status is `error`.
- Update the clinic-bot sentences in `docs/PROJECT.md` so a connected bot is expected to hold this deployment's webhook URL, replace rotates the secret and keeps the integration id, and disconnect clears the local credential before `deleteWebhook`.

## Acceptance Criteria
- Owner connect with a token Telegram accepts stores ciphertext, a webhook secret, and calls `setWebhook` with the expected URL. `GET /clinic-bot` shows `Подключён` data: username, `https://t.me/{username}`, and webhook status `active` when Telegram reports that URL.
- When `setWebhook` fails after a successful `getMe`, `GET` shows credential status `connected` and webhook status `error`, and the previous connected bot is already replaced by the new ciphertext.
- A rejected token during replace leaves the previous connected ciphertext, bot id, and webhook secret unchanged.
- Verify on a migrated row with no webhook secret creates one secret and calls `setWebhook`. A second verify, when Telegram already reports the expected URL, does not change `webhook_secret_ciphertext`.
- Verify with a failed `getMe` sets credential status `error` and leaves the ciphertext in place.
- Disconnect clears the token and the webhook secret even when `deleteWebhook` returns an error, sets status `disconnected`, and the following connect keeps the same `integration_id` and writes a different secret.
- A member sees the username, the `t.me` link, both statuses, and `last_error`, and the token field, `Проверить`, and `Отключить` are absent.
- A stored `last_error` and the settings alert do not contain the token or the webhook secret.

## Dependencies
- `docs/issues/telegram-bot-gateway/existing-clinic-bot-contract.md`
- `CLINIC_BOT_ENCRYPTION_KEY` and `TELEGRAM_PUBLIC_BASE_URL` are set in the API environment before connect, replace, or verify.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/owners/clinic_bots.py`
- `apps/api/src/vetdietderm_api/owners/telegram.py`
- `apps/api/src/vetdietderm_api/owners/router.py`
- `apps/api/src/vetdietderm_api/owners/bot_crypto.py`
- `apps/clinic-web/src/features/owner-cabinet/components/clinic-bot-settings.tsx`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Add `set_webhook` and `delete_webhook` in `telegram.py`. Build the Bot API URL with the same host and path checks `fetch_bot_identity` already uses. Pass `secret_token` and `allowed_updates` on `setWebhook`. Do not log the request URL or the secret.
- [x] Change `save_clinic_bot` so a successful `getMe` creates a webhook secret, encrypts it, and calls `setWebhook` with the expected URL. On `setWebhook` failure, commit the new ciphertext with credential status `connected` and webhook status `error`. When the bot id changes and the previous token still passes `getMe`, call `deleteWebhook` for the previous token and still save the new bot if that call fails.
- [x] Change `verify_clinic_bot` so a URL mismatch calls `setWebhook` with the stored secret, creating a secret only when the column is null. Leave the secret unchanged when the URL already matches. Keep the failed-`getMe` path from the contract issue.
- [x] Change `disconnect_clinic_bot` so the ciphertext and webhook secret are cleared and status is `disconnected` before `deleteWebhook`. Keep `integration_id`. Write the Russian `last_error` from Requirements when Telegram refuses the removal.
- [x] Run every Telegram `description` and every `last_error` assignment through `scrub_secrets` together with the raw token and the raw webhook secret.
- [x] Update `ClinicBotSettings` with the Russian labels, the `public_url` link, and the owner/admin actions. Call `POST /clinic-bot/verify` and `POST /clinic-bot/disconnect`. Keep `PUT /clinic-bot` for connect and replace. Reload `GET /clinic-bot` after each action.
- [x] Update the clinic-bot sentences in `docs/PROJECT.md` as described in Requirements.
- [x] Run the checks in Verification.

## Verification
- `pnpm --filter vetdietderm-web typecheck` passes.
- `uv run --project apps/api python -c "from vetdietderm_api.owners.clinic_bots import save_clinic_bot, verify_clinic_bot, disconnect_clinic_bot"` imports.
- In the browser, as an organization owner, open the settings screen, connect a bot, and confirm the card shows the username, the `t.me` link, `Подключён`, and `Вебхук активен` when Telegram reports the expected URL.
- Force a `setWebhook` failure and confirm the card stays `Подключён` with `Ошибка вебхука` and the token is not on the card or in the alert.
- As a member, confirm the same card has no token field and no `Проверить` or `Отключить` button.
- Disconnect, confirm the status becomes `Отключён`, then connect again and confirm the integration id in `clinic_bots` is unchanged while `webhook_secret_ciphertext` differs.

## Execution Evidence

- Attempt 0 used the `standard` profile. All declared checks passed with isolated PostgreSQL 16 and Chromium exercising the real API and settings page with upstream fixtures.
- Spec review found two Important issues and one Minor issue involving registration recovery, different-bot replacement during disconnect, and warning preservation. Standards passed.
- Diagnosis reproduced all three findings in three PostgreSQL trials per case. Chromium separately reproduced a matching URL with a stale secret after failed replacement.
- Attempt 1 repaired same-URL registration recovery, serialized clinic replacement and disconnect across the local commit in the single API process, and preserved the cleanup warning on repeat disconnect. The original checks, PostgreSQL regressions and expanded Chromium scenarios all passed.
- Final Spec and Standards both passed. Repairs used 1 of 2. No reformats, profile fallbacks or skipped declared checks.
