---
source_prd: docs/prd/2026-11-03_clinic-bot_prd.md
prd_id: 2026-11-03-clinic-bot
cycle_id: 2026-11-03-clinic-bot
cycle_slug: clinic-bot
project_doc: docs/PROJECT.md
status: Done
---

# The cabinet faces the clinic

## Implementation Status
Status: Done

## Description
The owner cabinet presents the clinic, not a chosen doctor. The clinic has one published questionnaire per bookable visit type. A visit request uses that list and does not ask for a doctor. Chat shows the name of the staff member who replied. Viewers can read the pending queues, files, and chat, and cannot accept, confirm, reject, or reply. The day schedule stays the clinic schedule.

## Requirements
- Add nullable `tenant_id` on `visit_questionnaires`. Enforce one published list per clinic per visit type with a partial unique index on `(tenant_id, visit_type)` where `tenant_id IS NOT NULL`, for `primary`, `secondary`, `consultation`, and `supervision`. Keep the existing unique `(doctor_user_id, visit_type)`. Keep `doctor_user_id` as the user who last saved the list.
- Alembic revision `0037_clinic_questionnaires`, chained to the single current head. If `0036_clinic_entry` is the head, use that as `down_revision`. If this issue lands first, use the current head and the next free revision id. Do not open a second head.
- On `GET /visit-questionnaires`, before listing, freeze each visit type once for the signed-in clinic. Load members with `GET /organizations/{org_id}/members`. Candidates are questionnaire rows whose `doctor_user_id` is one of those members. If an organization `owner` has a row for that visit type, keep the owner's row with the latest `updated_at`. If the owner has none, keep the candidate with the latest `updated_at`. Set the kept row's `tenant_id` to the clinic and delete the other candidates for that type. Questions cascade with the existing foreign key. Do not update `visit_requests.answers` or chat message text.
- This owner-first rule is the stand-in for "keep the administrator's list, otherwise the most recently saved list". A second GET finds the clinic row and does not delete or replace it.
- `GET /visit-questionnaires` stays available to `owner`, `admin`, `member`, and `viewer`. `PUT /visit-questionnaires/{visit_type}` is allowed only for `owner` and `admin`. Other roles receive `403`. Replacing a list, including an empty list, still does not create an encounter and does not change stored answer snapshots.
- Owner visit creation loads questions with `VisitQuestionnaire.tenant_id == owner.tenant_id` and the requested visit type. `VisitCreate` stays `visit_type`, `reason`, `proposed_starts_at`, and `answers`. Do not add a doctor field.
- The owner-facing practice title is the clinic name from the owner profile. Use it in `doctor-block.tsx` and the cabinet header. Do not present the inviting doctor's name as the practice name.
- In `chat/repository.py` `list_messages`, stop replacing a staff message's `author_label` with `JoinCode.doctor_label` for the owner view. Return the stored `author_label`. `add_message` already stores `display_name` or email for a staff sender. Leave existing rows unchanged.
- Roles that can edit clinical records (`owner`, `admin`, `member`) can reply in chat and can confirm or reject visit requests, including accepting a pending registration during confirm. `viewer` can read both pending groups, download request files, and read chat. `viewer` cannot accept a registration, confirm, reject, or reply. Keep those actions `403` and hide their controls in `registration-queue.tsx`, `visit-request-queue.tsx`, and the clinician animal chat.
- Do not add a doctor column to `schedule-board.tsx` or a doctor field to `AppointmentRead`. The day list continues to read `appointments` only, so a visit request remains off the schedule until confirmation creates the appointment.
- Shipped cabinet behavior stays: pending registration off the main patient list, acceptance by creating or linking a client, one text thread per animal, the four bookable visit types, file sharing only when the clinician marks a file visible, and no encounter text in the cabinet.

## Acceptance Criteria
- A clinic with two doctors who both saved a `primary` questionnaire ends with one `primary` list. The kept list is the organization owner's when the owner had one, otherwise the latest `updated_at`. The other `primary` questions are gone. Stored `visit_requests.answers` still contain the labels and values saved before the freeze.
- An `admin` can replace the clinic `consultation` list. A `member` and a `viewer` can read it and receive `403` on PUT. The owner request form has no doctor control and submits the clinic's questions.
- The cabinet header shows the clinic name.
- A staff reply is shown to the owner under that staff member's `display_name`. An older message still shows the `author_label` stored on the row.
- A `viewer` can open the registration queue, the visit-request queue, and chat, can download a request file, and cannot accept, confirm, reject, or send a chat reply. A `member` can confirm and can reply.
- The schedule day list has no doctor column. A visit request that has not been confirmed does not appear there.

## Dependencies
- `docs/issues/clinic-bot/doctor-is-a-clinic.md` so clinical reads use the clinic and organization roles are the editor and viewer gates.
- module-auth `GET /organizations/{org_id}/members` to identify the organization owner during the one-time questionnaire freeze.
- `clinic-entry` is not required to publish or answer questionnaires. If its Alembic revision is already the head, chain this revision after it.

## Files Likely Touched
- `apps/api/alembic/versions/0037_clinic_questionnaires.py`
- `apps/api/src/vetdietderm_api/questionnaires/models.py`
- `apps/api/src/vetdietderm_api/questionnaires/repository.py`
- `apps/api/src/vetdietderm_api/questionnaires/router.py`
- `apps/api/src/vetdietderm_api/visits/repository.py`
- `apps/api/src/vetdietderm_api/visits/schemas.py`
- `apps/api/src/vetdietderm_api/chat/repository.py`
- `apps/clinic-web/src/features/owner-cabinet/components/visit-questionnaire-editor.tsx`
- `apps/clinic-web/src/features/owner-cabinet/components/visit-request-queue.tsx`
- `apps/clinic-web/src/features/owner-cabinet/components/registration-queue.tsx`
- `apps/clinic-web/src/features/appointments/components/schedule-board.tsx`
- `packages/owner-features/src/components/doctor-block.tsx`
- `packages/owner-features/src/components/cabinet-home.tsx`
- `packages/owner-features/src/components/visit-request-form.tsx`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Step 1: Add nullable `tenant_id` to `VisitQuestionnaire` and the Alembic revision. Add a partial unique index on `(tenant_id, visit_type)` where `tenant_id IS NOT NULL`. Keep the existing unique `(doctor_user_id, visit_type)` so one doctor still cannot insert two lists of the same type before the freeze. Do not rewrite `visit_requests`. In the freeze, delete the rejected candidate rows first, then set `tenant_id` on the single kept row so the partial index never sees two rows for one clinic and visit type.
- [x] Step 2: Implement `freeze_clinic_questionnaires(session, clinic_id, members)` in `questionnaires/repository.py` with the owner-then-latest rule. Call it from `GET /visit-questionnaires` when any of the four visit types lacks a row for this `tenant_id`.
- [x] Step 3: Change `list_questionnaires` and `replace_questionnaire` to key off `request.state.tenant_id`. In the router, allow PUT only when `org_role` is `owner` or `admin`.
- [x] Step 4: In `visit-questionnaire-editor.tsx`, show the four lists to every clinical role and show the save controls only for `owner` and `admin`. Surface the `403` detail if a save is rejected.
- [x] Step 5: Change `visits/repository.py` `questions` to load by `owner.tenant_id` and visit type. Confirm `VisitCreate` still has no doctor field and `visit-request-form.tsx` does not add one.
- [x] Step 6: In `list_messages`, return the stored staff `author_label` to the owner. Do not rewrite `chat_messages` rows.
- [x] Step 7: Show `organization_name` as the practice title in `doctor-block.tsx` and `cabinet-home.tsx`.
- [x] Step 8: Confirm viewer controls stay hidden and their API calls stay `403` for accept, confirm, reject, and chat reply. Do not add a doctor column to `schedule-board.tsx`.
- [x] Step 9: Update the `docs/PROJECT.md` questionnaire and chat bullets so a list belongs to the clinic and the owner sees the replying staff member's stored name.
- [x] Step 10: Walk through the Verification checks.

## Verification
- Prepare two questionnaire rows for `primary` in one clinic, one owned by the organization owner and an older one by another doctor. Open settings as the owner and confirm only the owner's questions remain. Read a visit request saved before that GET and confirm its `answers` JSON is unchanged.
- As a `member`, open the questionnaire editor, confirm there is no save control, and confirm PUT returns `403`. As an `admin`, save an empty `supervision` list and confirm previously submitted supervision answers are unchanged.
- As an owner, submit a visit from the animal card. Confirm the form asks for visit type, time, and the clinic questions, and the payload has no doctor id.
- Reply in chat as a `member` whose `display_name` differs from the clinic name. Confirm the owner sees that display name. Confirm a pre-existing message still shows its stored label.
- As a `viewer`, download a request file and confirm accept, confirm, reject, and chat reply are unavailable and return `403`. As a `member`, confirm a request and confirm it then appears on the schedule. Confirm the schedule still has no doctor column and the request was absent before confirmation.
- Run `pnpm lint` and `pnpm typecheck` from the repository root.
