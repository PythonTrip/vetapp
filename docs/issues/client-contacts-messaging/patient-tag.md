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

# Patient Tag

## Implementation Status
Status: Not Started

## Description
A conversation message has at most one Patient. Write-role staff can set or clear that tag on an inbound or outbound message. A new tag is allowed only for a Patient of the contact's current Client, in the same clinic. An existing tag remains after the contact is linked to someone else, and it is not a current link to the new Client's patients.

## Requirements
- Add nullable `patient_uuid` on `conversation_messages` in a new Alembic revision chained from the current head. Foreign key to `patients.uuid` ON DELETE RESTRICT. Inbound intake must keep leaving this column null.
- `PATCH /messages/{message_id}` accepts only `{ "patient_uuid": uuid | null }`. It does not change `body`, attachment columns, direction, or delivery columns. There is still no route to edit or delete the message body.
- The message must belong to the signed-in clinic. A new non-null tag is stored only when the contact's `client_uuid` is not null and the Patient's `client_uuid` is that Client and the Patient's `tenant_id` is the contact's `clinic_id`. Otherwise return 422 with detail `Пациент не относится к текущему клиенту контакта`. A missing message or a message in another clinic returns 404.
- Clearing the tag sets `patient_uuid` null. Viewers receive 403. Members, admins, and organization owners can patch.
- `PUT /contacts/{contact_id}/client` and `POST /contacts/{contact_id}/client` from the client-link issue must not change `patient_uuid` on existing messages. This issue checks that those writes still leave message tags untouched. Do not make a retained tag authorize a later new tag for a Patient of the previous Client.
- Message reads include `patient_uuid` and `patient_current`. `patient_current` is true only when `patient_uuid` is not null and that Patient belongs to the contact's current Client. A retained tag stays visible with `patient_current` false. It does not change `clinic_contacts.client_uuid`.
- A tag cannot be chosen again after unlink unless that Patient belongs to the contact's current Client. The read model does not offer a separate list of old Patients.
- In `docs/PROJECT.md`, state that a message has at most one Patient tag, a new tag follows the contact's current Client, and a retained tag survives relink.

## Acceptance Criteria
- A member sets a Patient of the linked Client on an inbound message and on an outbound message. A second Patient is not stored on the same message; the patch replaces the one tag.
- An unlinked contact returns 422 for a new tag. A Patient of another Client, or a Patient in another clinic, returns 422. A viewer patch returns 403.
- After the contact is moved to another Client, the message still has the old `patient_uuid`, `patient_current` is false, and the contact's `client_uuid` is the new Client.
- Clearing the tag sets `patient_uuid` null. Patching the old Patient back, while the contact points at the new Client, returns 422.
- Inbound processing of a new private update still stores `patient_uuid` null.
- `PATCH` does not change `body`.

## Dependencies
- `docs/issues/client-contacts-messaging/contact-and-conversation.md`
- `docs/issues/client-contacts-messaging/inbound-message-intake.md`
- `docs/issues/client-contacts-messaging/client-link-and-audit.md` for the link and relink writes that must leave tags in place.
- Existing `patients.client_uuid` and `patients.tenant_id`.

## Files Likely Touched
- `apps/api/alembic/versions/`
- `apps/api/src/vetdietderm_api/messaging/models.py`
- `apps/api/src/vetdietderm_api/messaging/router.py`
- `apps/api/src/vetdietderm_api/messaging/schemas.py`
- `apps/api/src/vetdietderm_api/messaging/repository.py`
- `docs/PROJECT.md`
- `packages/api-contract/openapi.json`
- `packages/api-contract/src/generated.ts`

## Implementation Steps
- [ ] Add `patient_uuid` with ON DELETE RESTRICT. Leave inbound insert values null.
- [ ] Add `PATCH /messages/{message_id}` that updates only `patient_uuid` under the current-Client rule.
- [ ] Add `patient_current` on the message read schema. Confirm client link and client create do not assign or clear message tags.
- [ ] Add the PROJECT.md sentence, run `pnpm api:generate`, and run the checks in Verification.

## Verification
- Link a contact, `PATCH` a message to one Patient of that Client, and confirm one stored `patient_uuid`. `PATCH` a different field is impossible because the schema has only `patient_uuid`.
- `PATCH` a Patient while `client_uuid` is null and confirm HTTP 422. `PATCH` as a viewer and confirm HTTP 403.
- Move the contact with `PUT /contacts/{id}/client` and confirm the message `patient_uuid` is unchanged and `patient_current` is false.
- `PATCH` `patient_uuid` null and confirm the column is null. Process one new inbound update and confirm its `patient_uuid` is null.
- `pnpm api:check` passes.
