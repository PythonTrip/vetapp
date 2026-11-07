---
source_prd: docs/prd/2026-11-07_booking-by-problem_prd.md
prd_id: 2026-11-07-booking-by-problem
cycle_id: 2026-11-07-booking-by-problem
cycle_slug: booking-by-problem
project_doc: docs/PROJECT.md
status: Done
---

# Doctor Classifies the Visit

## Implementation Status
Status: Done

## Description
Staff confirm an owner request with a real start, a duration, and one bookable visit type. That type is the doctor's classification for the day schedule. The owner is not asked to accept it, and the cabinet does not use it as the request title. The first empty encounter complaint opened from the linked appointment receives the owner's problem text.

## Requirements
- `VisitConfirm` requires `visit_type` of `primary`, `secondary`, `consultation`, or `supervision`, plus the existing `starts_at`, `duration_min` of 5–480, and the existing optional registration acceptance. A missing or non-bookable type returns 422 and does not create an appointment. Remove the interim 422 that `describe-visit-problem` uses when the stored type is null.
- `confirm` writes `body.visit_type` onto both the new appointment and the visit request in the same transaction. The request stays out of the day schedule until that confirmation succeeds. Confirmation still copies the stored problem text into `appointments.notes` and still accepts a pending registration in that transaction.
- The staff confirmation form shows a required visit-type select with the four bookable Russian labels and no preselected value when the request type is null. When the request already has a bookable type, that value starts selected and the doctor can change it before submit. The form does not ask the owner to confirm the choice.
- The day schedule still requires a visit type when a doctor creates or edits an appointment directly. This issue does not remove that control, does not add a problem field to doctor-created appointments, and does not add a specialty field to the owner request or to `VisitConfirm`.
- `AppointmentRead` includes `owner_problem: str | None`, copied from the linked `VisitRequest.reason`. It is null when no request is linked or the stored problem is null. It is not a copy of `appointments.notes`.
- Opening an encounter from an appointment that has no encounter yet fills an empty complaint with `owner_problem` when that text is non-blank. A complaint the doctor has already typed or saved is left as written. Appointment notes are not the complaint source.
- The first time `update_appointment` sets `encounter_uuid` from null to an encounter, if that encounter's `chief_complaint` is null or whitespace and the linked request has a non-blank `reason`, store that reason as `chief_complaint` in the same transaction. A later encounter patch and a later appointment patch that keeps the same encounter do not fill it again. The doctor can still change `chief_complaint` through the encounter update.
- Changing a linked appointment to a bookable type still copies that type onto the request and still leaves `answers` untouched. A retained legacy type is still not copied. The owner cabinet title remains the problem text from `describe-visit-problem`.
- The day schedule continues to show the visit type to staff. The owner request and the owner cabinet do not show the assigned type as the title.
- Update the confirmation sentence in `docs/PROJECT.md`: a new owner request has no visit type until staff confirm one, and the first empty linked complaint receives the problem text.

## Acceptance Criteria
- Confirming a null-type request with `starts_at`, `duration_min`, and `visit_type: "consultation"` creates one scheduled appointment of that type, stores the same type on the request, and the appointment appears on the day schedule. The owner list title remains the problem text.
- Confirming without `visit_type`, or with `recheck`, `procedure`, or `telemedicine`, returns 422 and leaves the request `requested` with no appointment.
- The confirmation form cannot be submitted until a type, a start, and a duration are present. A viewer still cannot confirm.
- A doctor can create a schedule appointment and must still choose one of the four bookable types. That appointment's `owner_problem` is null unless a visit request is already linked.
- Opening a new encounter from a linked appointment shows the problem text in the empty complaint field. Saving it stores that text. If the doctor replaces the text before the first save, the replacement is stored. Reopening the saved encounter does not restore the problem text over the edited complaint.
- Linking an appointment to an encounter whose complaint is already non-blank does not change that complaint. Linking one whose complaint is empty stores the linked request's problem text. A second patch of the same link does not overwrite a complaint the doctor cleared after that first fill.
- An appointment with staff notes and no linked request opens an empty complaint. Specialty on the encounter form is unchanged, and the owner payload still has no specialty.

## Dependencies
`docs/issues/booking-by-problem/describe-visit-problem.md`. That issue makes `visit_requests.visit_type` nullable, requires the problem text, and leaves confirmation of a null type as 422 `Укажите тип визита`. This issue replaces that branch. Existing schedule visit-type editing and encounter specialty stay in place.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/visits/schemas.py`
- `apps/api/src/vetdietderm_api/visits/repository.py`
- `apps/api/src/vetdietderm_api/appointments/schemas.py`
- `apps/api/src/vetdietderm_api/appointments/repository.py`
- `apps/clinic-web/src/features/owner-cabinet/components/visit-request-queue.tsx`
- `apps/clinic-web/src/features/owner-cabinet/components/visit-request-queue.test.tsx`
- `apps/clinic-web/src/features/appointments/components/schedule-board.tsx`
- `apps/clinic-web/src/app/_components/encounter-workspace.tsx`
- `apps/clinic-web/src/app/_components/audit-regressions.test.tsx`
- `apps/api/tests/test_visit_requests.py`
- `packages/api-contract/openapi.json`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Step 1: Add required `visit_type: VisitType` to `VisitConfirm`. Remove the null-type 422 branch in `confirm` and set both `Appointment.visit_type` and `row.visit_type` from `body.visit_type`. Keep the problem text on `notes`, the registration acceptance, and the rule that the appointment is inserted only after validation.
- [x] Step 2: Add `owner_problem` to `AppointmentRead`, loaded from the linked visit request's `reason` in the appointment read path. Do not source it from `notes`.
- [x] Step 3: In `update_appointment`, on the transition of `encounter_uuid` from null to a value, fill a blank linked encounter complaint from the linked request reason once. Leave a non-blank complaint, later edits, answer snapshots, and the existing bookable-type copy unchanged.
- [x] Step 4: Run `pnpm api:generate`.
- [x] Step 5: Add the required four-type select to `ConfirmVisit` in `visit-request-queue.tsx`. Send `visit_type` in the confirm body. Preselect only a bookable type already stored on the row. Keep start, duration, and registration acceptance.
- [x] Step 6: In `encounter-workspace.tsx`, when the selected appointment has no encounter yet, set the empty complaint from `owner_problem` instead of `notes`. Keep `loadEncounter` for a saved encounter so an edited complaint stays edited.
- [x] Step 7: Check `schedule-board.tsx` still requires a bookable visit type for a doctor-created appointment and still shows the type on the day list. Do not add a specialty control to the owner request.
- [x] Step 8: Update the confirmation and complaint sentences in `docs/PROJECT.md`.
- [x] Step 9: Update the confirm and complaint tests that still omit `visit_type` or expect notes to become the complaint, then run Verification.

## Verification
- As an editor, confirm a new problem request with a start, a duration, and each of the four bookable types. The schedule shows that type; the owner title stays the problem text; the request is absent from the schedule before confirm.
- Submit confirm without a type and with `procedure`. Both fail with 422 and leave no appointment.
- Create an appointment from the schedule without an owner request and confirm the type control is still required and `owner_problem` is null.
- Open `/encounter?appointmentId=` for a linked appointment with an empty complaint and confirm the problem text is present. Save a different complaint, reload, and confirm the edited text remains. Link an encounter that already has a complaint and confirm it is unchanged.
- Patch the linked appointment from `consultation` to `primary` and confirm the request type follows, the answer snapshot does not, and the owner title is still the problem text.
- Run `uv run --directory apps/api python -m py_compile src/vetdietderm_api/visits/repository.py src/vetdietderm_api/appointments/repository.py`.
- Run `pnpm api:check`.
- Run the updated confirmation cases in `apps/api/tests/test_visit_requests.py` and `apps/clinic-web/src/features/owner-cabinet/components/visit-request-queue.test.tsx`.

## Verification Results — 2026-11-07
- API: 49 passed, 1 skipped. Command: `uv run --directory apps/api --cache-dir F:/Projects/vetapp/.tmp/uv-cache python -m pytest tests/test_visit_requests.py -q -rs --basetemp=F:/Projects/vetapp/.tmp/classify-pytest-final -o cache_dir=F:/Projects/vetapp/.tmp/classify-pytest-cache`. TestClient required execution outside the Windows sandbox; the sandboxed run stalled and was stopped.
- API coverage: all four confirmation types for null and existing request types; missing and legacy types return 422 without accepting registration or creating an appointment; confirmation rollback, viewer restrictions, schedule type edits and immutable answer snapshots; owner problem read independently of staff notes; direct appointments have no owner problem; first-link complaint fill preserves nonblank complaints and does not repeat after clearing; null/whitespace historical reasons and unlinked staff notes never fill a complaint.
- Clinic UI: 25 passed across `visit-request-queue.test.tsx`, `audit-regressions.test.tsx`, and `api-contract.test.ts`. Command from apps/clinic-web: `npm exec -- vitest run src/features/owner-cabinet/components/visit-request-queue.test.tsx src/app/_components/audit-regressions.test.tsx src/app/_components/api-contract.test.ts --maxWorkers=1`.
- UI coverage: null type starts blank, each of the four choices submits, missing type/start/duration disables submit, stored type can be changed, pending registration acceptance remains, observers have no write actions, API errors retain the row; complaint uses only nonblank owner_problem, saves a doctor's replacement, and preserves it on reopening. Existing schedule tests retain the four bookable types and readable legacy types. Owner titles remain problem-based by source inspection and existing queue/API checks.
- Clinic TypeScript and targeted ESLint passed. Both Python repositories compiled successfully with the declared `uv run --directory apps/api python -m py_compile ...` check (explicit workspace cache path used).
- Generated contract and freshness check passed using equivalent existing npm scripts: `npm --prefix packages/api-contract run generate` and `npm --prefix packages/api-contract run check:generated`, in place of the pnpm wrappers.
- Skip: the existing concurrent questionnaire-publication PostgreSQL check could not create an isolated schema (OperationalError). The visit and complaint API checks passed on isolated SQLite.
- Skip: live editor/viewer browser walkthrough and live PostgreSQL verification were not run; rendered component tests, API role checks and direct source inspection cover the requested behavior. No production data or migration was needed for this issue.
- Self-review and `git diff --check` passed. Cycle remains In Progress: post-visit-charge is Not Started; no cycle completion claimed.
