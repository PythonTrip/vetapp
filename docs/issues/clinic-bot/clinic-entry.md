---
source_prd: docs/prd/2026-11-03_clinic-bot_prd.md
prd_id: 2026-11-03-clinic-bot
cycle_id: 2026-11-03-clinic-bot
cycle_slug: clinic-bot
project_doc: docs/PROJECT.md
status: Done
---

# Entering the clinic

## Implementation Status
Status: Done

## Description
Each clinic has one stable link. An owner who opens that link, or the clinic bot, enters that clinic's cabinet. The same person in another clinic has a separate cabinet with its own password. Email registration and email sign-in work before a bot token exists. Old per-doctor codes no longer attach anyone.

## Requirements
- Add `clinic_links` with `clinic_id` primary key and a unique `code`. This cycle does not change or rotate a code after the row exists.
- Alembic revision `0036_clinic_entry`. Set `down_revision` to the single current head, which is `0035_clinic_bots` when `clinic-bot-connection` has landed. Do not open a second head.
- Freeze the link on the first verified staff session of that clinic, inside `require_clinical_access`, after the clinic from `doctor-is-a-clinic` exists. Use that session's module-auth token to `GET /organizations/{org_id}/members`. If an organization `owner` has a `join_codes` row for this `clinic_id`, keep the newest such owner code by `created_at`. Otherwise keep the newest join code for this clinic by `created_at`. Insert `clinic_links` with that code. This is the stand-in for "the administrator's existing join code, otherwise the newest code among the doctors in the clinic", because role data lives in module-auth rather than PostgreSQL.
- Point every `owner_accounts.join_code_uuid` in that clinic at the surviving code, then delete the other `join_codes` rows for that clinic. Do not create a new owner account and do not move animals, chat threads, or visit requests between accounts.
- `GET /join-codes/current` returns the frozen clinic link and the clinic name. It must not insert a new per-doctor code.
- `code_by_value` resolves only `clinic_links`. A code that is not the frozen link returns `404` `Код не найден` and does not create or update an owner.
- `GET /owner/join/{code}` returns the clinic name before an account exists. The owner page `apps/owner-web/src/app/join/[code]/page.tsx` shows that name. An unknown code shows the not-found state and no registration form.
- Email and password identify an owner inside one clinic. Drop the global unique constraint on `owner_accounts.email`. Add a unique index on `(tenant_id, email)` where both are non-null. The same email may register in another clinic with a different password.
- `POST /owner/register` and `POST /owner/login` take the clinic `code`. Login selects the account with that clinic's `tenant_id` and that email. A password that matches the same email in another clinic still returns `401` `Неверная почта или пароль`. Keep the existing equal scrypt work for an unknown email.
- A staff email in `staff_email_reservations` cannot be an owner email in any clinic. Keep that check global.
- Owner password hashes stay on `owner_accounts.password_hash` and `password_salt` using the existing scrypt helper. Do not move them to module-auth. Do not add password reset, email verification, or an outbound owner email. This closes the open question about where owner password hashes remain.
- `owner_sessions` continue to store one owner account. Because each account has one `tenant_id`, the `vetapp_owner_session` cookie for clinic A cannot read clinic B. Staff `vetapp_session` still cannot open owner routes, and the owner cookie still cannot open staff routes.
- Add `clinic_code` to the owner profile payload. On `/join/{code}`, if the signed-in profile's `clinic_code` differs, show this clinic's register and sign-in form and do not render the other clinic's animals, chat, or visits.
- Telegram identity becomes unique on `(tenant_id, telegram_user_id)`, not on `telegram_user_id` alone. Keep `owner_account_uuid` unique. A legacy row with `tenant_id IS NULL` stays out of clinic lookup. Opening a clinic bot creates or reuses only the account for that clinic and does not attach the unbound account or its animals.
- `POST /owner/telegram/login`, `POST /owner/telegram/widget`, and `GET /owner/telegram/config` take the clinic `code`. Config returns `{"bot_username": null}` when that clinic has no `clinic_bots` row with `status = connected`. The join page then hides the Telegram control and still shows email registration and email sign-in.
- When the bot is connected, validate Mini App `init_data` and the login widget with that row's `token` through the existing `validate_init_data` and `validate_widget` functions. Do not call `validate_init_data` or `validate_widget` with `settings.TELEGRAM_BOT_TOKEN`. A missing or non-connected token returns the existing `503` `Вход через Telegram пока не настроен`.
- An accepted Mini App or widget login opens that clinic's cabinet immediately. Do not require `POST /owner/connect-doctor`. Remove that route's use from `packages/owner-features/src/components/join-form.tsx`. If no account exists for this Telegram user in this clinic, create the owner, the registration, and the Telegram identity in this clinic in the same transaction.
- The bot button URL is the clinic link on the existing owner site. Do not add a per-clinic domain or a second owner app.
- Remove the separate `JoinCodeSettings` card from `SettingsModule` so the only owner-entry link on the settings screen is the one shown by the clinic bot card.
- Russian UI stays. The public preview heading is the clinic name.

## Acceptance Criteria
- The first staff session for a clinic freezes one code. A second session returns the same code. `GET /join-codes/current` does not add a `join_codes` row.
- Opening the surviving `/join/{code}` page shows the clinic name before sign-in. Email registration creates a cabinet in that clinic. The same email and a different password can register through another clinic's code, and each login returns only that clinic's animals.
- A staff email is rejected with the existing taken-email response in every clinic.
- With no connected bot, the page has email registration and email sign-in and no Telegram widget. With a connected bot, the widget uses that clinic's username, and a payload signed by another clinic's token is rejected.
- Opening the clinic bot creates the cabinet without a join-code step. The same Telegram user opening another clinic's bot gets a second account. Animals created in the first clinic are absent from the second.
- A signed-in cabinet for clinic A, opened on clinic B's link, shows clinic B's sign-in form and does not list clinic A's animals.
- An old per-doctor code that was not selected as the clinic link returns `404` and leaves owner rows unchanged.
- An owner who already belonged to the doctor's clinic still has the same animals and chat after the link is frozen.
- `settings.TELEGRAM_BOT_TOKEN` is not read by the owner Telegram routes.

## Dependencies
- `docs/issues/clinic-bot/doctor-is-a-clinic.md` so every doctor and moved owner account has a clinic id.
- `docs/issues/clinic-bot/clinic-bot-connection.md` so `clinic_bots.token` exists and the settings card already renders the link, Mini App URL, and domain.
- module-auth `GET /organizations/{org_id}/members` for the owner-role lookup during the one-time freeze.
- Assumption: owner password hashes remain on `owner_accounts`. Assumption: the organization owner's newest clinic join code wins, and otherwise the newest code in the clinic wins. The chosen code is never rotated in this cycle.

## Files Likely Touched
- `apps/api/alembic/versions/0036_clinic_entry.py`
- `apps/api/src/vetdietderm_api/owners/models.py`
- `apps/api/src/vetdietderm_api/owners/schemas.py`
- `apps/api/src/vetdietderm_api/owners/repository.py`
- `apps/api/src/vetdietderm_api/owners/router.py`
- `apps/api/src/vetdietderm_api/owners/telegram.py`
- `apps/api/src/vetdietderm_api/auth.py`
- `apps/api/src/vetdietderm_api/settings.py`
- `apps/owner-web/src/app/join/[code]/page.tsx`
- `packages/owner-features/src/components/join-form.tsx`
- `packages/owner-features/src/components/telegram-web-login.tsx`
- `packages/owner-features/src/platform/telegram.ts`
- `apps/clinic-web/src/app/_components/settings.tsx`
- `apps/clinic-web/src/features/owner-cabinet/components/join-code-settings.tsx`
- `packages/api-contract/openapi.json`
- `packages/api-contract/src/generated.ts`
- `docs/PROJECT.md`
- `docs/api-contract.md`

## Implementation Steps
- [x] Step 1: Add the `ClinicLink` model and revision `0036_clinic_entry`. Replace the global email unique constraint with the partial `(tenant_id, email)` unique index. Replace the Telegram identity primary key with `(tenant_id, telegram_user_id)`, allow a null `tenant_id` only for a legacy unbound row, and keep `owner_account_uuid` unique.
- [x] Step 2: Add `freeze_clinic_link(session, clinic_id, members)` in `owners/repository.py` using the owner-code rule in Requirements. Call it from `require_clinical_access` when `clinic_links` has no row for the clinic. Repoint owner accounts and delete the other codes for that clinic in the same transaction.
- [x] Step 3: Change `current_code` and `code_by_value` to read `clinic_links` only. Include `clinic_code` and the clinic name on the owner profile and on `GET /owner/join/{code}`.
- [x] Step 4: Add `code` to `OwnerRegister` and `OwnerLogin`. Scope register, login, and email availability by that clinic, while staff-email reservation stays global. Keep scrypt hashes on `owner_accounts`.
- [x] Step 5: Change `telegram_config`, `telegram_login`, and `telegram_widget` to load the clinic by `code` and validate with `clinic_bots.token` only when `status` is `connected`. Create a new clinic-scoped account when that Telegram user has no identity in this clinic. Do not call `connect-doctor`.
- [x] Step 6: Update `join-form.tsx`, `telegram-web-login.tsx`, and `platform/telegram.ts` so the page passes the route code, hides the widget when `bot_username` is null, and shows email registration and email sign-in in both cases. When `clinic_code` on the profile differs from the route, render the form instead of the cabinet.
- [x] Step 7: Remove `JoinCodeSettings` from `SettingsModule`. Leave the link on the clinic bot card, which already reads `GET /join-codes/current`.
- [x] Step 8: Regenerate `packages/api-contract` with `pnpm --filter @vetdietderm/api-contract generate`. Update `docs/api-contract.md` and the `docs/PROJECT.md` bullets that describe per-doctor join codes and `TELEGRAM_BOT_TOKEN` so they describe one clinic link and the clinic token.
- [x] Step 9: Walk through the Verification checks.

## Verification
- Sign in as the clinic owner, read `GET /join-codes/current` twice, and confirm the code is unchanged. Open `/join/{code}` while signed out and confirm the clinic name is visible.
- Register one email on that code and the same email with another password on a second clinic's code. Confirm each login returns only that clinic's profile and `clinic_code`.
- Attempt registration with a known staff email and confirm the taken-email response.
- Disconnect the bot by using a clinic with no `clinic_bots` row. Confirm the Telegram widget is absent and email sign-in still succeeds. Connect a bot, confirm the widget script receives that username, and confirm `init_data` signed with a different token is `401`.
- Open the bot URL for two clinics with one Telegram user. Confirm two owner accounts and that an animal created in the first clinic is absent from the second.
- Request `GET /owner/join/{old-doctor-code}` for a deleted per-doctor code and confirm `404` with no new `owner_accounts` row.
- Confirm an existing owner's animal count and chat messages are unchanged after freeze.
- Run `pnpm lint` and `pnpm typecheck` from the repository root.

## Implementation Evidence

- The existing Alembic head was `0036_clinic_questionnaires`. The migration uses `0037_clinic_entry` and leaves one head.
- Telegram identity uses the account UUID as primary key and a unique clinic/Telegram-user pair. PostgreSQL requires primary-key columns to be non-null, and legacy unbound identities retain a null tenant.
- API tests passed in isolated SQLite stores. Web tests, lint, type checks, generated contract, and offline PostgreSQL migration SQL passed. Live Telegram/BotFather and applying the migration to PostgreSQL were not run.
- Rolling back after owners have reused an email or Telegram ID across clinics requires resolving duplicates before restoring global uniqueness. Restoring retired links requires pre-change data.