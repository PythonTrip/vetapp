---
source_prd: docs/prd/2026-11-27_client-contacts-messaging_prd.md
prd_id: 2026-11-27-client-contacts-messaging
cycle_id: 2026-11-27-client-contacts-messaging
cycle_slug: client-contacts-messaging
project_doc: docs/PROJECT.md
status: Not Started
complexity: L
criticality: Blocker
---

# Contact and Conversation

## Implementation Status
Status: Not Started

## Description
A private person who reaches the clinic bot becomes one clinic contact with exactly one conversation. The Telegram user id and chat id are assigned from inbound data and stay immutable. Staff with a write role can change only the local name. This issue does not create messages, send to Telegram, or add a messaging screen.

## Requirements
- Add Alembic revision whose `down_revision` is the current head. Create `clinic_contacts` and `clinic_conversations`. Do not drop or alter `communications`, `chat_threads`, `chat_messages`, `owner_uploads`, or `owner_telegram_identities`.
- `clinic_contacts` columns: `uuid` UUID primary key (UUIDv6), `clinic_id` UUID not null, `telegram_user_id` bigint not null, `telegram_chat_id` bigint not null, `profile_name` text null, `username` text null, `local_name` text not null, `client_uuid` UUID null foreign key to `clients.uuid` ON DELETE RESTRICT, `created_at` and `updated_at` timestamptz not null. Unique constraints: `(clinic_id, telegram_user_id)` and `(clinic_id, telegram_chat_id)`.
- `clinic_conversations` columns: `uuid` UUID primary key, `clinic_id` UUID not null, `contact_uuid` UUID not null foreign key to `clinic_contacts.uuid` ON DELETE CASCADE, `created_at` timestamptz not null. Unique `(clinic_id, contact_uuid)`.
- These tables are not `TenantOwned`. The business worker has no request session. Every staff query filters `clinic_id` to `request.state.tenant_id`. A row for another clinic returns 404 with detail `Запись не найдена`.
- Repository function `open_contact(session, clinic_id, telegram_user_id, telegram_chat_id, profile_name, username)` inserts the contact and its one conversation, or returns the existing pair. On insert, `local_name` is the stripped profile name, else the stripped username, else the decimal user id. On an existing contact, update `profile_name` and `username` from the new payload and do not change `local_name`, `telegram_user_id`, `telegram_chat_id`, or `client_uuid`. A second call does not insert a second contact or a second conversation.
- Staff cannot set Telegram ids. `PATCH` accepts only `local_name` with stripped length at least 1. A viewer receives the existing 403 `Роль наблюдателя разрешает только просмотр`. Members, admins, and organization owners can patch.
- `GET /contacts` returns the signed-in clinic's contacts ordered by `created_at`, then `uuid`. This cycle has no search, filter, or paging query. Assumption: the list is the whole clinic, because search belongs to cycle #14.
- `GET /contacts/{contact_id}` returns `uuid`, `clinic_id`, both Telegram ids, `profile_name`, `username`, `local_name`, `client_uuid`, `conversation_uuid`, `created_at`, and `updated_at`.
- Opening a contact does not insert a `clients` row or a `patients` row.
- Register the models in `orm.py`. Mount the router on the clinical app and on the additive `/v1/staff` surface through the existing clinical router list, with `require_clinical_access`.
- In `docs/PROJECT.md` Known Decisions, add that a clinic contact stores an immutable Telegram user id and chat id, a staff-editable local name, and at most one Client, with one conversation per contact. Do not describe message delivery or the removed journal in that sentence.

## Acceptance Criteria
- Two calls to `open_contact` with the same clinic and Telegram user id return one contact uuid and one conversation uuid. The second call can change `profile_name` and `username` and leaves `local_name` unchanged.
- Inserting a second contact with the same clinic and chat id, or the same clinic and user id, fails on the PostgreSQL unique constraint.
- A contact created with profile name `Анна`, username `anna`, and user id `42` has `local_name` `Анна`. With an empty profile name and username `anna`, `local_name` is `anna`. With neither name, `local_name` is `42`.
- `GET /contacts/{id}` for a contact in another clinic returns 404. A viewer `PATCH` returns 403. A member `PATCH` of `local_name` to `Новое имя` persists that name and leaves both Telegram ids unchanged.
- `open_contact` leaves the `clients` and `patients` row counts unchanged.
- `GET /v1/staff/contacts` returns the same contact list as `GET /contacts` for the same session.

## Dependencies
- Existing clinic tenancy (`request.state.tenant_id`), `clients.uuid`, and staff roles in `require_clinical_access`.
- Alembic head at implementation time. This issue adds the next revision and does not edit an older revision.

## Files Likely Touched
- `apps/api/alembic/versions/`
- `apps/api/src/vetdietderm_api/messaging/models.py`
- `apps/api/src/vetdietderm_api/messaging/repository.py`
- `apps/api/src/vetdietderm_api/messaging/schemas.py`
- `apps/api/src/vetdietderm_api/messaging/router.py`
- `apps/api/src/vetdietderm_api/orm.py`
- `apps/api/src/vetdietderm_api/routing.py`
- `packages/api-contract/openapi.json`
- `packages/api-contract/src/generated.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [ ] Add the Alembic revision and the SQLAlchemy models for `clinic_contacts` and `clinic_conversations` with the constraints in Requirements.
- [ ] Implement `open_contact` with the local-name rule and the profile-update rule. Create the conversation in the same transaction as a new contact.
- [ ] Add `GET /contacts`, `GET /contacts/{contact_id}`, and `PATCH /contacts/{contact_id}` using `request.state.tenant_id` and `request.state.user`. Reject a blank `local_name`.
- [ ] Register the models in `load_models` and include the router from `include_clinical_and_versioned_routes` so `/v1/staff` aliases the same handlers.
- [ ] Add the Known Decisions sentence in `docs/PROJECT.md`.
- [ ] Run `pnpm api:generate` and the checks in Verification.

## Verification
- `uv run --project apps/api python -c "from vetdietderm_api.main import app"` imports.
- Apply the revision to a development database. Insert through `open_contact` twice and confirm one row in `clinic_contacts` and one row in `clinic_conversations`. Confirm a duplicate `(clinic_id, telegram_user_id)` insert raises `IntegrityError`.
- Call `PATCH /contacts/{id}` as a viewer and confirm HTTP 403. Call it as a member with `{"local_name": "Новое имя"}` and confirm the stored Telegram ids are unchanged.
- Call `GET /contacts/{id}` with a session whose `tenant_id` is a different clinic and confirm HTTP 404.
- `pnpm api:check` passes after `pnpm api:generate`.
