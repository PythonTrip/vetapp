---
prd_id: 2026-11-07-booking-by-problem
cycle_id: 2026-11-07-booking-by-problem
cycle_slug: booking-by-problem
title: Booking by Problem
created: 2026-11-07
filename: docs/prd/2026-11-07_booking-by-problem_prd.md
project_doc: docs/PROJECT.md
status: draft
scope_type: cycle
source: product-discovery
related_issue_batch: null
---

# PRD: Booking by Problem

## Cycle Summary

Roadmap **#10**, stage **Pro**, status **⬜ Planned**. Predecessor is Clinic Bot (#9), closed on the shipped clinic door. Specialty Depth moved from #10 to **#11** and stays later. This draft does not start implementation.

## Goal

An owner asks for a visit by describing the problem. They do not choose a visit type or a specialty. The clinic still has a questionnaire, and every answer is optional. The doctor classifies the visit when confirming it. After the appointment is conducted, the doctor enters one amount in rubles and later marks it paid.

## Current Project Context

Clinic Bot (#9) is shipped. A clinic, including a solo doctor, has one bot and one link. The owner cabinet, chat, visit request, and shared files belong to that clinic.

The owner request currently asks for a pet, one of four visit types (`primary`, `secondary`, `consultation`, `supervision`), every question on that type's list, a proposed time, and optional files. There is no specialty choice on that form. Dermatology, nutrition, or general is chosen later on the encounter. The request can store a problem text, but the form does not ask for it, and a new request must answer every published question for the chosen type.

The clinic settings edit four questionnaires, one per bookable visit type. Staff confirm a request with a real start and duration. The day schedule still requires a visit type. A doctor who creates a slot themselves also chooses that type. Appointment status and the encounter record are separate. Completing one does not complete the other.

No payment exists. Cancel, reject, withdrawal, and no-show do not create a charge because nothing does.

## New Functionality

### The owner describes the problem

A new owner request is the pet, a required problem text, the proposed time, optional files, and the optional clinic questionnaire.

The problem text is required and limited to 4000 characters. The owner cannot submit a blank problem. They do not choose a visit type or a specialty.

The clinic has one questionnaire. In settings, an administrator edits that one list. Owner and admin replace it. A member and a viewer can read it. Replacing the list, including with an empty list, does not create an encounter and does not change answers already submitted.

The owner may leave any question blank and may submit the request with no answers. The stored snapshot keeps only the questions they answered, with the question id, label, kind, value, and select options at submission.

The owner sees the problem text as the label of the request. They do not see a visit-type name in place of that text.

Already submitted requests keep their stored type, answers, and files. This cycle does not rewrite them.

If the clinic still has several lists, the owner list is the `primary` questionnaire when that list exists. Otherwise it is the most recently saved list. An equal timestamp keeps the greater questionnaire id. The other lists are not shown and cannot be edited. They are not used for a new request.

### The doctor classifies the visit

The request stays off the day schedule until staff confirm a real start and duration. Confirmation also requires a bookable visit type. That type is the doctor's classification for the schedule. The owner is not asked to confirm it, and the cabinet does not present it as the request title.

Specialty stays on the encounter. The owner request does not gain a specialty field.

When an encounter is first created from the linked appointment, an empty complaint is filled with the problem text. Text the doctor has already written is left as written. The doctor can change the complaint afterward.

A doctor who creates an appointment directly in the schedule still chooses the visit type there. This cycle does not remove that control. Those appointments have no owner problem text unless one is already stored on a linked request.

### Payment after the visit

A charge exists only after the doctor marks the appointment conducted and enters one amount. Conducted means the appointment status `completed`. Completing the encounter does not create a charge.

The amount is in rubles, with kopecks, and is greater than zero. Until an amount is saved, the owner sees no debt. The same people who can change the appointment can enter and change the amount. Viewers can read it and cannot change it.

The amount can be changed while it is unpaid. Marking it paid freezes the amount. This cycle has no partial payment and no refund.

Cancel, rejection, withdrawal, and no-show do not create a charge. If a conducted appointment leaves `completed` while the amount is still unpaid, the unpaid amount is cleared and the owner no longer sees a debt. A paid amount stays recorded and frozen if the appointment status changes later.

The same charge rule applies to an appointment the doctor created directly. If that animal has an owner cabinet, the owner sees the amount there. If it does not, only the clinic sees the charge.

The owner sees the amount as due or paid on that visit. The cabinet does not take payment. An unpaid amount does not block another request, chat, or shared files. No bot message, email, or push is sent.

## Changed Existing Functionality

- The owner booking form no longer asks for a visit type. The required problem text replaces that choice.
- New owner requests no longer need an answer for every published question. Empty and partial questionnaires are valid.
- Clinic settings edit one questionnaire, not four lists by visit type.
- The owner's request label is the problem text. Staff still store a visit type once they confirm the request.
- A new request has no visit type until confirmation. The schedule's type control for a doctor-created appointment stays.
- The first empty encounter complaint opened from the linked appointment receives the problem text.
- A conducted appointment can carry one manual ruble charge. Nothing in the current product can.

Confirmation, registration acceptance, file rules, and the separation between appointment status and encounter status stay as they are except for the charge rules above.

## Product Architecture Impact

- The owner request is identified by the pet, the problem text, the proposed time, and an optional answer snapshot. Visit type is a staff scheduling field set at confirmation.
- The clinic publishes one questionnaire. Older per-type lists are not a second owner path.
- The charge is one amount on the conducted appointment. The clinic record is the source of truth. The owner cabinet shows due or paid and cannot change either.
- No payment provider, price catalog, or notification channel is added.

## Functional Nuances

- A problem that is only whitespace is empty and is rejected.
- The questionnaire step remains visible. Skipping it is allowed.
- Historical answer snapshots stay immutable when the clinic list is replaced or reduced to one list.
- The owner does not see the visit type the doctor assigns. The day schedule still shows it to staff.
- Complaint prefill runs only when the encounter complaint is empty.
- A zero amount is not a charge. Clearing an unpaid amount returns the visit to "no debt".
- Paid is final in this cycle. Staff cannot mark it unpaid and cannot edit the frozen amount.
- Observers stay read-only on the queue, the questionnaire, and the charge.
- Russian UI stays. The currency label is rubles.

## Data, Integrations, and Constraints

Records this cycle changes:

- Owner request: required problem text; visit type absent until staff confirmation; answer snapshot may be empty or partial.
- Clinic questionnaire: one published list per clinic. The kept list is `primary`, else the newest saved list, with the existing id tie-break.
- Visit charge: one ruble amount and unpaid or paid state on a conducted appointment. No amount means no charge.

No new external service is added. Staff and owner sessions remain unable to open each other's surface. Attachment limits stay 8 MiB and JPEG, PNG, WebP, GIF, or PDF.

## Out of Scope for This Cycle

- Online acquiring, a payment link, or an owner pay button
- A price list, several line items, partial payment, or a refund workflow
- A no-show fee, and any charge for cancel, rejection, or withdrawal
- Prepayment or a deposit at booking
- Bot, email, or push notices about the amount
- Blocking a new request, chat, or files because a charge is unpaid
- Removing the visit type from doctor-created schedule appointments
- Asking the owner for a specialty
- Specialty Depth (#11)
- Changes to FEDIAF assessment, the Food catalog, or encounter signing

## Open Questions

- None for this cycle. A later refund workflow for a paid appointment that is cancelled or reopened is intentionally out of scope.
---
