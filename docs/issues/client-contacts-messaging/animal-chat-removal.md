---
source_prd: docs/prd/2026-11-27_client-contacts-messaging_prd.md
prd_id: 2026-11-27-client-contacts-messaging
cycle_id: 2026-11-27-client-contacts-messaging
cycle_slug: client-contacts-messaging
project_doc: docs/PROJECT.md
status: Not Started
complexity: M
criticality: High
---

# Animal Chat Removal

## Implementation Status
Status: Not Started

## Description
The per-animal chat leaves the patient card and the registration queue. The chat API and its file routes leave with it. Historical `chat_threads`, `chat_messages`, and `owner_uploads` stay as the migration source and archive. The registration queue still accepts and rejects registrations. No new messaging page is added.

## Requirements
- Remove these routes and their `/v1/staff` aliases: `GET` and `POST /patients/{patient_id}/chat`, `GET` and `POST /owner-registrations/{registration_id}/animals/{owner_animal_id}/chat`, `GET /patients/{patient_id}/chat/files/{file_id}`, and `GET /owner-registrations/{registration_id}/animals/{animal_id}/chat/files/{file_id}`.
- Remove the chat router from `LEGACY_SELF_SCOPED_ROUTERS` and from `create_v1_router`. Delete `chat/router.py`, `chat/service.py`, and `chat/schemas.py` when nothing else imports them.
- Keep `chat/models.py` and the `orm.py` import. Keep `chat/repository.py` functions that `owners/registrations.py` and `visits/service.py` still call, including `link_thread` and `owner_target`. Acceptance may still link an owner-animal thread to a patient so the migration source stays connected.
- Do not drop `chat_threads`, `chat_messages`, or `owner_uploads`. Do not add an Alembic revision in this issue.
- Remove `PatientChat` from the patient card. Remove `AnimalChat` from `registration-queue.tsx`. Delete `patient-chat.tsx`, `animal-chat.tsx`, and `animal-chat.test.tsx` when nothing imports them.
- Leave accept and reject on the registration queue. Leave `CommunicationLog` and the communications API in place when `docs/issues/client-contacts-messaging/communications-journal-removal.md` has not removed them.
- Update `apps/clinic-web/src/app/_components/patients.test.tsx` so the patient card does not expect the chat text `Чат:`. Update `apps/api/tests/integration/test_v1_api.py` so it does not special-case the removed chat file path.
- Do not add navigation, search, a patient-card messaging action, or a new page.
- In `docs/PROJECT.md` Current Functionality, replace the sentence that staff read and write a text conversation on the patient tab and in the registration queue. State that the chat API and those two surfaces are gone, and that `chat_threads`, `chat_messages`, and `owner_uploads` remain.

## Acceptance Criteria
- The patient card does not render a chat transcript or a chat composer.
- A registration row on `/patients` does not render a chat. Accept and reject still submit.
- The six chat paths above are absent from OpenAPI, including `/v1/staff`.
- Tables `chat_threads`, `chat_messages`, and `owner_uploads` still exist. Accepting a registration still runs `link_thread` when an owner animal is matched to a patient.
- Visit confirmation still imports `owner_target` and completes for a stored visit request.

## Dependencies
- None

## Files Likely Touched
- `apps/api/src/vetdietderm_api/chat/router.py`
- `apps/api/src/vetdietderm_api/chat/service.py`
- `apps/api/src/vetdietderm_api/chat/schemas.py`
- `apps/api/src/vetdietderm_api/chat/repository.py`
- `apps/api/src/vetdietderm_api/routing.py`
- `apps/api/src/vetdietderm_api/v1.py`
- `apps/api/src/vetdietderm_api/owners/registrations.py`
- `apps/api/tests/integration/test_v1_api.py`
- `apps/clinic-web/src/app/_components/patients.tsx`
- `apps/clinic-web/src/app/_components/patients.test.tsx`
- `apps/clinic-web/src/features/owner-cabinet/components/registration-queue.tsx`
- `apps/clinic-web/src/features/owner-cabinet/components/patient-chat.tsx`
- `apps/clinic-web/src/features/owner-cabinet/components/animal-chat.tsx`
- `apps/clinic-web/src/features/owner-cabinet/components/animal-chat.test.tsx`
- `packages/api-contract/openapi.json`
- `packages/api-contract/src/generated.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [ ] Remove the chat HTTP routes and the router mounts in `routing.py` and `v1.py`. Keep models, `link_thread`, and `owner_target`.
- [ ] Remove `PatientChat` from the patient card and `AnimalChat` from the registration queue. Delete the unused chat components and `animal-chat.test.tsx`.
- [ ] Update `patients.test.tsx` and `test_v1_api.py` for the removed chat surface.
- [ ] Replace the staff-chat sentence in `docs/PROJECT.md` Current Functionality.
- [ ] Run `pnpm api:generate` and the checks in Verification.

## Verification
- `uv run --project apps/api python -c "from vetdietderm_api.main import app; from vetdietderm_api.chat.repository import link_thread, owner_target"` imports.
- Confirm `app.openapi()` has no path ending in `/chat` or `/chat/files/{file_id}`.
- Open `/patients`, open a registration row, and confirm there is no chat composer and the accept control is still present.
- Open a patient card and confirm there is no chat transcript.
- In PostgreSQL, confirm `to_regclass('chat_threads')`, `to_regclass('chat_messages')`, and `to_regclass('owner_uploads')` are not null.
- `pnpm api:check` passes after `pnpm api:generate`.
