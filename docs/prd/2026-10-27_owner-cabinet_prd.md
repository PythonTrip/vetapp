---
prd_id: 2026-10-27-owner-cabinet
cycle_id: 2026-10-27-owner-cabinet
cycle_slug: owner-cabinet
title: Owner Cabinet
created: 2026-10-27
filename: docs/prd/2026-10-27_owner-cabinet_prd.md
project_doc: docs/PROJECT.md
status: draft
scope_type: cycle
source: product-discovery
related_issue_batch: null
---

# PRD: Owner Cabinet

## Cycle Summary

Roadmap **#7**, stage **Pro**, status **⬜ Planned** while this PRD is a draft. Predecessor is the shipped clinician workbench (cycles #1–#6 and #8). This cycle does not depend on Specialty Depth. On 2026-10-27 Specialty Depth moved from #7 to **#9** so the owner cabinet is the next cycle. Approval of this PRD moves #7 to **📋 Defined**. It does not start implementation.

## Goal

A pet owner can join one doctor's practice, register their animals, talk with that practice, request a visit that includes the doctor's questionnaire and files, and download only the files the clinician chooses to share.

The clinician workspace remains the system of record. The owner never receives the clinical chart.

## Current Project Context

VetDietDerm today is a clinician workbench. Client (the owner) and Patient (the animal) are separate. A clinician creates both. The owner has no login.

- Schedule appointments are created by the clinician. Visit types are consultation, recheck, procedure, and telemedicine. Statuses are scheduled, completed, cancelled, and no_show.
- The patient gallery stores photos and PDFs on disk (8 MiB; JPEG, PNG, WebP, GIF, PDF). The owner cannot see it.
- Communications are a clinician log of calls and messages, not a conversation.
- Anamnesis and exam use a structured field catalog (yes/no, single choice, multiple choice, number, text, date). That catalog is not a pre-visit questionnaire.
- The patient passport already has name, species (`dog`, `cat`, `other`), breed, and birth date. It has no sex field. Weight, allergies, diagnoses, and feeding notes are clinical fields.
- Staff sign in through module-auth. A workspace is either the doctor's personal practice or one organization. Organization clinical records are visible to that organization. Observers can read clinical records and cannot change them.
- There is no owner cabinet, no join code, no visit questionnaire, and no payment.

## New Functionality

### Join the doctor

Each doctor has one stable join code for the workspace they are currently using, and a link that carries the same code.

- A personal-workspace code files the owner into that doctor's personal practice.
- An organization-workspace code files the owner into that organization. The owner still sees the doctor whose code they used, plus the organization name.
- The owner opens the link or types the code, then registers with name, email, phone, and password. Email and password are the later sign-in. This cycle does not send email.
- A valid code shows that doctor's name before the account exists. An invalid code does not reveal other doctors.
- This cycle binds the owner account to one doctor. A second doctor's code does not attach and does not switch the account.
- An email already used by a staff account cannot register an owner, and the reverse. One session kind never opens the other surface.

After joining, the owner sees their doctor immediately and can add animals. Chat and visit requests are available before the clinician accepts the registration.

### Animals

The owner registers animals themselves. Name and species are required. Breed, sex, and birth date are part of the passport. Sex is male, female, or unspecified. Species stays `dog`, `cat`, or `other`.

The owner can edit the passport: name, species, breed, sex, and birth date. The owner cannot edit weight, allergies, diagnoses, feeding notes, or any other clinical field, and cannot see those fields.

### Acceptance into the patient list

A new registration is a pending request. It does not appear in the main patient list or patient search.

The registration enters the main list in either of these ways:

- the clinician chooses **Accept**;
- the clinician confirms that owner's first visit request.

Accept covers the owner and every animal on that registration. An animal added after acceptance appears on the main patient list immediately. An animal added before acceptance stays on the pending registration.

On accept, the clinician either:

- creates a new client and patients in the code's workspace, or
- links the account to an existing client. Email does not match records by itself. The clinician can match each owner-registered animal to an existing patient of that client, or keep it as another patient of that client.

Until a link exists, the owner sees only animals they registered. After a link, the owner sees every animal on that client as a passport and can chat and request visits for each of them. Past encounters, diet plans, the communication log, and unshared files stay hidden.

The clinician can still create a client and patient without an owner account.

### Chat

One text thread per animal.

- The owner can write as soon as the animal exists, including before acceptance.
- In a personal workspace, only that doctor replies.
- In an organization, after acceptance every member can read the thread. Members who can edit clinical records can reply. Observers can read and cannot reply. The owner still experiences the thread as chat with their doctor.
- Before acceptance, the same people who can see the pending registration can read and, if they can edit, reply.
- The thread has no attachments, no edit, and no delete in this cycle.
- The existing communication log stays a separate clinician record.

There is no email, push, or SMS. The cabinet has no separate notification inbox. New messages are in the thread, and visit status is on the visit, when the owner opens the cabinet.

### Visit request

The owner requests a visit for one of their animals. They choose one of four types: primary, secondary, consultation, or supervision (курирование). Supervision is a bookable visit with its own questionnaire, not an ongoing care plan.

The owner proposes a date and time. They do not set the duration. The request does not occupy the clinician's day schedule.

If that doctor has published a questionnaire for the type, every question is required and the request cannot be sent without it. If no questionnaire is published, the request is sent without one. Answers stay on the request. They are not copied into the encounter. The clinician reads them on the visit while writing the encounter as they do today.

The owner may attach photos and documents on the request. The same rules as the gallery apply: 8 MiB; JPEG, PNG, WebP, GIF, or PDF.

The clinician confirms or rejects from the pending list:

- **Confirm** sets the real start and duration. The visit becomes scheduled and appears on the day schedule. Confirming the first visit also accepts the registration. The owner sees both the time they asked for and the time the clinician set.
- **Reject** leaves the visit off the day schedule. The clinician may add a short reason, which the owner sees.
- The owner may withdraw an unconfirmed request. It leaves the pending queue.
- The owner may cancel a scheduled visit. The clinician may cancel or reschedule as today. The owner sees the new time and cannot move the clock themselves.
- The owner sees completed and no-show only as status labels. Encounter text stays hidden.

### Files the owner can download

The owner can download a file only when the clinician explicitly marks it visible. The clinician can hide it again. The owner's own uploads stay visible to that owner and appear in the clinician gallery for that patient, marked as coming from the owner.

Linking an old client card does not open the old gallery. The clinician shares older files one by one if they should be visible.

### Questionnaire authoring

The inviting doctor keeps one published questionnaire per visit type. Only that doctor edits it. Questions use the same answer kinds as anamnesis: yes/no, single choice, multiple choice, number, text, and date. The questionnaire is not an encounter template and does not create a draft encounter.

Replacing a questionnaire does not change answers already submitted.

### Clinician pending list

The clinical workspace shows a pending area, separate from the main patient list, with:

- owner registrations waiting for acceptance;
- visit requests waiting for confirmation, including the proposed time, questionnaire answers, and attached files.

Organization observers can read this area and cannot accept, confirm, reject, or reply.

## Changed Existing Functionality

- New appointments, whether the owner requested them or the clinician created them, use only primary, secondary, consultation, and supervision. Existing recheck, procedure, and telemedicine rows stay visible with their current labels and are not choices for new visits.
- The animal passport gains sex (male, female, or unspecified), visible to the clinician and editable by the owner and the clinician.
- The patient workspace gains the per-animal chat beside the existing communication log, not instead of it.
- A gallery file gains an explicit owner-visibility switch. Unmarked files stay clinician-only. Owner uploads appear in that gallery.
- The clinician schedule's day list does not gain unconfirmed requests. Confirmed visits use the schedule that already exists.

## Product Architecture Impact

- Same web application. The owner area is a separate surface from the clinician navigation and must be usable on a phone-sized browser. No native app.
- Owner identity is a different access boundary from staff. Where the password is stored is an engineering validation, provided the two session kinds cannot open each other's surface. Staff accounts stay on module-auth.
- A pending registration is not a row in the main patient list. On acceptance it becomes a Client and Patients in the workspace that issued the code: personal rows stay with that doctor; organization rows follow the organization rules already used for clinical records.
- Chat is a per-patient thread. It is not a row in the communication log.
- Questionnaire answers and the owner's proposed time belong to the visit request. The encounter document is unchanged until a clinician writes it.
- Files stay on disk with the current size and type limits. No object-storage migration.
- No email provider and no payment provider in this cycle.

## Functional Nuances

- The cabinet is empty of chat and visits until the owner adds an animal. The doctor is visible immediately after join.
- Wrong or exhausted codes fail closed. This cycle does not rotate a code; a leaked code can only create a pending registration, which still needs acceptance or a confirmed visit.
- The owner can edit their name, email, and phone. After acceptance those are the client contact fields the clinician sees. The owner cannot edit clinical fields, cannot delete the clinical card, and cannot delete files.
- All questionnaire questions are required when a questionnaire is published. An empty published questionnaire is treated as no questionnaire.
- Already submitted answers remain as submitted if the doctor later changes the questionnaire.
- Owner uploads on a rejected or withdrawn request remain on that request for the clinician and for the owner.
- Reschedule, complete, and no-show stay clinician actions. Cancel of a scheduled visit is available to both sides. Only the clinician sets the confirmed clock time.
- Personal clinical records and organization clinical records stay isolated. A personal join code does not expose the owner to the doctor's organization.
- Russian UI, consistent with the clinician workspace.
- Observers remain read-only, including the pending list and chat.

## Data, Integrations, and Constraints

Plain-language records this cycle adds or extends:

- Owner account, bound to one doctor and one workspace, with name, email, phone, and password.
- Join code, one per doctor per workspace, also available as a link.
- Pending registration, holding the owner and animals until acceptance.
- Animal passport extended with sex.
- Chat message: animal, author, text, time.
- Visit questionnaire: one published set of questions per doctor per visit type.
- Visit request: animal, type, proposed date and time, confirmed start and duration, status, optional rejection reason, questionnaire answers.
- File visibility for the owner, on top of the existing gallery file.

Visit status from the owner's side: requested, scheduled, rejected, cancelled, completed, no-show. Requested and rejected stay off the day schedule.

External constraints:

- No new third-party service. No email, no SMS, no push, no payment, no object storage.
- Attachment limits stay 8 MiB and JPEG, PNG, WebP, GIF, PDF.
- Clinical isolation stays as it is today: personal workspace versus one organization, observers read-only, owner session unable to read other owners' animals.
- The owner does not see encounters, diagnoses, prescriptions, diet plans, nutrition, schedule of the clinic, settings, or other patients.

## Out of Scope for This Cycle

- Online payment and a manual paid/unpaid flag
- Email verification, password reset, and any email, SMS, or push notice
- Join-code rotation
- A second doctor or a second practice on the same owner account
- A clinic directory or a clinic-wide join code
- Automatic matching of clients or animals by email, phone, or name
- Copying questionnaire answers into the encounter
- Chat attachments, message edit, and message delete
- Owner delete of animals, clients, or files
- Showing encounter text, the full gallery, the communication log, or nutrition in the cabinet
- Native mobile apps
- A separate notification inbox
- Specialty Depth (#9): signed encounters, dose and fluid calculators, therapeutic nutrient profiles
- S3, English UI, and backup/restore

## Open Questions

- Whether owner credentials live in module-auth or in this application. The product rule is only that staff and owner sessions stay distinct.
- When email returns for verification, password reset, and visit or chat notices. Until then, a forgotten owner password cannot be recovered.
- When an owner account may join a second doctor.
- When a clinician can revoke a leaked join code.
- When visit payment is added. It is not required to confirm a visit in this cycle.
---
