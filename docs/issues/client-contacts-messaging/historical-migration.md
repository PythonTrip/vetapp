---
source_prd: docs/prd/2026-11-27_client-contacts-messaging_prd.md
prd_id: 2026-11-27-client-contacts-messaging
cycle_id: 2026-11-27-client-contacts-messaging
cycle_slug: client-contacts-messaging
project_doc: docs/PROJECT.md
status: Done
complexity: L
criticality: High
---

# Historical Migration

## Implementation Status
Status: Done

## Description
Reliable Owner Cabinet chat history lands in one contact and one conversation. All threads of that owner become that single conversation. Migrated messages keep their time, direction, author, attachments, and Patient tag. They are not sent to Telegram, and running the migration again does not duplicate them.

## Requirements
- Add an Alembic data revision chained from the current head. `upgrade` calls `migrate_owner_cabinet_chats(session)`. `downgrade` deletes only rows this migration inserted: messages with a non-null `source_chat_message_uuid`, conversations and contacts that those messages required and that have no `origin` `telegram` message. Do not drop `chat_threads`, `chat_messages`, `owner_uploads`, or `owner_telegram_identities`.
- Select `owner_telegram_identities` rows whose `tenant_id` is not null and whose `telegram_user_id` parses as a positive bigint. The private chat id is that user id. Skip identities with a null clinic. Skip a chat thread whose owner has no such identity. Do not invent a Telegram id. Do not merge Clients by name.
- Create the contact with `open_contact`. Profile name and username may be null. `local_name` follows the contact rule from the user id when no profile name is available. All `chat_threads` for that owner account, through `owner_animals` and patients already linked from those animals, become one conversation.
- Copy each `chat_messages` row. `source_chat_message_uuid` is the source message uuid. `origin` is `owner_cabinet`. `channel` is `telegram`. `occurred_at` is the source `created_at`. Owner `author_kind` becomes `direction` `inbound`. Staff `author_kind` becomes `direction` `outbound`. Copy `author_id` into `author_user_id` and `author_label` as stored. Leave `bot_id`, `telegram_message_id`, and `delivery_status` null. Do not call Telegram.
- When the source thread has a `patient_uuid`, set that Patient tag. A thread with no Patient leaves `patient_uuid` null.
- Copy one chat file from `owner_uploads` where `message_uuid` is the source message and `kind` is `chat`. Use the earliest `created_at`, then `uuid`. If that file is JPEG, PNG, WebP, GIF, or PDF and `byte_size` is at most 8 MiB, store its existing `storage_key`, content type, and byte size on the new message. Do not copy bytes and do not insert a gallery `attachments` row. Any other chat file, or a further chat file on the same source message, sets `unsupported_attachment` true and does not get its own conversation message. Assumption: the new model holds one file, so extra uploads remain only on `owner_uploads`.
- Copy `body` from the source message.
- Link `clinic_contacts.client_uuid` only when the owner's accepted `owner_registrations` row has one `client_uuid` and every non-null Patient on the migrated threads belongs to that Client. Threads with a null Patient do not conflict. A second distinct Client leaves `client_uuid` null. Messages, files, dates, direction, authors, and Patient tags are still written. Do not append a `clinic_contact_link_events` row for this link. The audit table records staff actions only.
- A second run finds the same `source_chat_message_uuid` and inserts no second contact, conversation, message, or attachment. A contact that already exists from a real Telegram user id is reused, not duplicated.
- Identities that were skipped stay in `owner_telegram_identities`. Source chat rows stay in place.
- In `docs/PROJECT.md`, state that Owner Cabinet chat rows are copied into the clinic conversation, are not forwarded to Telegram, and the source tables remain.

## Acceptance Criteria
- One identity with two animal threads becomes one contact and one conversation. Each source message exists once, with the original time and the mapped direction.
- A staff source message is `outbound` with null `delivery_status`. An owner source message is `inbound`. Neither has a Telegram message id.
- A thread Patient is stored on those messages. If the accepted registration has one `client_uuid` and every tagged Patient belongs to it, the contact is linked. If two threads point at Patients of two Clients, the contact stays unlinked and the tags are still stored.
- An allowed `owner_uploads` chat file is referenced by the same `storage_key`. A second upload on that message does not create a second conversation message. No gallery `attachments` row is added. No Telegram method is called.
- An identity with null `tenant_id`, and a thread with no identity, produce no contact.
- Running `migrate_owner_cabinet_chats` twice leaves the contact, conversation, and message counts unchanged.

## Dependencies
- `docs/issues/client-contacts-messaging/contact-and-conversation.md`
- `docs/issues/client-contacts-messaging/inbound-message-intake.md`
- `docs/issues/client-contacts-messaging/message-content-and-attachments.md`
- `docs/issues/client-contacts-messaging/patient-tag.md`
- Existing `owner_telegram_identities`, `owner_registrations`, `chat_threads`, `chat_messages`, and `owner_uploads`.

## Files Likely Touched
- `apps/api/alembic/versions/`
- `apps/api/src/vetdietderm_api/messaging/migrate_owner_chats.py`
- `apps/api/src/vetdietderm_api/messaging/repository.py`
- `apps/api/src/vetdietderm_api/owners/models.py`
- `apps/api/src/vetdietderm_api/chat/models.py`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Add `migrate_owner_cabinet_chats` with the identity filter, one conversation per identity, and source-message deduplication.
- [x] Copy direction, time, author, body, one allowed file, and the thread Patient tag. Leave delivery status and Telegram message id null.
- [x] Apply the single-Client link rule without writing a link-audit event and without updating Client or Patient rows.
- [x] Call the function from the Alembic `upgrade`. Limit `downgrade` to rows this migration created.
- [x] Add the PROJECT.md sentence and run the checks in Verification.

## Verification
- Build a fixture with one clinic identity, two threads, one owner message, one staff message, one allowed chat upload, and one accepted registration whose Patients all share one `client_uuid`. Run the migration. Confirm one contact, one conversation, two messages, the shared storage key, the Patient tags, and the Client link.
- Add a second Patient that belongs to another Client and run on a fresh copy. Confirm the contact's `client_uuid` is null and both messages still exist with their tags.
- Confirm `delivery_status` is null, `telegram_message_id` is null, and the source tables still contain the original rows.
- Run the function again and confirm the row counts do not change.
- Confirm an identity with null `tenant_id` does not gain a contact.
- `uv run --project apps/api python -c "from vetdietderm_api.messaging.migrate_owner_chats import migrate_owner_cabinet_chats"` imports.
