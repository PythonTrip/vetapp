---
source_prd: docs/prd/2026-11-03_clinic-bot_prd.md
prd_id: 2026-11-03-clinic-bot
cycle_id: 2026-11-03-clinic-bot
cycle_slug: clinic-bot
project_doc: docs/PROJECT.md
status: Done
---

# One bot for the clinic

## Implementation Status
Status: Done

## Description
A clinic administrator pastes one Telegram bot token in clinic settings. The product asks Telegram whether that token is valid, stores the accepted token as a clinic secret, and shows the clinic link, Mini App URL, and login-widget domain for the administrator to copy into BotFather. The product does not call BotFather and does not register a webhook.

## Requirements
- Add `clinic_bots` with one row per clinic: `clinic_id` unique, `token` nullable, `bot_id` unique and nullable, `username` nullable, `status` of `connected` or `error`, and `last_error` nullable. `token` is never returned by the API, never written to logs, and excluded from the model `repr`.
- Alembic revision file `0035_clinic_bots.py` with `down_revision = "0034_owner_gallery_ownership"`. If a later clinic-bot revision is already the single head, chain `down_revision` to that head and pick the next free revision id. Do not open a second head.
- `GET /clinic-bot` returns `status`, `bot_id`, `username`, and `last_error` for the signed-in clinic. `owner`, `admin`, `member`, and `viewer` may read it. Omit `token`.
- `PUT /clinic-bot` accepts `{"token": "<string>"}` and is allowed only for organization `owner` and `admin`. `member` and `viewer` receive `403`.
- Verify a pasted token with `GET https://api.telegram.org/bot<token>/getMe` through `httpx`. Do not log the request URL. A body with `ok: true` and a numeric `result.id` plus `result.username` is acceptance.
- On acceptance, store the token, `bot_id`, and `username`, set `status` to `connected`, and clear `last_error`. The response and any later GET omit the token. The settings input is cleared after a successful save.
- On rejection, do not store the rejected token. If a connected row already exists, leave its token, `bot_id`, `username`, and `status` unchanged and return `422` with Telegram's description. If no connected row exists, store `status = error`, `token = null`, and `last_error`, and return that same `422`.
- If `result.id` is already stored for another clinic, return `409` `Этот бот уже подключён к другой клинике` and do not change either clinic's row.
- Replacing a connected token with a newly accepted token does not delete `owner_telegram_identities` or owner accounts. Cabinets for the same Telegram user in this clinic stay in place. Switching owner payload checks from the deployment token to this stored token is `clinic-entry`.
- The settings card shows three copyable values even when the bot is not connected: the clinic link from `GET /join-codes/current`, the Mini App URL, and the login-widget domain. Assumption: the Mini App URL equals that clinic link (`{OWNER_FRONTEND_URL or FRONTEND_URL}/join/{code}`), and the domain is that origin's host, including a non-default port and excluding the path. Do not mint a second code in this issue.
- Copy uses the clipboard and, on failure, shows `Не удалось скопировать. Выделите и скопируйте текст вручную.`
- Russian labels: card `Бот клиники`; field `Токен бота`; button `Подключить`; statuses `Подключён`, `Ошибка`, and `Не подключён` when no row exists; help `Вставьте токен из BotFather. Сервис проверяет токен в Telegram и не меняет настройки BotFather.`; values `Ссылка клиники`, `Адрес Mini App`, `Домен виджета входа`; note `Подключено — значит Telegram принял токен. Кнопку Mini App и домен виджета нужно вставить в BotFather отдельно.`
- Do not call `setWebhook`, `setChatMenuButton`, or any other BotFather or Bot API method besides `getMe`.
- The clinic name shown in settings remains the organization name from `doctor-is-a-clinic`. Do not add a second rename field. `owner` and `admin` keep the existing rename control; members and viewers do not.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` are not a clinic credential. This issue does not read them when saving or displaying the clinic bot. Removing them from owner sign-in is `clinic-entry`.

## Acceptance Criteria
- An `owner` or `admin` can save a token that `getMe` accepts. A following GET returns `connected`, the bot id, and the username, and does not return the token. The token field on screen is empty.
- A rejected token leaves a previously connected bot unchanged, and the screen shows the error. With no connected bot, GET then returns `error` and the same message, still without a token.
- Saving a bot id that another clinic already stored returns `409`, and both clinics keep their previous rows.
- A `member` and a `viewer` see status and username and receive `403` on PUT. They do not see a token input.
- The card shows the clinic link, the same URL as the Mini App value, and the owner-site host. No request in this flow calls BotFather or `setWebhook`.
- Saving a new accepted token for the same clinic does not remove an owner account already linked to a Telegram user in that clinic.
- Renaming the clinic still uses the existing organization name field and is refused for a `member`.

## Dependencies
- `docs/issues/clinic-bot/doctor-is-a-clinic.md` must be complete so the signed-in tenant is the clinic and the settings page no longer offers a personal workspace.
- `GET /join-codes/current` already returns the link this card copies. `clinic-entry` later makes that link the only clinic code and stops per-doctor codes from resolving.
- Outbound HTTPS to `api.telegram.org` from the API process.

## Files Likely Touched
- `apps/api/alembic/versions/0035_clinic_bots.py`
- `apps/api/src/vetdietderm_api/owners/models.py`
- `apps/api/src/vetdietderm_api/owners/schemas.py`
- `apps/api/src/vetdietderm_api/owners/router.py`
- `apps/api/src/vetdietderm_api/v1.py`
- `apps/clinic-web/src/features/owner-cabinet/components/clinic-bot-settings.tsx`
- `apps/clinic-web/src/app/_components/settings.tsx`
- `packages/api-contract/openapi.json`
- `packages/api-contract/src/generated.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Step 1: Add the `ClinicBot` model and Alembic revision `0035_clinic_bots` with the columns and unique keys in Requirements. Set `down_revision` to the current single head.
- [x] Step 2: Add Pydantic read and write models. The read model has `status`, `bot_id`, `username`, and `last_error` only. The write model has `token` with a minimum length of 1 and a maximum length of 256.
- [x] Step 3: Add `GET /clinic-bot` and `PUT /clinic-bot` on the owner router, behind `require_clinical_access`. PUT checks `org_role` in `{owner, admin}` and then calls `getMe`. Apply the accept, reject, and duplicate-bot-id rules in Requirements inside one transaction.
- [x] Step 4: Build `clinic-bot-settings.tsx` and render it from `SettingsModule` under the organization section. Load `GET /api/clinic-bot` and `GET /api/join-codes/current`. Show the Russian copy in Requirements. Hide the token input unless `useAuth().user.organization.org_role` is `owner` or `admin`.
- [x] Step 5: Regenerate `packages/api-contract` with `pnpm --filter @vetdietderm/api-contract generate`. Update the `docs/PROJECT.md` bullet that says owner Telegram sign-in uses one deployment bot so it says each clinic stores its own bot credential and the deployment token is not that credential.
- [x] Step 6: Walk through the Verification checks.

## Verification
- As an `owner`, PUT a token whose `getMe` response is `ok`. Confirm the next GET has `status: connected` and `username`, and the response body has no `token` key. Confirm the input is empty and the three copy values are visible.
- PUT a token Telegram rejects. Confirm the previous `bot_id` and `username` are unchanged when one was connected, and that the shown error matches the `422` detail.
- Store the same `bot_id` on a second clinic and confirm `409` without changing the first clinic.
- Sign in as a `viewer`. Confirm GET succeeds, the token field is absent, and PUT returns `403`.
- Confirm the API process does not send `setWebhook` during these checks. Search the clinic-bot route for `TELEGRAM_BOT_TOKEN` and confirm it is not used there.
- Run `pnpm lint` and `pnpm typecheck` from the repository root.
