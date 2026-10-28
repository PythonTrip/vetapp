---
source_prd: docs/prd/2026-10-27_owner-cabinet_prd.md
prd_id: 2026-10-27-owner-cabinet
cycle_id: 2026-10-27-owner-cabinet
cycle_slug: owner-cabinet
project_doc: docs/PROJECT.md
status: Done
---

# Join the Doctor

## Implementation Status
Status: Done

## Description
A pet owner joins exactly one doctor by that doctor's stable code or link, then signs in with email and password. The clinician workspace stays on module-auth. The owner gets a separate session and a phone-usable cabinet that shows that doctor immediately. Chat, visit requests, questionnaires, and shared files are later issues.

## Requirements
- Each staff user has one stable join code for the workspace they are currently using (`X-Vetapp-Workspace`: `personal` or `organization`). Opening settings again returns the same code. This issue does not rotate or revoke a code.
- A personal-workspace code binds the owner to that doctor's personal practice (`tenant_id` null, `created_by` equal to that doctor's module-auth user id). An organization-workspace code binds the owner to that organization (`tenant_id` = `organization.org_id`). The owner still sees the inviting doctor's label plus the organization name.
- The clinician copies the code and a link `{FRONTEND_URL}/join/{code}` from `/settings` while signed in. The stored doctor label is `display_name` from `GET /me`, otherwise the staff email. Refresh that label and the organization name whenever that doctor loads the code in that workspace.
- `GET` of a valid code, with no session, returns that doctor's label and, for an organization code, the organization name. An unknown code returns the same generic Russian failure and no other doctor's name, code, or workspace.
- Registration collects name, email, phone, and password. Email and password are the later sign-in. This issue sends no email, no SMS, and no push, and it does not add verification or password reset.
- Owner passwords are stored in this application's PostgreSQL, hashed with `hashlib.scrypt` (salt per account, `n=2**14`, `r=8`, `p=1`). They are not created in module-auth. Staff accounts stay on module-auth and keep the `vetapp_session` cookie. This resolves the PRD storage question for this cycle: module-auth only admits `email_verified` accounts, and this cycle does not send mail.
- Normalize email by trimming and lowercasing. Reject registration when that email is already an owner account or is already in `staff_email_reservations`. `require_user` upserts the signed-in staff email into `staff_email_reservations` on every successful `GET /me`. Do not call module-auth `POST /auth/register`, `POST /auth/login`, or `POST /auth/password/forgot` to probe an email: register would create a pending staff user, and the other two responses are generic.
- Before `account_proxy` forwards `POST auth/register`, reject an email that already belongs to an owner account. Staff-facing and owner-facing taken-email errors use one generic Russian sentence and do not say which surface owns the email.
- A second valid code does not attach and does not switch the account. The error names neither the other doctor nor the other workspace. The public preview of a code the caller merely opens may still show that code's doctor, because anyone holding a valid code sees that label before an account exists.
- Owner session cookie is `vetapp_owner_session` (HttpOnly, `SameSite=Lax`, `Secure` from `AUTH_COOKIE_SECURE`, path `/`). Clinical routes keep reading only `vetapp_session`. An owner cookie does not satisfy `require_user` or `require_clinical_access`. A staff cookie does not satisfy owner routes.
- `/join` and `/cabinet` render outside `InstanceLockScreen` and `AppShell`. A staff session on those paths does not open the clinician navigation. An owner session does not unlock `/patients`, `/schedule`, `/encounter`, `/nutrition`, or `/settings`.
- After join, `/cabinet` shows the bound doctor (and organization name when the code was organizational) and lets the owner edit name, email, and phone. Email edits repeat the same collision rules. Password stays unchanged. Profile edits update the owner account only; copying them onto a linked `clients` row is the acceptance issue.
- Creating the account also creates one `pending` owner registration with no client link. Animals are not created here.
- Russian UI. The join and cabinet screens are a single column that stays usable at 390px width. No native app.

## Acceptance Criteria
- In personal workspace, `/settings` shows one code and link. Reloading settings shows the same code. Switching to an organization workspace shows a different code for that organization, and returning to personal workspace shows the original personal code.
- Opening the link while signed out shows the doctor's label. An organization code also shows the organization name. A mistyped code shows a generic failure and no directory of doctors.
- Submitting name, email, phone, and password on a valid code signs the owner in and opens `/cabinet` with that doctor. No email is sent.
- Signing out and signing in with the same email and password opens the same cabinet. A wrong password shows a generic failure.
- Registering again with a second doctor's code, while that owner session exists, leaves `doctor_user_id`, workspace, and `tenant_id` unchanged.
- An email already stored for an owner is rejected on owner registration and on the staff register form. An email already stored in `staff_email_reservations` is rejected on owner registration. The message does not identify which side holds it.
- With only `vetapp_owner_session` set, `/patients` stays on the staff sign-in screen. With only `vetapp_session` set, `/cabinet` stays on the owner sign-in screen and does not show clinician navigation.
- A new registration is `pending` and does not create a `clients` or `patients` row.

## Dependencies
- Existing staff session: `apps/api/src/vetdietderm_api/auth.py` (`vetapp_session`, `require_user`, `account_proxy`), `frontend/src/components/auth-provider.tsx`, `frontend/src/components/instance-lock-screen.tsx`.
- `GET /me` fields `user_id`, `email`, `display_name`, and optional `organization.org_id` / `organization.name` / `organization.status`.
- No other owner-cabinet issue. Chat, animals, acceptance, visit requests, questionnaires, and file sharing are out of this issue.

## Files Likely Touched
- `apps/api/alembic/versions/0023_owner_join.py`
- `apps/api/src/vetdietderm_api/owners/models.py`
- `apps/api/src/vetdietderm_api/owners/schemas.py`
- `apps/api/src/vetdietderm_api/owners/repository.py`
- `apps/api/src/vetdietderm_api/owners/router.py`
- `apps/api/src/vetdietderm_api/auth.py`
- `apps/api/src/vetdietderm_api/main.py`
- `frontend/src/app/layout.tsx`
- `frontend/src/components/instance-lock-screen.tsx`
- `frontend/src/components/app-shell.tsx`
- `frontend/src/app/join/page.tsx`
- `frontend/src/app/join/[code]/page.tsx`
- `frontend/src/app/cabinet/page.tsx`
- `frontend/src/components/owner/join-form.tsx`
- `frontend/src/components/owner/cabinet-home.tsx`
- `frontend/src/components/modules/settings.tsx`
- `frontend/src/lib/owner-api.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Add Alembic `0023_owner_join` (down revision `0022_users_organizations`) with `join_codes`, `owner_accounts`, `owner_sessions`, `staff_email_reservations`, and `owner_registrations`. `join_codes` stores `uuid`, unique `code`, `doctor_user_id`, `doctor_label`, `workspace`, nullable `tenant_id`, nullable `organization_name`, `created_at`. Partial unique indexes: one row per `doctor_user_id` where `tenant_id` is null; one row per `(doctor_user_id, tenant_id)` where `tenant_id` is not null. `owner_accounts` stores `uuid`, `name`, unique normalized `email`, `phone`, `password_hash`, `password_salt`, `doctor_user_id`, `join_code_uuid`, `workspace`, nullable `tenant_id`, timestamps. `owner_sessions` stores `key_hash` as primary key, `owner_account_uuid`, and `expires`. `staff_email_reservations` stores normalized `email` as primary key, `user_id`, and `updated_at`. `owner_registrations` stores `uuid`, unique `owner_account_uuid`, `status` default `pending`, and `created_at`. These tables are not `TenantOwned`.
- [x] Add Pydantic models and an owners router. `GET /join-codes/current` (clinical access) returns the current workspace code and link, creating the row on first read and refreshing `doctor_label` and `organization_name` from the staff profile. `GET /owner/join/{code}` is public and returns `doctor_name` plus nullable `organization_name`, or 404 `Код не найден`. `POST /owner/register` creates the account, scrypt hash, `pending` registration, and `vetapp_owner_session`. `POST /owner/login` and `POST /owner/logout` manage that cookie. `GET /owner/me` and `PATCH /owner/me` read and update name, email, and phone for the owner session. Owner mutations use the existing `csrf` check.
- [x] In `require_user`, after a successful profile load, upsert `profile["email"]` into `staff_email_reservations`. In `account_proxy`, before forwarding `POST auth/register`, return the generic taken-email error when the normalized email exists on `owner_accounts`.
- [x] Register the owners router in `create_app`. Protect only `/join-codes/current` with `require_clinical_access`. Leave the `/owner/*` routes on the owner session or public preview.
- [x] Skip `InstanceLockScreen` and `AppShell` when the pathname is `/join`, `/join/...`, or `/cabinet`. Keep every other route on the staff lock screen.
- [x] Add a Russian settings card that shows the current code, the full link, and a copy control, loaded from `GET /join-codes/current`.
- [x] Add `/join` (type a code), `/join/[code]` (preview, then name, email, phone, password), and `/cabinet` (doctor label, organization name when present, profile form, owner sign-in and sign-out). Stack the layout in one column for a 390px viewport. A signed-in owner who submits a different code sees a refusal that does not change the binding and does not name the other doctor.
- [x] Update the access paragraph in `docs/PROJECT.md`: owner passwords and sessions live in this application; staff accounts stay on module-auth; the two cookies cannot open each other's surface.
- [x] Run the verification checks below.

## Verification
- Sign in as a clinician, open `/settings` in the personal workspace, copy the link, reload, and confirm the code is unchanged. Switch to an organization workspace and confirm a second stable code.
- Signed out, open a valid link and an unknown code. Confirm the valid page shows only that doctor's label (plus organization name for an organization code) and the unknown code shows `Код не найден` without other names.
- Register an owner, confirm `/cabinet` shows that doctor, sign out, and sign in again with email and password. Confirm no mail is sent.
- Repeat registration with another doctor's code and confirm the stored doctor and workspace stay the same.
- Confirm a staff email already present in `staff_email_reservations` cannot register an owner, and an owner email cannot pass the staff register form. Confirm the error text is the same generic sentence in both cases.
- Call `GET /patients` with only the owner cookie and confirm the staff sign-in gate. Open `/cabinet` with only the staff cookie and confirm the owner sign-in gate.
- Confirm the new owner has one `pending` registration and no new `clients` or `patients` row.
- From `frontend/`, run `npm run check`. From `apps/api/`, run `uv run python -c "from vetdietderm_api.main import app"`.


## Verification Results
- PASS: frontend npm run check; API import; 11 isolated owner/auth boundary tests; PostgreSQL migration SQL generation 0022 to 0023.
- SKIP: live clinician/organization browser walkthrough and deployed PostgreSQL migration (no authenticated browser session or isolated PostgreSQL configured for this task). API flows above use isolated SQLite and a deterministic module-auth authority; no mail calls occur.


- FOLLOW-UP PASS: isolated PostgreSQL upgrade/downgrade/re-upgrade 0022 -> 0024 -> 0022 -> 0024; browser at 390px: valid preview, registration, bound doctor, unknown-code failure and owner-cookie staff gate. QA authority was stubbed; real module-auth clinician/organization browser walkthrough remains skipped.
