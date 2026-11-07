---
source_prd: docs/prd/2026-11-07_booking-by-problem_prd.md
prd_id: 2026-11-07-booking-by-problem
cycle_id: 2026-11-07-booking-by-problem
cycle_slug: booking-by-problem
project_doc: docs/PROJECT.md
status: Done
---

# Charge After the Visit

## Implementation Status
Status: Done

## Description
After an appointment is conducted, the doctor enters one ruble amount and can later mark it paid. Conducted means appointment status `completed`. The owner cabinet shows that amount as due or paid and does not collect it. No amount means no debt.

## Requirements
- Add nullable `appointments.amount_rub` as `Numeric(12, 2)` and non-null `appointments.paid` boolean defaulting to false. Add check constraint `ck_appointments_charge`: `amount_rub` is null or greater than zero; `paid` is true only when `amount_rub` is not null; an unpaid amount exists only while `status = completed`.
- The Alembic revision chains from the single current head. Use revision id `visit_charge`. Do not reuse `0039_owner_problem_request` if that file exists. Do not rewrite existing appointments: they start with a null amount and `paid = false`.
- `AppointmentRead`, `AppointmentWrite`, and `AppointmentUpdate` expose `amount_rub` as a decimal with at most two fractional places and `paid` as a boolean. Responses serialize `amount_rub` with two fractional digits, for example `1500.50`, or null. Zero, a negative value, and more than two fractional digits return 422 `Сумма должна быть больше нуля` and store nothing.
- An amount can be saved only when the appointment status after the write is `completed`. Completing the encounter does not write a charge and does not change the appointment status. `scheduled`, `cancelled`, and `no_show` reject a new amount with 422 `Сумму указывают после проведения визита`.
- The same people who can already change an appointment (organization owner, admin, and member) can enter and change an unpaid amount and can mark it paid. A viewer can read the amount and paid state. Viewer writes already receive 403 `Роль наблюдателя разрешает только просмотр`; the schedule UI disables the amount field and the paid control for a viewer.
- While `paid` is false and status stays `completed`, a later patch may replace the amount with another value greater than zero. Marking `paid` true freezes the amount. A later amount change returns 422 `Оплаченная сумма не изменяется`. Sending `paid: false` after it is true returns 422 `Оплату нельзя отменить`. There is no partial amount and no refund path.
- Leaving `completed` while the amount is unpaid clears `amount_rub` to null and `paid` to false in that same update. A paid amount and `paid = true` stay stored if the status later changes. Cancel, rejection, withdrawal, and no-show do not create a charge. Deleting an appointment removes its charge with the row.
- The rule is the same for an owner-confirmed appointment and an appointment the doctor created on the schedule. The owner sees a charge only for a patient already linked to that owner's cabinet. An animal with no owner cabinet shows the charge only on the clinic schedule.
- `VisitRead` includes `amount_rub` and `paid` from the linked appointment. The owner visit card and the home consultation card show `К оплате: {amount} руб.` or `Оплачено: {amount} руб.` when `amount_rub` is not null, and show nothing about money when it is null. There is no pay button.
- A conducted direct appointment with a stored amount and no visit request is appended to that animal's owner visit list as a read-only row: no withdraw, cancel, or file actions. Its title is `Визит`, not a visit-type name. When the unpaid amount is cleared, that row disappears. A paid row remains after a later status change.
- An unpaid amount does not change owner request creation, chat send, or shared-file download. Saving a charge does not send a bot message, email, or push.
- The schedule day row shows the due or paid line when an amount exists. The appointment dialog accepts the amount only after status `completed`, then accepts the paid checkbox. The currency label is `руб.`.
- Update the payment sentence in `docs/PROJECT.md`: a conducted appointment can store one manual ruble amount that the clinic marks paid.

## Acceptance Criteria
- Patching a scheduled appointment to `completed` with `amount_rub` `1500.50` stores that amount, `paid` false, and the owner visit shows `К оплате: 1500.50 руб.`. Before the amount is saved, the owner response has `amount_rub: null` and no debt line.
- `0`, `-1`, and `10.999` are rejected. A second patch to `1600.00` while unpaid succeeds. A patch with `paid: true` then rejects both a new amount and `paid: false`.
- Moving that unpaid completed appointment to `cancelled` or `no_show` clears the amount, and the owner no longer sees a debt. Repeating the status change after the amount was paid keeps the amount and `Оплачено`.
- Rejecting or withdrawing a request, and cancelling a scheduled visit that was never completed, leaves every charge column empty. Completing the encounter while the appointment stays `scheduled` leaves `amount_rub` null.
- A viewer GET shows the amount and cannot PATCH it. An editor can. The schedule controls for the amount and paid state are disabled for the viewer.
- A doctor-created completed appointment with an amount and a linked owner animal appears in that animal's cabinet as `Визит` with the due or paid line and without withdraw, cancel, or file actions. The same appointment on a patient with no owner cabinet is visible only in the clinic schedule.
- With a due charge still stored, the owner can submit another visit request, send a chat message, and download a shared file.
- No request in this flow calls the Telegram bot or an email sender.

## Dependencies
None. The charge uses the existing appointment status `completed`, the existing viewer write ban in `require_clinical_access`, and the owner visit list. Alembic stays linear: chain this revision from the current head, which is `0038_clinic_invite_transfers` until `0039_owner_problem_request` lands. This issue does not wait for the owner form or the confirmation type to change.

## Files Likely Touched
- `apps/api/alembic/versions/` next `visit_charge` revision
- `apps/api/src/vetdietderm_api/appointments/models.py`
- `apps/api/src/vetdietderm_api/appointments/schemas.py`
- `apps/api/src/vetdietderm_api/appointments/repository.py`
- `apps/api/src/vetdietderm_api/visits/schemas.py`
- `apps/api/src/vetdietderm_api/visits/repository.py`
- `apps/clinic-web/src/features/appointments/components/schedule-board.tsx`
- `apps/clinic-web/src/features/appointments/api.ts`
- `packages/owner-features/src/components/visit-request-form.tsx`
- `apps/api/src/vetdietderm_api/encounters/repository.py`
- `apps/api/tests/test_visit_requests.py`
- `packages/api-contract/openapi.json`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Step 1: Read the current Alembic head and add one revision `visit_charge` that adds `amount_rub`, `paid`, and `ck_appointments_charge` without updating existing rows.
- [x] Step 2: Map the columns on `Appointment` and add the decimal and boolean fields to the appointment write, update, and read schemas. Reject non-positive amounts and more than two fractional digits.
- [x] Step 3: In `create_appointment` and `update_appointment`, allow an amount only when the resulting status is `completed`, freeze the amount after `paid` becomes true, reject marking a paid charge unpaid, and clear an unpaid amount when the status leaves `completed`. Leave encounter create and update untouched.
- [x] Step 4: Copy `amount_rub` and `paid` onto `VisitRead` from the linked appointment. In `owner_list`, append a read-only row for a charged appointment of that patient that has no visit request.
- [x] Step 5: Run `pnpm api:generate`.
- [x] Step 6: On the schedule dialog, show the ruble amount and `Оплачено` checkbox when the doctor sets status `completed`. Disable both controls for a viewer and after the stored charge is paid. Show the due or paid line on the day row when an amount exists.
- [x] Step 7: On the owner visit card and the home consultation card, show the due or paid line only when `amount_rub` is not null. Hide withdraw, cancel, and file actions on a read-only direct-appointment row. Do not add a pay button.
- [x] Step 8: Update the payment sentence in `docs/PROJECT.md`.
- [x] Step 9: Cover the charge transitions with the existing appointment and visit-request tests, then run Verification.

## Verification
- Complete an owner-linked appointment, save `1500.50`, change it while unpaid, mark it paid, and confirm the frozen-amount and cannot-unpay responses. Confirm the owner copy switches from `К оплате` to `Оплачено`.
- Clear an unpaid amount by leaving `completed`, and confirm a paid amount survives a later status change. Confirm reject, withdraw, scheduled cancel, and encounter completion create no charge.
- As a viewer, load the appointment and confirm the charge controls are disabled and a PATCH is 403. As a member, save the amount.
- Create a direct completed appointment with an amount for an owner-linked patient and for a patient without an owner. Confirm only the linked owner sees `Визит` and the debt line.
- With a due charge present, create another owner request, send a chat message, and download a shared file.
- Run `uv run --directory apps/api python -m py_compile src/vetdietderm_api/appointments/repository.py src/vetdietderm_api/visits/repository.py`.
- Run `pnpm api:check`.
- Run the updated charge cases in `apps/api/tests/test_visit_requests.py`.

## Review Repairs (2026-11-07)
- SPEC-1: Home consultation cards include charged completed visits alongside the active consultation; null amounts do not add a card.
- SPEC-2: Values above 9999999999.99 rubles return 422 before quantization or persistence.
- Verified: charge API regression tests (10 passed), owner visit UI tests (12 passed), owner-features and owner-web type checks, and git diff --check.
- API tests passed outside the sandbox after the sandboxed fixture stalled. Live browser verification was not run; the cycle remains In Progress.
