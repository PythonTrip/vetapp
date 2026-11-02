---
source_prd: docs/audit/2026-11-01-audit.md
prd_id: 2026-11-01-clinical-state
cycle_id: 2026-11-01-clinical-state
cycle_slug: clinical-state
project_doc: docs/PROJECT.md
status: Done
---

# Owner Visit Gallery Copy

## Implementation Status
Status: Done

## Description
Confirming an owner visit, or uploading a file after the animal is already linked to a patient, copies the file into the clinician gallery. The copy is created on the plain `owner_db` session, so `Attachment.tenant_id` and `Attachment.created_by` stay null. Clinical reads use `TenantSession` and hide that row. The owner can still see the original request file. This issue stamps the copy with the invitation workspace and repairs existing owner-uploaded rows that can be matched to a patient workspace.

## Requirements
- `copy_gallery` in `apps/api/src/vetdietderm_api/visits/repository.py` must set `Attachment.tenant_id` and `Attachment.created_by` from the request owner's `JoinCode`: `tenant_id=code.tenant_id` and `created_by=code.doctor_user_id`.
- Apply that stamp on both callers: `confirm` and `upload` in the same repository. Personal workspaces keep `tenant_id` null and a non-null `created_by`. Organization workspaces set both.
- Pass those values into `create_attachment` before its flush. Do not move visit confirmation onto `get_session` / `TenantSession`. `owner_db` is a plain session from `get_session_factory` and does not populate `session.info["user_id"]`; `TenantSession.before_flush` would not see the clinical user.
- Set `VisitRequestFile.gallery_copied` only after the new attachment has `created_by == code.doctor_user_id`. A missing `JoinCode` leaves `gallery_copied` false and does not commit an unowned attachment.
- Leave clinician `POST /patients/{patient_id}/attachments` on `TenantSession`. Omitting the new ownership arguments must still let `before_flush` stamp the signed-in clinical user.
- Add Alembic revision `0034_owner_gallery_ownership` with `down_revision = "0033_owner_uploads"`. Update `attachments` from the linked `patients` row only when `uploaded_by_owner` is true, both attachment ownership columns are null, and `patients.created_by` is not null. Copy `patients.tenant_id` and `patients.created_by`. Leave every other attachment unchanged. `downgrade()` is a no-op: reversing the stamp would hide copies made by the fixed writer.
- Do not change owner request download, questionnaire answers, or file bytes.

## Acceptance Criteria
- After an owner uploads a JPEG or PDF and a clinician confirms the visit, `GET /patients/{patient_id}/attachments` on the clinical session includes the copy, and `GET /attachments/{attachment_id}/file` returns the bytes.
- The same clinician read and download succeed for a personal workspace (`tenant_id` null, `created_by` equal to `JoinCode.doctor_user_id`) and for an organization workspace (both columns set from that `JoinCode`).
- The owner animal file list still contains the copy, with `owner_visible` and `uploaded_by_owner` true.
- A second confirm does not duplicate a copy whose `gallery_copied` is already true.
- An existing owner-uploaded attachment with both ownership columns null and a patient `created_by` becomes visible to that patient's workspace after the migration. An attachment whose patient `created_by` is also null is left unchanged.
- A normal clinician gallery upload still stores the signed-in user's workspace and does not require the caller to pass ownership.

## Dependencies
None. This cycle is the clinical-state slice of `docs/audit/2026-11-01-audit.md` (AUD-004). No other issue under `docs/issues/clinical-state/` blocks it. Assumption: patient rows created by registration acceptance already store `JoinCode.tenant_id` and `JoinCode.doctor_user_id`, so the repair can copy those columns. Parallel work on `booked-visit-type-sync` also edits `apps/api/tests/test_visit_requests.py`.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/visits/repository.py`
- `apps/api/src/vetdietderm_api/attachments/repository.py`
- `apps/api/src/vetdietderm_api/attachments/router.py`
- `apps/api/src/vetdietderm_api/owners/models.py`
- `apps/api/alembic/versions/0034_owner_gallery_ownership.py`
- `apps/api/tests/test_visit_requests.py`

## Implementation Steps
- [x] Step 1: Add optional `tenant_id` and `created_by` arguments to `create_attachment` and assign them on the new `Attachment` before flush. Keep the defaults unset so clinical `TenantSession.before_flush` still stamps `POST /patients/{patient_id}/attachments`.
- [x] Step 2: In `copy_gallery`, load the request owner's `JoinCode`. Pass `code.tenant_id` and `code.doctor_user_id` into `create_attachment`. Set `gallery_copied` only when the flushed attachment `created_by` equals `code.doctor_user_id`. If the code is missing, raise the existing not-found path and do not mark the request file copied.
- [x] Step 3: Keep `confirm` and `upload` on the plain visit session. Do not add `session.info["user_id"]` as a substitute for the explicit columns.
- [x] Step 4: Add revision `0034_owner_gallery_ownership` after `0033_owner_uploads` with the patient-provenance update described in Requirements, and a no-op downgrade.
- [x] Step 5: Extend `apps/api/tests/test_visit_requests.py` so a personal-workspace confirm and an organization-workspace confirm each upload a file, then the matching clinical client lists and downloads the copy. Assert both ownership columns on the organization row and null `tenant_id` plus the doctor id on the personal row.
- [x] Step 6: Run the verification commands below.

## Verification
- `uv run --directory apps/api pytest tests/test_visit_requests.py -q` passes, including the personal and organization gallery-copy cases.
- In that test, the clinical `GET /patients/{patient_id}/attachments` body contains the copied file and `GET /attachments/{attachment_id}/file` is not 404.
- `uv run --directory apps/api alembic heads` prints `0034_owner_gallery_ownership` as the single head.

## Verification Results
- 2026-11-02: `uv run --directory apps/api pytest tests/test_visit_requests.py tests/test_owner_gallery_migration.py -q`: 21 passed. Personal and organization JPEG/PDF cases cover confirmation, upload after linking, clinical download, owner visibility, invitation provenance, isolation, and normal clinical stamping. Missing invitation rolls back without a copy.
- `uv run --directory apps/api alembic heads`: `0034_owner_gallery_ownership (head)` (single head).
- Actual repair upgrade, repeat upgrade, and no-op downgrade verified on isolated SQLite, including excluded records. No live PostgreSQL migration was applied.
- Cycle remains open: other clinical-state issues are Not Started. No matching clinical-state roadmap row exists in `docs/PROJECT.md`; unrelated roadmap rows were left unchanged.
