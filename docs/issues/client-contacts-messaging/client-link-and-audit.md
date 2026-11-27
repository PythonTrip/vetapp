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

# Client Link and Audit

## Implementation Status
Status: Not Started

## Description
Write-role staff link a contact to a Client in the same clinic, move that link, clear it, or create a Client from the contact. Every change appends an immutable audit record. Link changes do not rewrite the Client, Patients, or message history. There is no clinic-wide audit screen.

## Requirements
- Add `clinic_contact_link_events` in a new Alembic revision chained from the current head. Columns: `uuid` UUID primary key, `clinic_id` UUID not null, `contact_uuid` UUID not null foreign key to `clinic_contacts.uuid` ON DELETE CASCADE, `actor_user_id` UUID not null, `actor_label` text not null, `previous_client_uuid` UUID null, `new_client_uuid` UUID null, `created_at` timestamptz not null. No update or delete route.
- `actor_label` is `request.state.user["display_name"]` when that string is non-empty, otherwise `request.state.user["email"]`. `actor_user_id` is `request.state.user["user_id"]`.
- `PUT /contacts/{contact_id}/client` body is `{ "client_uuid": uuid | null }`. The contact must belong to the signed-in clinic. A non-null `client_uuid` must be a `clients` row whose `tenant_id` is that same clinic. Otherwise return 404 `Запись не найдена`.
- The same route links an unlinked contact, moves a linked contact to another Client, or clears the link when `client_uuid` is null. It does not update the Client's name, email, or phone. It does not update Patients. It does not update `conversation_messages` when that table exists.
- `POST /contacts/{contact_id}/client` creates one Client through `patients.repository.create_client` with `ClientCreate` name equal to the contact's current `local_name` and null email and phone. It creates no Patient. The new Client's `tenant_id` is the contact's clinic. That Client becomes `clinic_contacts.client_uuid` in the same transaction.
- Each successful link, move, clear, or create appends one event with the previous and new Client ids. Either id may be null. A request that sets the same Client the contact already has returns the contact and does not append an event.
- `GET /contacts/{contact_id}/link-events` returns that contact's events ordered by `created_at`, then `uuid`. Viewers can read. Viewers receive 403 on `PUT` and `POST`. Another clinic returns 404.
- Mount both routes on the clinical router so `/v1/staff` serves the same handlers. Do not add a clinic-web page or a clinic-wide audit feed.
- In `docs/PROJECT.md`, state that contact link changes append an immutable per-contact audit and that this cycle has no clinic-wide audit screen.

## Acceptance Criteria
- A member links an unlinked contact to a same-clinic Client. `client_uuid` updates, one event stores a null previous Client and that new Client, and the Client row's name, email, and phone are unchanged.
- A member moves the contact to a second Client in the clinic. One new event stores both ids. Messages that already exist keep their columns.
- A member clears the link. `client_uuid` is null and the event stores the previous Client and a null new Client.
- `POST /contacts/{id}/client` creates one Client named with `local_name`, creates no Patient, and links the contact. A viewer `POST` returns 403.
- A Client from another clinic returns 404 and writes no event. `GET /contacts/{id}/link-events` as a viewer returns the events. A second `PUT` of the current Client does not add an event.

## Dependencies
- `docs/issues/client-contacts-messaging/contact-and-conversation.md`
- Existing `patients.repository.create_client` and `ClientCreate`.

## Files Likely Touched
- `apps/api/alembic/versions/`
- `apps/api/src/vetdietderm_api/messaging/audit.py`
- `apps/api/src/vetdietderm_api/messaging/router.py`
- `apps/api/src/vetdietderm_api/messaging/schemas.py`
- `apps/api/src/vetdietderm_api/orm.py`
- `apps/api/src/vetdietderm_api/patients/repository.py`
- `docs/PROJECT.md`
- `packages/api-contract/openapi.json`
- `packages/api-contract/src/generated.ts`

## Implementation Steps
- [ ] Add the audit table, model, and append-only repository. Put the model in `messaging/audit.py` so the message model file stays with intake.
- [ ] Add `PUT /contacts/{contact_id}/client` for link, move, and clear, with the same-clinic check and the no-op when the Client is unchanged.
- [ ] Add `POST /contacts/{contact_id}/client` using `create_client` and no `create_patient`. Append the audit row in the same transaction.
- [ ] Add `GET /contacts/{contact_id}/link-events` for every clinical reader, including viewers.
- [ ] Add the PROJECT.md sentence, run `pnpm api:generate`, and run the checks in Verification.

## Verification
- `uv run --project apps/api python -c "from vetdietderm_api.main import app"` imports.
- As a member, `PUT` a same-clinic Client and confirm one audit row and an unchanged Client name. `PUT` null and confirm `client_uuid` is null and a second event exists.
- `POST /contacts/{id}/client` and confirm one new `clients` row, zero new `patients` rows, and the contact's `client_uuid` set to that client.
- `PUT` a Client whose `tenant_id` differs and confirm HTTP 404 and no new audit row.
- As a viewer, `GET` link events returns 200 and `PUT` returns 403.
- `pnpm api:check` passes.
