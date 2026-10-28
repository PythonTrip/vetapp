---
source_prd: docs/prd/2026-10-27_owner-cabinet_prd.md
prd_id: 2026-10-27-owner-cabinet
cycle_id: 2026-10-27-owner-cabinet
cycle_slug: owner-cabinet
project_doc: docs/PROJECT.md
status: Done
---

# Clinician Pending List

## Implementation Status
Status: Done

## Description
The patient workspace already has a queue of owner registrations. This issue makes that same area the pending list for visit requests as well. Each requested visit shows the proposed time, the questionnaire snapshot, and the attached files. Organization observers can read the area and cannot accept, confirm, or reject.

## Requirements
- The pending area stays on `/patients`, separate from the searchable patient list and from `/schedule`. It has two groups: «Регистрации» (the existing `RegistrationQueue` rows) and «Запросы визитов» (requests with status `requested` only).
- A visit row shows the animal name, the owner name, the visit-type label, the proposed start, every snapshot answer as the question label plus the owner's value, and each attached file with a download action. It does not show encounter text.
- An editor sees Confirm and Reject on a visit row, and Accept on a registration row, as today. Confirm asks for the real start and duration. When that registration is still pending, the same dialog also collects the existing create-or-link choice and animal matches, and submits them with the confirm body. When the registration is already accepted, the dialog asks only for start and duration. Reject asks for an optional reason.
- An organization observer sees both groups, including answers and files, and does not see Accept, Confirm, or Reject. `POST` confirm, reject, and accept still return 403 from the existing write checks.
- `scheduled`, `rejected`, `withdrawn`, `cancelled`, `completed`, and `no_show` requests are absent from this list. They do not appear on the day schedule unless a confirm already created an appointment.
- The list does not add a chat reply box. Observer chat remains read-only from the animal-chat issue.
- Russian UI. A failed confirm or reject shows the API message and leaves the row in place. An empty visit group says «Нет запросов, ожидающих подтверждения».

## Acceptance Criteria
- A `requested` visit appears in «Запросы визитов» with its proposed time, both questionnaire answers, and a working file download. It does not appear on `/schedule`.
- Confirm from this list, while the registration is pending, accepts the registration and creates the scheduled appointment. The row leaves the pending list and the visit appears on the day schedule at the time the clinician entered.
- Confirm of a request whose registration is already accepted asks only for start and duration and does not create a second client.
- Reject with a reason removes the row from the pending list, creates no appointment, and the owner sees the reason.
- An organization observer sees the registration and the visit, with answers and the file download, and sees no Accept, Confirm, or Reject.
- A withdrawn request is not in the visit group.

## Dependencies
- `docs/issues/owner-cabinet/visit-request.md` must be Done. Confirm, reject, the answer snapshot, and request files come from that API.
- `docs/issues/owner-cabinet/registration-acceptance.md` is Done. `frontend/src/components/owner/registration-queue.tsx` is the registration group to keep.
- Observer chat behavior is already implemented and is not changed here.

## Files Likely Touched
- `frontend/src/components/owner/registration-queue.tsx`
- `frontend/src/components/owner/visit-request-queue.tsx`
- `frontend/src/components/modules/patients.tsx`
- `frontend/src/lib/owner-api.ts`
- `frontend/src/lib/clinical-labels.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Add a staff client for `GET /visit-requests?status=requested`, confirm, reject, and request-file download. Map the four bookable types and the snapshot values to Russian labels. Render `binary` as «Да» or «Нет», `multi_select` as the selected labels, and `date` as `ДД.ММ.ГГГГ`.
- [x] Add `visit-request-queue.tsx` and render it on `/patients` directly under the existing registration queue, outside the patient search results. Poll on the same 30 second interval the registration queue already uses.
- [x] Implement Confirm and Reject when the visit row's `can_write` is true. Include the registration create-or-link controls in Confirm only when `registration_status` is `pending`. Hide Confirm and Reject when `can_write` is false. Keep hiding Accept on a registration row when that row's `can_accept` is false.
- [x] After a successful confirm, refresh the visit queue, the registration queue, and the patient search. Leave the row and show the error text when the call fails.
- [x] Note in `docs/PROJECT.md` that `/patients` has a pending area for registrations and unconfirmed visit requests, and that observers can read it without accepting or confirming.
- [x] Run the verification checks below.

## Verification
- As an editor, open `/patients` and confirm the new request shows the proposed time, both answers, and the file download, while `/schedule` for that day does not list it.
- Confirm it with a new client, a start, and a duration. Confirm the row is gone, the animals appear in patient search, and the day schedule shows the appointment at the entered time.
- Create a request for an already accepted animal and confirm the dialog has start and duration only. After confirm, the client count for that owner is unchanged.
- Reject another request with a reason and confirm it leaves the queue, stays off the schedule, and the owner cabinet shows the reason.
- As an organization observer, confirm both groups are visible, the file downloads, and Accept, Confirm, and Reject are absent.
- Withdraw a request as the owner and confirm the visit group no longer contains it.
- From `frontend/`, run `npm run check`.
## Verification Evidence (2026-10-28)
- Implemented `visit-request-queue.tsx` under the existing registration queue, outside patient search. Staff API calls preserve the existing confirmation/rejection/download contracts; the queue requests `status=requested` and also filters out other statuses before rendering.
- `npm exec vitest run src/components/owner/visit-request-queue.test.tsx src/components/owner/registration-queue.test.tsx src/components/owner/visit-request-form.test.tsx`: PASS, 12 tests. New coverage checks observer read/download and hidden write actions in both groups; binary/multi-select/date snapshot labels; all non-requested statuses hidden; pending create/link acceptance with every animal and unique matches; accepted confirmation without a registration payload; dependent query invalidation; reject with reason; API errors retain rows.
- `uv run pytest tests/test_visit_requests.py tests/test_owner_cabinet.py -q`: PASS, 24 tests on isolated persistence. Existing scenarios verify requested visits stay off the schedule; confirmation accepts and creates the entered appointment; accepted owners are not accepted twice; rejection reason is owner-visible and creates no appointment; observer confirm/reject/accept denial and file access; owner withdrawal removes the pending request.
- `npm run check`: PASS (TypeScript and ESLint). `git diff --check`: PASS.
- SKIP all six authenticated browser walkthroughs listed above (editor/schedule, pending confirmation and patient search, accepted-owner client count, rejection in the cabinet, observer controls/download, owner withdrawal). No live database-backed API or authenticated editor/owner/observer browser sessions were provisioned. Component interactions and isolated API persistence checks cover these behaviors separately; an integrated browser walkthrough, including narrow-screen rendering, remains to be run against a migrated PostgreSQL environment.
- All eight Owner Cabinet issue files now have status Done. Cycle #7 remains In Progress: the linked PRD's integrated browser acceptance and live PostgreSQL migration/concurrency evidence are still missing; issue statuses alone do not satisfy the cycle completion gate.
