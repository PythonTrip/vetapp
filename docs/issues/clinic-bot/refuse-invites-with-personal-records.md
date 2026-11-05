---
source_prd: docs/prd/2026-11-03_clinic-bot_prd.md
prd_id: 2026-11-03-clinic-bot
cycle_id: 2026-11-03-clinic-bot
cycle_slug: clinic-bot
project_doc: docs/PROJECT.md
status: Done
---

# Refuse Clinic Invites When Personal Records Exist

## Implementation Status
Status: Done

## Description
Review finding P1: opening an organization invite can create a source clinic before any clinical request runs personal-row migration. `accept_clinic_invite` counts only source-tenant patients and owners, so it can accept a populated personal workspace as empty. The next clinical request then moves those records into the destination. This repairs the PRD's Joining another doctor's clinic refusal rule.

## Requirements
- Before consuming an invite, include legacy personal patients and connected owners belonging to the invitee in the source-clinic emptiness decision.
- Identify personal patients by the existing author/tenant ownership rules and personal owners through the invitee's join codes; do not count unrelated tenant-null records.
- Refuse with the existing 409 response if either source-clinic or attributable personal patients or connected owners exist.
- On refusal, leave both clinics, personal records, invite, bot credentials, public links, and memberships unchanged. Prefer a read-only legacy-record check rather than migrating records just to reject the invite.
- Templates, custom catalog items, and patient-less diet plans alone must not prevent acceptance. Preserve the existing authority checks for closing the source clinic.
- Include the no-source-organization branch in the ownership check so it cannot bypass the refusal for personal records.

## Acceptance Criteria
- A returning doctor opens the invite before visiting a clinical route, with one personal patient: acceptance returns 409 and no upstream accept or close call occurs.
- The same scenario with a connected personal owner and no patients also returns 409.
- A tenant-owned patient or owner still causes refusal.
- Another doctor's tenant-null records do not block an otherwise empty invitee.
- An invitee with only reusable templates, custom fields, or patient-less plans passes the emptiness check.
- Failed acceptance does not move personal data into the destination on a subsequent clinical request.

## Dependencies
None. Existing module-auth invite acceptance and ownership rules remain in place. Coordinate edits to `auth.py` with `recover-clinic-invite-transfer.md`; neither issue requires the other's behavior to be implemented first.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/auth.py`
- `apps/api/src/vetdietderm_api/tenancy.py`
- `apps/api/src/vetdietderm_api/patients/models.py`
- `apps/api/src/vetdietderm_api/owners/models.py`
- `apps/api/tests/test_multi_user_auth.py`

## Implementation Steps
- [x] Step 1: Trace the invite page's `/me` and invite-accept sequence, including the branch without an organization and the attribution of personal owners.
- [x] Step 2: Extend the pre-accept emptiness decision to include attributable personal patients and connected owners without mutating them.
- [x] Step 3: Apply the decision before every upstream invite-accept or source-close call and retain existing authority checks and refusal text.
- [x] Step 4: Verify patient-only, owner-only, unrelated-owner, reusable-record-only, and no-source-organization scenarios.

## Verification
- Exercise invite acceptance against isolated fixtures before any clinical request. Compare local records and upstream call traces before and after both patient-only and owner-only refusals; expect 409 and no accept/delete calls.
- Repeat with source-tenant records, unrelated personal records, and only reusable records to confirm the exact refusal boundary.
- Run `uv run --directory apps/api python -m py_compile src/vetdietderm_api/auth.py src/vetdietderm_api/tenancy.py`.

## Implementation Evidence
- `check_empty_clinic` now counts source-clinic patients and owners plus this doctor's null-tenant patients (`created_by`) and null-tenant owners connected through that doctor's own join codes. The count is read-only. Templates, catalog items, and patient-less plans are not counted. Unrelated null-tenant rows are not counted.
- The no-organization branch runs the same check before `POST /invites/accept`. Refusal uses the existing 409 text and happens before transfer progress, invite acceptance, and source closure. Authority checks for closing the source clinic are unchanged.
- `uv run --cache-dir F:/Projects/vetapp/apps/api/.tmp/uv-cache --directory apps/api python -m pytest tests/test_multi_user_auth.py -q -o faulthandler_timeout=30`: 39 passed. Covers personal patient and personal owner refusals with and without a source clinic, the following clinical read staying on the source clinic, an empty personal workspace, unrelated null-tenant rows, reusable personal rows, and the existing tenant-owned and authority refusals.
- `uv run --cache-dir F:/Projects/vetapp/apps/api/.tmp/uv-cache --directory apps/api python -m py_compile src/vetdietderm_api/auth.py src/vetdietderm_api/tenancy.py`: passed. `git diff --check`: passed.
- Live module-auth was not called. Verification used controlled authority responses and isolated SQLite. Clinic Bot remains In Progress while `migrate-questionnaires-before-owner-visits` is open.
