---
source_prd: docs/prd/2026-11-03_clinic-bot_prd.md
prd_id: 2026-11-03-clinic-bot
cycle_id: 2026-11-03-clinic-bot
cycle_slug: clinic-bot
project_doc: docs/PROJECT.md
status: Done
---

# The doctor is a clinic

## Implementation Status
Status: Done

## Description
A doctor, including a solo doctor, works in one clinic. That clinic is the doctor's module-auth organization. Registration does not ask the doctor to create an organization, and the personal workspace is no longer a place where patients, templates, or owner entry live. Every clinical read and write uses the clinic.

## Requirements
- On the first verified staff session whose `GET /me` payload has no `organization`, the BFF creates one module-auth organization and refreshes the profile before any clinical read. The organization `name` is `display_name` when that string is non-empty, otherwise the account email. Omit `slug` and let module-auth assign it. The doctor never submits `POST /organizations` from the UI.
- This timing is the stand-in for the open question about which process creates the organization. module-auth rejects `POST /organizations` for an unverified caller, so creation cannot run inside `auth/register`.
- If `organization` is already present, do not create a second organization. That organization is the clinic.
- If module-auth returns `429` or `503` for organization creation, show the upstream error and do not open a personal workspace.
- The clinic administrators are the organization roles `owner` and `admin`. The registering doctor is the organization `owner`.
- Move personal clinical rows into that clinic: rows with `tenant_id IS NULL` and `created_by` equal to the doctor on `clients`, `patients`, `encounters`, `encounter_templates`, `clinical_catalog_items`, `appointments`, `attachments`, `communications`, and `diet_plans`. Leave `encounter_templates` rows with `scope = standard` and `created_by IS NULL` unchanged. Do not change `foods`, `nutrients`, or FEDIAF provider selection.
- Set `owner_accounts.tenant_id` to the clinic for accounts whose current join code belongs to this doctor. For a personal `join_codes` row, if that doctor already has a join code for the clinic, point those owner accounts at the existing clinic code and delete the personal code. Otherwise set the personal code's `tenant_id` to the clinic and its `workspace` to `organization`. This avoids the unique `(doctor_user_id, tenant_id)` index. Choosing the single clinic link among several doctors is `clinic-entry`.
- Run the move idempotently. A second session updates zero rows that already have the clinic id.
- `require_clinical_access` sets `request.state.tenant_id` from `organization.org_id` only. Ignore `X-Vetapp-Workspace`. If the clinic is still missing after the create attempt, return `403` with `Клиника недоступна`.
- `TenantSession` scopes selects and writes to `tenant_id == clinic`. Remove the personal branch `tenant_id IS NULL AND created_by == user`. Keep the standard-template exception: `tenant_id IS NULL AND created_by IS NULL AND scope == standard`. Keep the existing author filter for `scope = doctor` on `encounter_templates` and `clinical_catalog_items`.
- New clinical rows take the clinic id and the signed-in user as `created_by`. A write that changes `tenant_id` or `created_by` on an existing tenant-owned row stays rejected.
- Editor roles remain `owner`, `admin`, and `member`. `viewer` stays read-only. Keep treating any other non-editor role value the API already rejects for writes, including `observer`, as read-only.
- Remove the personal/organization radios, `setWorkspace`, and the client header `X-Vetapp-Workspace`. Remove the "Создать организацию" control and the copy that says an organization is optional. Keep the organization name field for `owner` and `admin`; saving it still calls `PATCH /auth-service/organizations/{org_id}` with `{name}`. Members and viewers see the name and cannot save it.
- The registration queue must not show `Личная практика`. Show the clinic name.
- Staff and owner cookies stay separate. This issue does not change owner password storage.
- Food catalog writes still require global `super_admin`.

## Acceptance Criteria
- A newly verified doctor who has no organization receives one clinic named with the display name, or the email when the display name is empty, without a create-organization step. A second sign-in does not create another organization.
- A doctor who already belongs to an organization keeps that organization. Personal patients, templates, and catalog items of that doctor are readable in the clinic and are not readable through a null `tenant_id`.
- Standard templates remain readable and read-only.
- The settings screen has no personal/organization switch and no create-organization button. An `owner` or `admin` can rename the clinic. A `member` or `viewer` cannot.
- A clinical request with `X-Vetapp-Workspace: personal`, with `organization`, or with the header omitted reads and writes only the clinic. A null-tenant patient row that belonged to the doctor is visible in the clinic after the move.
- A `viewer` can read patients and cannot create or update a patient. Food catalog writes by a non-`super_admin` still fail.
- The registration queue shows the clinic name for a moved owner and does not show `Личная практика`.

## Dependencies
- module-auth `POST /organizations`, `GET /me`, and `PATCH /organizations/{org_id}`, documented in `.codex/skills/module-auth-integration/references/http-contract.md`.
- `clinic-entry` later collapses join codes to one clinic link. This issue only makes each moved code belong to the clinic and removes a same-doctor duplicate.
- Assumption: organization creation runs in the BFF on the first verified staff session, not as a doctor-submitted form and not inside unverified registration.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/auth.py`
- `apps/api/src/vetdietderm_api/tenancy.py`
- `apps/api/src/vetdietderm_api/v1_security.py`
- `apps/api/src/vetdietderm_api/owners/repository.py`
- `apps/api/src/vetdietderm_api/owners/router.py`
- `apps/api/src/vetdietderm_api/visits/repository.py`
- `apps/api/src/vetdietderm_api/chat/repository.py`
- `apps/api/src/vetdietderm_api/attachments/repository.py`
- `apps/clinic-web/src/features/authentication/auth-provider.tsx`
- `apps/clinic-web/src/features/authentication/organization-settings.tsx`
- `apps/clinic-web/src/features/owner-cabinet/components/registration-queue.tsx`
- `apps/clinic-web/src/shared/api/client.ts`
- `packages/api-client/src/http.ts`
- `packages/api-contract/openapi.json`
- `packages/api-contract/src/generated.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Step 1: Add `ensure_clinic` in `apps/api/src/vetdietderm_api/auth.py`. After `require_user` loads an active verified profile with no `organization`, call module-auth `POST /organizations` with `{"name": <display_name or email>}`, then refresh `/me` and return that profile. Do nothing when `organization` is already set. Propagate `429` and `503` without a personal fallback.
- [x] Step 2: Add `rehome_personal_rows(session, user_id, clinic_id)` in `apps/api/src/vetdietderm_api/tenancy.py`. Update `clients`, `patients`, `encounters`, `encounter_templates`, `clinical_catalog_items`, `appointments`, `attachments`, `communications`, and `diet_plans` where `tenant_id IS NULL` and `created_by = user_id`. Skip standard templates. Rehome the doctor's owner accounts and join codes using the duplicate-code rule in Requirements. Commit once. Call it from `require_clinical_access` after `ensure_clinic`, before the request query runs.
- [x] Step 3: Change `require_clinical_access` so `request.state.tenant_id` is always `organization.org_id`. Delete the `personal` / `organization` header branch. Return `403` `Клиника недоступна` when the organization is absent. Keep the editor-role and `super_admin` food-catalog checks.
- [x] Step 4: Change `TenantSession.scope_queries` and `scope_writes` so tenant-owned rows match and receive only the clinic id. Preserve the standard-template read exception and the `scope = doctor` author filter. Reject a missing clinic id on clinical sessions.
- [x] Step 5: Remove the `X-Vetapp-Workspace` parameter from `require_staff_identity` in `apps/api/src/vetdietderm_api/v1_security.py`. In `current_code`, stop branching on workspace and bind the code to the clinic organization.
- [x] Step 6: In `visits/repository.py`, `chat/repository.py`, and `attachments/repository.py`, delete predicates that treat `tenant_id IS NULL AND created_by == user` as a workspace. Authorize those reads with the clinic id from the session.
- [x] Step 7: Remove `workspace`, `setWorkspace`, and `setApiWorkspace` from `auth-provider.tsx` and `packages/api-client/src/http.ts` / `apps/clinic-web/src/shared/api/client.ts`. Staff requests must not send `X-Vetapp-Workspace`.
- [x] Step 8: In `organization-settings.tsx`, remove the workspace radios and the create-organization form. Keep logout, display name, team, invites, and the rename field for `owner` and `admin`. Change the heading to the clinic name.
- [x] Step 9: In `registration-queue.tsx`, replace `row.organization_name || "Личная практика"` with the clinic name.
- [x] Step 10: Regenerate `packages/api-contract` with `pnpm --filter @vetdietderm/api-contract generate`. Update the `docs/PROJECT.md` access bullet and the current-functionality bullet that describe `X-Vetapp-Workspace` and a personal workspace so they say the clinic is the only clinical tenant.
- [x] Step 11: Walk through the Verification checks.

## Verification
- Verify a new verified doctor: `GET /auth-service/me` shows one organization, the settings page has no workspace radios and no create-organization button, and creating a patient stores that `org_id` on `patients.tenant_id`.
- Sign in as a doctor who already had an organization and a personal patient. The patient is listed once, `tenant_id` equals the organization id, and a request that still sends `X-Vetapp-Workspace: personal` returns that same patient.
- Confirm a standard template still opens and cannot be saved over. Confirm a `viewer` gets `403` on patient create and a non-`super_admin` still cannot write the food catalog.
- Rename the clinic as `owner` and reload. The new name is on `GET /me` and on the registration queue. A `member` does not see a save control for the name.
- Run `pnpm lint` and `pnpm typecheck` from the repository root.
