---
source_prd: docs/prd/2026-10-27_owner-cabinet_prd.md
prd_id: 2026-10-27-owner-cabinet
cycle_id: 2026-10-27-owner-cabinet
cycle_slug: owner-cabinet
project_doc: docs/PROJECT.md
status: Done
---

# Visit Request

## Implementation Status
Status: Done

## Description
The owner asks for a visit for one animal, answers the doctor's published questionnaire, and can attach photos or documents. The request does not occupy the day schedule until the clinician confirms a real start and duration. The first confirmation also accepts a still-pending registration. New clinician appointments use the same four visit types; older recheck, procedure, and telemedicine rows stay readable.

## Requirements
- Owner request fields are one animal the owner can already see, one bookable type (`primary`, `secondary`, `consultation`, `supervision`), a proposed start, and questionnaire answers. The owner does not send a duration. Creating a request does not insert an `appointments` row.
- If that inviting doctor has at least one question published for the type, every question is required and a missing or blank answer returns 422. The stored snapshot copies `question_id`, `label`, `kind`, and the submitted value. A later `PUT` of the questionnaire does not change that snapshot. Zero published questions, or no questionnaire row, allows a request with an empty snapshot.
- Answer shapes: `binary` is `yes` or `no`; `single_select` is one of the option values; `multi_select` is a non-empty subset of the option values; `number` is a finite number; `text` is a trimmed string of 1 to 4000 characters; `date` is an ISO date. Select labels in the snapshot are the labels from the published question at submit time.
- The owner may attach zero or more files. Each file uses the gallery rules already in `attachments/storage.py`: at most 8 MiB, and only JPEG, PNG, WebP, GIF, or PDF. Files stay on the request after reject or withdraw, and both the owner and the clinician who can see the request can download them. When the animal is already a patient, also store a gallery row through `create_attachment` with `uploaded_by_owner=true` and `owner_visible=true`. When the patient appears only at confirmation, create those gallery rows then. Do not copy answers into an encounter.
- Statuses are `requested`, `scheduled`, `rejected`, `withdrawn`, `cancelled`, `completed`, and `no_show`. The owner sees `withdrawn` as «Отозван». The other owner labels are «Запрошен», «Назначен», «Отклонён», «Отменён», «Завершён», and «Не явился». `requested` and `rejected` are not appointments, so they stay off `GET /appointments`.
- The owner may withdraw only a `requested` visit. It leaves the pending set. The owner may cancel a `scheduled` visit; the linked appointment becomes `cancelled` too. The owner cannot change the confirmed clock or duration.
- Confirm is a staff action for the same people who may accept the registration (`authorize_registration(..., write=True)`). `GET /visit-requests?status=requested` includes `can_write` and `registration_status` (`pending` or `accepted`) so the pending-list screen knows whether to show actions and whether confirm must also accept. The clinician supplies the real `starts_at` and `duration_min` (5 to 480, the existing appointment bounds). Confirm creates an appointment in the join-code workspace with status `scheduled` and the bookable visit type, then sets the request to `scheduled`. The owner payload includes both `proposed_starts_at` and `confirmed_starts_at`.
- If the registration is still `pending`, confirm also calls `accept_registration` with the same create-or-link body that route already requires, then points the request at the resulting patient. One database transaction covers the accept and the appointment. A second confirm returns 409.
- Reject sets `rejected`, stores an optional trimmed reason of at most 500 characters, and creates no appointment. The owner sees the reason.
- A clinician reschedule, complete, or no-show stays on the existing appointment PATCH. After that PATCH, a linked request copies `starts_at`, `duration_min`, and a status of `scheduled`, `completed`, `cancelled`, or `no_show`. The owner visit payload has no encounter text, diagnoses, or prescriptions.
- New `POST /appointments` and the schedule create form accept only the four bookable types. `GET /appointments` still returns stored `recheck`, `procedure`, and `telemedicine`. Their labels stay «Повторный осмотр», «Процедура», and «Дистанционно». The schedule edit form keeps the current legacy value selectable so a reschedule can save without changing it, and offers the four new types as the only replacements.
- The owner requests and reviews visits from the animal card, in one column at 390px. Russian UI. This issue exposes confirm and reject as API calls. The queue screen that shows answers and files is the clinician-pending-list issue.

## Acceptance Criteria
- With a published two-question «Первичный» questionnaire, the owner cannot submit until both answers are present. The stored snapshot still shows the original labels after the doctor replaces the questionnaire.
- With an empty «Курирование» questionnaire, the owner submits without answers, and `GET /appointments` for that day does not include the request.
- A PDF over 8 MiB is rejected. A JPEG at or under 8 MiB stays downloadable by the owner after the clinician rejects the request, and the rejection reason is visible. No appointment exists.
- Confirming a request on a still-pending registration creates the client and patients through `accept_registration`, creates one scheduled appointment at the clinician's start and duration, and shows the owner both the proposed time and the confirmed time.
- Withdrawing a requested visit removes it from `GET /visit-requests?status=requested` and creates no appointment. Cancelling a scheduled visit sets the request and the appointment to `cancelled`. The owner cannot submit a new confirmed time.
- Marking the appointment `completed` or `no_show` changes the owner status label and the owner payload still has no encounter fields.
- Creating an appointment from `/schedule` offers only the four new types. An existing `recheck` row still loads with «Повторный осмотр» and can be rescheduled without changing that type.

## Dependencies
- `docs/issues/owner-cabinet/visit-questionnaires.md` must be Done. Published questions are read from `visit_questions`.
- `docs/issues/owner-cabinet/registration-acceptance.md` is Done. `accept_registration` flushes in the caller's transaction and must be called when confirm accepts a pending registration.
- `docs/issues/owner-cabinet/owner-file-sharing.md` is Done. `create_attachment` already accepts `owner_visible` and `uploaded_by_owner`.
- The clinician queue UI is `docs/issues/owner-cabinet/clinician-pending-list.md` and is not built here.

## Files Likely Touched
- `apps/api/alembic/versions/0029_visit_requests.py`
- `apps/api/src/vetdietderm_api/visits/models.py`
- `apps/api/src/vetdietderm_api/visits/schemas.py`
- `apps/api/src/vetdietderm_api/visits/repository.py`
- `apps/api/src/vetdietderm_api/visits/router.py`
- `apps/api/src/vetdietderm_api/appointments/schemas.py`
- `apps/api/src/vetdietderm_api/appointments/repository.py`
- `apps/api/src/vetdietderm_api/main.py`
- `frontend/src/components/owner/visit-request-form.tsx`
- `frontend/src/components/owner/animal-list.tsx`
- `frontend/src/components/clinical/schedule-board.tsx`
- `frontend/src/lib/clinical-labels.ts`
- `frontend/src/lib/api-client.ts`
- `frontend/src/lib/owner-api.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Add Alembic `0029_visit_requests` with `down_revision` `0028_visit_questionnaires`, or the current head if that revision was named differently. Create `visit_requests` with `uuid`, `owner_account_uuid`, nullable `owner_animal_uuid`, nullable `patient_uuid`, nullable `appointment_uuid`, `visit_type`, `proposed_starts_at`, nullable `confirmed_starts_at`, nullable `duration_min`, `status`, nullable `rejection_reason`, `answers` JSONB not null default `[]`, and timestamps. Create `visit_request_files` with `uuid`, `request_uuid` foreign key `ON DELETE CASCADE`, `storage_key`, `content_type`, `byte_size`, and `created_at`. Do not store file bytes in PostgreSQL.
- [x] Add owner routes to create a request, list the owner's requests, withdraw, cancel, upload, and download. Validate the questionnaire snapshot and the file limits. Add staff routes `GET /visit-requests?status=requested`, `POST /visit-requests/{id}/confirm`, and `POST /visit-requests/{id}/reject` behind `require_clinical_access`, using `authorize_registration` for the write check. Confirm calls `accept_registration` only when the registration is pending, then creates the appointment and, if needed, the owner-visible gallery rows, then commits once.
- [x] In `update_appointment`, after a saved change to a linked appointment, copy the start, duration, and mapped status onto the visit request.
- [x] Restrict new appointment writes to the four bookable types. Keep reading legacy `recheck`, `procedure`, and `telemedicine` values. On the schedule create form, offer only the four new labels. On edit, keep the current legacy label as an extra option when the row already has one.
- [x] On each cabinet animal, add a request form and a list of that animal's visits with both times, the status label, the rejection reason, and withdraw or cancel when the status allows it. Stack it in one column at 390px. Do not show encounter text.
- [x] Note in `docs/PROJECT.md` that a visit request stays off the day schedule until confirm, and that new appointments use the four bookable types.
- [x] Run the verification checks below.

## Verification
- Publish two required questions, omit one answer, and confirm 422. Submit both, replace the questionnaire, and confirm the stored snapshot labels are unchanged.
- Submit «Курирование» with no questions and confirm the day schedule query does not list it.
- Reject a request that has a valid JPEG and confirm the owner can still download it, sees the reason, and no appointment row exists. Repeat an upload with a 9 MiB PDF and confirm it is refused.
- Confirm the first request of a pending registration with mode `create`, a start, and a duration. Confirm the registration is accepted, one scheduled appointment exists at that start, and the owner sees both times.
- Withdraw a second requested visit and confirm it is absent from `GET /visit-requests?status=requested`. Cancel a scheduled visit as the owner and confirm the appointment is `cancelled`. Confirm the owner payload has no field that sets the confirmed start.
- Set the linked appointment to `completed` and confirm the owner status is «Завершён» and the payload has no anamnesis or exam text.
- Create a visit from `/schedule` and confirm the type control lists only the four new labels. Load an existing `recheck` appointment and confirm its label is still «Повторный осмотр».
- From `frontend/`, run `npm run check`. From `apps/api/`, run `uv run python -c "from vetdietderm_api.main import app"`.

## Implementation Notes
- Migration: `0029_visit_requests`, following `0028_visit_questionnaires`. File metadata includes `gallery_copied` so confirmation never duplicates an earlier gallery copy. Request originals and gallery copies have separate storage keys.
- Owner API: `GET /owner/visit-questions/{visit_type}`, `GET/POST /owner/animals/{animal_id}/visits`, `POST /owner/visits/{id}/withdraw`, `/cancel`, `/files`, and `GET /owner/visits/{id}/files/{file_id}`.
- Staff API: `GET /visit-requests?status=requested`, `POST /visit-requests/{id}/confirm`, `/reject`, and `GET /visit-requests/{id}/files/{file_id}`. Queue rows include registration identity/status, owner/animal names, answers, files and `can_write`.
- Confirm body: `{ "starts_at": "2026-11-02T12:00:00Z", "duration_min": 45, "registration": { "mode": "create" } }`. A pending registration requires `registration`; the nested body also supports the existing `link`, `client_uuid` and `matches` fields. An accepted registration needs only time and duration. Reject body: `{ "reason": "Выберите другой день" }`.
- Owner creation rejects extra fields such as confirmed time and duration. Appointment PATCH keeps the current legacy type but rejects switching to another legacy type. Deleting a linked appointment cancels the request; changing its patient is refused to preserve the request's animal binding.

## Verification Evidence (2026-10-28)
- Isolated API scenarios in `tests/test_visit_requests.py`: required answers and all six answer shapes; immutable labels/options after questionnaire replacement; empty questionnaire stays outside the schedule; 9 MiB PDF rejection and an 8 MiB JPEG retained after rejection; owner and workspace isolation; observer read/download and write denial; first confirmation with create/link acceptance; separate acceptance before confirmation; duplicate confirmation; withdraw with retained download; cancel; reschedule/completed/no_show synchronization; absence of encounter fields; four new appointment types and preserved legacy edits. All passed.
- Existing owner-cabinet, chat and appointment-integrity checks passed. The ordinary-appointment mock now explicitly returns no linked request. The PostgreSQL clinical-workflow fixture uses `secondary` for a newly created appointment.
- Component checks passed for required questionnaire answers, the four type options, proposed-time-only submission, file retry without duplicate requests, rejection/withdrawal labels, and the legacy schedule edit option; existing cabinet boundary checks passed.
- `npm run check`: passed. `uv run python -c "from vetdietderm_api.main import app"`: passed. Alembic head and offline `0028_visit_questionnaires:head` SQL generation: passed.
- Live PostgreSQL upgrade/concurrency and the PostgreSQL integration suite: not run. A read-only `SELECT 1` connection check returned `OperationalError`; the configured PostgreSQL is unavailable. Migration was not applied to that database.
- Authenticated browser walkthrough at 390px: not run; no live API/database session was provisioned. The component uses a single-column layout with constrained inputs; browser rendering remains to be checked after migration.
- Cycle #7 remains In Progress because `clinician-pending-list.md` is still Not Started; this issue provides its API only.
