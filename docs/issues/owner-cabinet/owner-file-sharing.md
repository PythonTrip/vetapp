---
source_prd: docs/prd/2026-10-27_owner-cabinet_prd.md
prd_id: 2026-10-27-owner-cabinet
cycle_id: 2026-10-27-owner-cabinet
cycle_slug: owner-cabinet
project_doc: docs/PROJECT.md
status: Not Started
---

# Owner File Sharing

## Implementation Status
Status: Not Started

## Description
The owner can download a gallery file only after the clinician marks it visible, and the clinician can hide it again. Files already in the gallery stay clinician-only. Linking an old client card does not open its old files. Owner uploads on a future visit request will use the same flags; this issue does not add that upload screen.

## Requirements
- `attachments.owner_visible` is a boolean, not null, default false. Existing rows stay false. `attachments.uploaded_by_owner` is a boolean, not null, default false.
- The clinician gallery on the patient tab «Галерея» shows a switch «Показывать владельцу» for each file. Turning it on sets `owner_visible`. Turning it off hides the file from the owner again. The file remains in the clinician gallery either way.
- A file with `uploaded_by_owner` true shows the badge «От владельца». Clinician uploads keep the badge off. `create_attachment` accepts both flags and defaults them to false, so a later visit-request issue can store an owner upload as visible without a second gallery path.
- The owner lists and downloads only files where `owner_visible` is true and `patient_uuid` is a patient on the linked client. The list items are `uuid`, `caption`, `content_type`, `byte_size`, `created_at`, and `uploaded_by_owner`. They omit the storage key, encounter, VAS, body region, and clinical notes.
- A hidden file, a file of another owner, and an unknown id all return 404 on the owner download route. The owner has no delete action. The clinician download and delete routes stay as they are and still open clinician-only files.
- Accepting a registration or linking an existing client does not change `owner_visible` on that client's current attachments. The clinician shares an older file one by one.
- Before the registration has a linked client, the cabinet does not offer gallery files for a pending animal. The animal card says «Файлы появятся, когда врач примет регистрацию».
- After the link, each patient on that client has a «Файлы» block. An empty shared list says «Врач пока не открыл файлы». Download saves the bytes already stored under `ATTACHMENT_DIR`.
- Size and type limits stay `MAX_ATTACHMENT_BYTES` (8 MiB) and JPEG, PNG, WebP, GIF, PDF. This issue does not add an owner upload form and does not move files to object storage.
- An organization observer does not see a working switch: `PATCH` is already rejected for observers by `require_clinical_access`. Editors can change the flag.
- The owner file block is a single column usable at 390px. Russian UI.
- A staff session cannot call the owner file routes. An owner session cannot call `GET /attachments/{id}/file`.

## Acceptance Criteria
- A clinician uploads a file. It appears in the gallery with the switch off and without the owner badge. The owner's file list for that patient does not include it, and the owner download URL returns 404.
- The clinician turns the switch on. The owner sees the file and downloads bytes whose size and content type match the gallery row. The clinician turns the switch off, and the file leaves the owner list; the clinician gallery still shows it.
- Linking a client who already has gallery files leaves every existing `owner_visible` value false until the clinician switches one file.
- A pending registration's cabinet animal shows the waiting copy and no file from the future patient.
- An owner cannot delete a shared file. A clinician still can delete a file, after which the owner download returns 404.
- An observer's request to set `owner_visible` returns 403, and the stored flag stays unchanged.
- Opening another owner's visible file id returns 404.

## Dependencies
- `docs/issues/owner-cabinet/registration-acceptance.md` is Done. The owner sees patients only after `owner_registrations.client_uuid` is set, through `list_animals` in `apps/api/src/vetdietderm_api/owners/repository.py`.
- Existing gallery: `apps/api/src/vetdietderm_api/attachments/` (`MAX_ATTACHMENT_BYTES`, `ALLOWED_CONTENT_TYPES`, `create_attachment`, `GET /attachments/{attachment_id}/file`) and `frontend/src/components/clinical/dermatology-gallery.tsx`.
- Visit-request uploads are a later issue. This issue only leaves `create_attachment` able to record `uploaded_by_owner` and `owner_visible`.

## Files Likely Touched
- `apps/api/alembic/versions/0026_owner_file_visibility.py`
- `apps/api/src/vetdietderm_api/attachments/models.py`
- `apps/api/src/vetdietderm_api/attachments/schemas.py`
- `apps/api/src/vetdietderm_api/attachments/repository.py`
- `apps/api/src/vetdietderm_api/attachments/router.py`
- `apps/api/src/vetdietderm_api/owners/router.py`
- `frontend/src/components/clinical/dermatology-gallery.tsx`
- `frontend/src/components/owner/animal-files.tsx`
- `frontend/src/components/owner/animal-list.tsx`
- `frontend/src/lib/api-client.ts`
- `frontend/src/lib/owner-api.ts`
- `frontend/src/lib/hooks.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [ ] Add the next Alembic revision after the current head (`0025_registration_acceptance` unless a newer revision is already head). Add `attachments.owner_visible` and `attachments.uploaded_by_owner`, both boolean, not null, server default false.
- [ ] Add both fields to `Attachment`, `AttachmentRead`, and `AttachmentUpdate` (`owner_visible` optional on update). Extend `create_attachment` with the two flags, default false. `update_attachment` persists `owner_visible` when it is present and does not let a clinician PATCH clear `uploaded_by_owner`.
- [ ] Add `GET /owner/animals/{animal_id}/files` and `GET /owner/files/{attachment_id}` on the owner session. The list and the download succeed only when the animal id is a patient of the owner's linked client and, for the download, `owner_visible` is true. Otherwise return 404 `Файл не найден`. The download uses `resolve_file` and the stored content type. Do not add an owner delete route.
- [ ] In `dermatology-gallery.tsx`, add the visibility switch and the «От владельца» badge on each card. Hide the switch action's success path for a 403 from an observer; the existing clinical guard already rejects the PATCH.
- [ ] In each cabinet animal card, show the waiting copy when the owner has no linked client. After the link, show the shared-file list, the empty copy, a download action, and a load error with `ownerError`. Do not add an upload or delete button. Keep one column at 390px.
- [ ] Note in `docs/PROJECT.md` that a gallery file is hidden from the owner until the clinician marks it visible, and that linking a client does not share the old gallery.
- [ ] Run the verification checks below.

## Verification
- Upload a JPEG under 8 MiB as the clinician. Confirm the owner list omits it and `GET /owner/files/{id}` returns 404. Turn the switch on, download as the owner, and confirm the body matches the stored file. Turn the switch off and confirm the owner list no longer contains it while the gallery still does.
- Accept a registration onto a client that already has attachments. Confirm those rows stay `owner_visible` false, then share one and confirm only that one appears for the owner.
- Open the cabinet for a still-pending animal and confirm the waiting copy.
- Call the owner download with another owner's visible file id and confirm 404. Confirm the cabinet has no delete control. Delete the file as the clinician and confirm the owner download then returns 404.
- As an organization observer, PATCH `owner_visible` and confirm 403 with the flag unchanged.
- Confirm `GET /attachments/{id}/file` with only the owner cookie does not return the file.
- From `frontend/`, run `npm run check`. From `apps/api/`, run `uv run python -c "from vetdietderm_api.main import app"`.
