---
source_prd: docs/audit/2026-11-01-audit.md
prd_id: 2026-11-01-clinical-state
cycle_id: 2026-11-01-clinical-state
cycle_slug: clinical-state
project_doc: docs/PROJECT.md
status: Not Started
---

# Booked Visit Type Sync

## Implementation Status
Status: Not Started

## Description
A confirmed owner request and its calendar appointment are one booking. `update_appointment` copies time, duration, status, and `updated_at` onto the linked `VisitRequest`, and skips `visit_type`. The owner cabinet labels the visit from `VisitRequest.visit_type`, so after the clinician changes the booked service the owner still sees the previous type. Questionnaire answers on the request are a snapshot and must stay as submitted.

## Requirements
- In `update_appointment` in `apps/api/src/vetdietderm_api/appointments/repository.py`, when a linked `VisitRequest` exists and the payload changes `visit_type` to a `BookableVisitType` (`primary`, `secondary`, `consultation`, or `supervision`), set `linked.visit_type` to `appointment.visit_type` in the same transaction as the time, duration, and status copy.
- Do not modify `linked.answers`.
- When the appointment already has a legacy type (`recheck`, `procedure`, or `telemedicine`) and the patch keeps that type, leave `linked.visit_type` unchanged. The current update rule already rejects changing a bookable appointment to a legacy type.
- `GET /owner/animals/{animal_id}/visits` and `GET /visit-requests` both serialize `VisitRead.visit_type`, so both lists show the updated bookable type without a cabinet change.
- Time, duration, and status synchronization already in `update_appointment` stays in place. Owner cancellation behavior stays in place.

## Acceptance Criteria
- Confirm an owner request as `supervision`, then `PATCH /appointments/{id}` with `visit_type: "primary"`. The staff appointment and the owner visit list both return `primary`.
- The request `answers` array is byte-for-byte the same as before that patch.
- A patch that changes only `starts_at` leaves `visit_type` as it was on both records.
- Patching a legacy `recheck` appointment while sending `visit_type: "recheck"` does not write `recheck` onto a linked request.
- Changing `supervision` to `procedure` still returns 422, and neither record changes type.

## Dependencies
None. This cycle is the clinical-state slice of `docs/audit/2026-11-01-audit.md` (AUD-007). No other issue under `docs/issues/clinical-state/` blocks it. Assumption: owner-confirmed appointments only use the four bookable types, so a type change that passes the existing validator is safe to store on `VisitRequest.visit_type` and in `VisitRead`. Parallel work on `owner-visit-gallery-copy` also edits `apps/api/tests/test_visit_requests.py`.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/appointments/repository.py`
- `apps/api/src/vetdietderm_api/visits/schemas.py`
- `apps/api/src/vetdietderm_api/questionnaires/schemas.py`
- `packages/owner-features/src/components/visit-request-form.tsx`
- `apps/api/tests/test_visit_requests.py`

## Implementation Steps
- [ ] Step 1: After `update_appointment` copies `starts_at`, `duration_min`, and `status` onto `linked`, also copy `visit_type` when the new appointment value is one of `primary`, `secondary`, `consultation`, or `supervision`.
- [ ] Step 2: Leave `linked.answers` out of that assignment. Leave the linked type untouched when the appointment value is `recheck`, `procedure`, or `telemedicine`.
- [ ] Step 3: Extend `apps/api/tests/test_visit_requests.py`: confirm `supervision`, patch the appointment to `primary`, and assert the owner `GET /owner/animals/{animal_id}/visits` item and the staff appointment both return `primary` while `answers` stay unchanged. Assert a starts-at-only patch does not change type, and a legacy `recheck` patch does not overwrite a linked request type.
- [ ] Step 4: Run the verification command below. Do not change `VISIT_TYPE_LABELS` in `visit-request-form.tsx` unless the owner response still shows the pre-patch type after the API returns the new one.

## Verification
- `uv run --directory apps/api pytest tests/test_visit_requests.py -q` passes, including the supervision-to-primary owner list assertion.
- The owner visit JSON `visit_type` equals the patched appointment `visit_type`, and `answers` equals the pre-patch snapshot.
- `pnpm --dir apps/owner-web exec vitest run src/visit-request-form.test.tsx --maxWorkers=1` passes without a label change when the API fixture already uses the updated type.
