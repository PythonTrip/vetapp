---
source_prd: docs/prd/2026-10-27_owner-cabinet_prd.md
prd_id: 2026-10-27-owner-cabinet
cycle_id: 2026-10-27-owner-cabinet
cycle_slug: owner-cabinet
project_doc: docs/PROJECT.md
status: Done
---

# Animal Chat

## Implementation Status
Status: Done

## Description
Each animal has one text thread. The owner can write as soon as the animal exists, including before the clinician accepts the registration. In a personal practice only the inviting doctor replies. In an organization, editors may reply and observers may only read. The thread stays next to the communication log and never becomes a row in it.

## Requirements
- One thread per animal. Messages store the animal reference, the author, the text, and the time. Text is required, trimmed, and at most 4000 characters. This cycle has no attachments, no edit, and no delete.
- Before acceptance, the thread is keyed by `owner_animals.uuid`. The owner reads and writes it with the id returned by `GET /owner/animals`. The clinician reads and writes it from the pending registration queue.
- `accept_registration` keeps the existing messages. After it sets `owner_animals.patient_uuid`, that same thread is also addressable by the patient id. The owner's later `GET /owner/animals` uses patient ids, and those ids open the same messages.
- An animal added after acceptance, and any other patient already on the linked client, gets its own thread on the first message. A patient the owner cannot see returns 404.
- In a personal workspace, only the inviting doctor (`join_codes.doctor_user_id`) can read and reply. Another staff account receives 403 on a registration thread and does not see that patient's thread through tenancy.
- In an organization, after acceptance every member can read the patient thread. Roles `owner`, `admin`, and `member` can reply. An observer can read and cannot reply: the reply control is hidden, and `POST` returns 403 `Роль наблюдателя разрешает только просмотр`.
- Before acceptance, the same people who can see that pending registration can read the thread. A reply uses the same write rule as `authorize_registration(..., write=True)`.
- The owner sees their own messages as their own. Messages from any staff member are shown to the owner under the inviting doctor's label from the owner profile. The clinician sees owner messages as «Владелец» and staff messages under the sender's `display_name`, otherwise the staff email, stored at send time.
- Posting a chat message does not insert a `communications` row. The patient tab «Коммуникации» keeps `CommunicationLog` and adds the thread beside it. On a narrow viewport the log and the thread stack.
- There is no email, push, SMS, or notification inbox. New messages appear when the owner or clinician opens the thread.
- The owner cabinet shows the thread on each animal card, in one column usable at 390px. An owner with no animals still sees only the doctor and the empty animal state.
- A staff `vetapp_session` cannot call the owner chat routes. An owner `vetapp_owner_session` cannot call the clinician chat routes. Another owner's animal id returns 404.
- Russian UI. Message text is rendered as plain text.

## Acceptance Criteria
- An owner adds an animal before acceptance and sends a message. The inviting doctor sees that message on the pending registration, replies, and the owner sees the reply under the doctor's name.
- After accept, the same messages are on the patient tab «Коммуникации» next to the existing communication log, and the owner sees them on the patient id now returned for that animal. The communication log has no new row.
- An organization observer opens the thread and cannot send. An organization member sends a reply. The owner still sees that reply under the inviting doctor's name, while the clinician sees the member's stored label.
- A second doctor cannot read or reply to a personal-practice thread.
- A message of only spaces is rejected. A message longer than 4000 characters is rejected. No control edits or deletes a sent message.
- An animal added by the owner after acceptance has its own empty thread, and a message there does not appear on another animal.
- The owner cabinet at 390px shows the thread without the clinician navigation.

## Dependencies
- `docs/issues/owner-cabinet/owner-animals.md` is Done. Pending animals and `GET /owner/animals` exist.
- `docs/issues/owner-cabinet/registration-acceptance.md` is Done. `accept_registration` in `apps/api/src/vetdietderm_api/owners/repository.py` sets `owner_animals.patient_uuid` and `owner_registrations.client_uuid`. `authorize_registration` decides who may see or change a registration.
- Visit requests, questionnaires, and file sharing are separate issues. This issue does not add them.

## Files Likely Touched
- `apps/api/alembic/versions/0026_animal_chat.py`
- `apps/api/src/vetdietderm_api/chat/models.py`
- `apps/api/src/vetdietderm_api/chat/schemas.py`
- `apps/api/src/vetdietderm_api/chat/repository.py`
- `apps/api/src/vetdietderm_api/chat/router.py`
- `apps/api/src/vetdietderm_api/owners/repository.py`
- `apps/api/src/vetdietderm_api/owners/router.py`
- `apps/api/src/vetdietderm_api/main.py`
- `frontend/src/components/owner/animal-chat.tsx`
- `frontend/src/components/owner/animal-list.tsx`
- `frontend/src/components/owner/registration-queue.tsx`
- `frontend/src/components/modules/patient-detail.tsx`
- `frontend/src/lib/owner-api.ts`
- `frontend/src/lib/api-client.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Add the next Alembic revision after `0025_registration_acceptance`. If a later revision is already the head, set `down_revision` to that head instead of creating a second head. Create `chat_threads` with `uuid`, nullable unique `owner_animal_uuid` foreign key to `owner_animals.uuid` `ON DELETE CASCADE`, nullable unique `patient_uuid` foreign key to `patients.uuid` `ON DELETE CASCADE`, and `created_at`. Create `chat_messages` with `uuid`, `thread_uuid` foreign key `ON DELETE CASCADE`, `author_kind` (`owner` or `staff`), `author_id`, `author_label`, `body`, and `created_at`. Index messages by `(thread_uuid, created_at, uuid)`. These tables are not `TenantOwned`; access is checked in the repository.
- [x] Add `list_messages` and `add_message`. Resolve an owner call by the signed-in owner: a pending `OwnerAnimal` on their registration, or a `Patient` on the linked client. Resolve a clinician call either by `patient_uuid` inside the current workspace tenancy or by `owner_animal_uuid` on a registration that passes `authorize_registration`. Create the thread on the first message. Reject a blank body and a body longer than 4000 characters. Store the staff label from the current profile. Return messages oldest first.
- [x] Add owner routes `GET` and `POST /owner/animals/{animal_id}/chat` on the existing owner session. Add clinician routes `GET` and `POST /patients/{patient_id}/chat` and `GET` and `POST /owner-registrations/{registration_id}/animals/{owner_animal_id}/chat` behind `require_clinical_access`. Do not add patch or delete routes.
- [x] In `accept_registration`, after `owner_animals.patient_uuid` is set, write that patient id onto the thread row for that `owner_animal_uuid` when the thread exists.
- [x] On each animal in `animal-list.tsx`, show the thread, a text field, and a send button. Show an empty thread as «Сообщений пока нет». Show a load or send error with `ownerError` and keep the typed text. Render bodies as text.
- [x] On each pending animal in `registration-queue.tsx`, show the same thread. Hide the reply box when `can_accept` is false. On the patient «Коммуникации» tab, render `CommunicationLog` and this thread together.
- [x] Note in `docs/PROJECT.md` that each animal has a chat thread separate from the communication log, including before acceptance.
- [x] Run the verification checks below.

## Verification
- Before acceptance, send a message as the owner and reply as the inviting doctor from the registration queue. Confirm both sides see both messages and `communications` is unchanged.
- Accept the registration and confirm the same messages open on the patient «Коммуникации» tab and on the owner's animal, whose id is now the patient id.
- As an organization observer, open the thread and confirm the reply action is absent and `POST` returns 403. As a member, reply and confirm the owner sees the inviting doctor's name while the clinician sees the member's stored label.
- Sign in as another doctor in a personal workspace and confirm the thread is not available.
- Submit an empty message and a 4001-character message and confirm both are rejected. Confirm the UI has no edit or delete action.
- Add a second animal after acceptance, send one message, and confirm it is absent from the first animal's thread.
- From `frontend/`, run `npm run check`. From `apps/api/`, run `uv run python -c "from vetdietderm_api.main import app"`.
## Implementation Evidence
- Added migration `0026_animal_chat` after the single current head `0025_registration_acceptance`, explicit repository authorization, all six GET/POST routes, and shared owner/registration/patient chat UI.
- Acceptance preserves the pending thread UUID and messages. Matching a patient that already has a chat merges both histories into that same thread. Registration/patient row locks serialize thread creation and acceptance; PostgreSQL unique constraints enforce one thread per reference.
- PASS: `uv run --offline --no-sync python -m pytest tests/test_animal_chat.py tests/test_owner_cabinet.py tests/test_multi_user_auth.py -q` — 25 tests. Covers before/after acceptance, unchanged communications, owner/staff session boundaries, other-owner 404, second-doctor denial, organization observer/member rules, stored/fallback labels, validation, separate animals, and existing-patient matching. Windows sandbox blocks TestClient socketpair; these tests passed outside the sandbox.
- PASS: `npm run test -- src/components/owner` — 9 tests, including chat plain-text rendering, own-message labels, retained failed drafts, retry, observer controls and member controls. TEMP/TMP were pointed into the workspace because sandbox temporary-cache rename failed.
- PASS: `npm run check`; `uv run --offline --no-sync python -c "from vetdietderm_api.main import app"`; `alembic heads` (single head); offline upgrade and downgrade SQL for 0026; `git diff --check`.
- SKIP live PostgreSQL upgrade/downgrade and concurrent first-send/acceptance: configured PostgreSQL is unreachable, including outside the sandbox. Offline SQL and isolated persistence/API scenarios passed. Downgrade drops the chat tables and therefore discards chat history; export/backup chat data before rollback.
- SKIP live browser owner/doctor/observer walkthrough and 390px visual inspection: no reachable database-backed API. UI tests and direct layout inspection passed; the owner layout is one column, long message bodies wrap, and the patient log/chat grid stacks below xl. Repeat the browser checks after applying 0026 to a reachable database.
- Owner Cabinet remains In Progress: other PRD workflows are still pending.
