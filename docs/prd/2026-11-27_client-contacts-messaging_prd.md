---
prd_id: 2026-11-27-client-contacts-messaging
cycle_id: 2026-11-27-client-contacts-messaging
cycle_slug: client-contacts-messaging
title: Client Contacts and Messaging Domain
created: 2026-11-27
filename: docs/prd/2026-11-27_client-contacts-messaging_prd.md
project_doc: docs/PROJECT.md
status: draft
scope_type: cycle
source: product-discovery
related_issue_batch: null
---

# PRD: Client Contacts and Messaging Domain

## Cycle Summary

Roadmap **#13**, stage **Pro**, status **⬜ Planned** while this PRD is a draft. Predecessor is Telegram Bot Gateway (#12), closed 2026-11-26. Clinic Messaging Interface (#14) follows and is the staff workspace. Specialty Depth moved to #15.

This cycle replaces owner-account communication with a clinic-scoped contact and one conversation per contact. It delivers the domain model, the staff and inbound API, migration of reliable Owner Cabinet history, and durable Telegram delivery. It does not add a messaging screen.

## Goal

A private message to the clinic bot creates one contact and one conversation for that clinic. Staff with the existing write roles can link the contact to a Client, create a Client, tag a message with a Patient, and send a reply that Telegram accepts once. Reliable Owner Cabinet history lands in that conversation. The phone-and-email journal and the per-animal chat leave the product.

## Current Project Context

The clinician workspace is the system of record. Owner sign-in is gone. Each clinic has one bot. Private `message` and `edited_message` updates are stored in `telegram_updates` and marked transport-complete. That mark is not business consumption.

Staff still have two older communication surfaces. The patient tab «Коммуникации» shows a manual journal (`communications`: phone, email, text, video, in person, with an optional follow-up) and a text chat, one thread per patient. The registration queue embeds the same kind of chat, one thread per owner animal. Messages there are immutable text up to 4000 characters. Chat files use `owner_uploads`. Journal and chat routes exist on the staff API and on the additive `/v1` staff aliases.

`owner_telegram_identities` stores a clinic and a Telegram user id for an owner account. It does not store a chat id. For a private chat with a bot, the chat id equals the user id. One owner can have several animal threads. Accepted registrations may already point at a `client_uuid`. Viewers are read-only. Members, admins, and organization owners can write chat and create clients. Bot credentials stay limited to organization owners and admins.

## New Functionality

### Contact and conversation

A clinic contact is the external Telegram person. The clinic is its tenant. Telegram user id and chat id are assigned by inbound Telegram data and stay immutable for staff. The Telegram profile name and username update from later inbound user payloads. The local name is set once at creation from the profile name. When the profile has no name, the local name falls back to the username, then to the user id. Later profile updates do not change the local name. A write-role staff member can change the local name.

A contact has at most one Client. A Client may have many contacts. The first private message to the clinic bot creates the contact and exactly one conversation. `/start` and a message without text count. A Client and a Patient are not created by that message.

PostgreSQL enforces one contact per clinic and Telegram user id, one contact per clinic and chat id, and one conversation per contact in a clinic.

### Inbound message intake

Business processing consumes stored private updates after transport completion. Transport completion stays distinguishable from business consumption. Processing the same update again does not create a second message.

Each new private Telegram message creates one conversation message. Redelivery of an update does not create a duplicate. External-message uniqueness is the combination of `bot_id`, `chat_id`, and `message_id`, enforced by PostgreSQL.

An `edited_message` updates the existing message with that identity. The stored message changes only when the incoming version is newer. Newer is the Telegram `edit_date`, then the update id. When an edit arrives before the original message, the message is created from the edit. A later original for the same identity is older and leaves the stored message as it is.

The stored message keeps direction, the Telegram timestamp, the channel `telegram`, the external identity, and the raw fact of a later edit. Inbound messages do not receive a Patient.

### Message content and attachments

A message may contain text, one image, or one PDF. An image or PDF may also carry a caption. Files use the existing attachment store: 8 MiB, JPEG, PNG, WebP, GIF, and PDF. A chat file is not a gallery lesion and is not copied onto the patient gallery.

Any other inbound attachment still creates the message. The message shows a marker that a file arrived, and the file itself is not stored. A message with neither text nor a stored file is still kept when Telegram delivered an unsupported attachment or a service message such as `/start`.

Staff cannot edit or delete a stored message. A staff send is text, one allowed file, or both. A send with neither text nor a file is rejected.

### Patient tag

A message has at most one Patient. Write-role staff can set or clear that tag on an inbound or outbound message. A new tag is allowed only for a Patient of the contact's current Client, in the same clinic. An unlinked contact rejects a new tag.

Unlink and relink keep existing tags on the messages. A retained tag stays visible as that message's historical Patient. It is not a current link to the new Client's patients. It cannot be chosen again unless that Patient belongs to the contact's current Client. It does not make the contact a contact of the old Client.

### Client link and audit

Write-role staff can link an unlinked contact to an existing Client in the same clinic, move a linked contact to another Client in that clinic, or clear the link. They can also create a Client from the contact. Creation follows the current Client rules, with the local contact name as the initial name, and creates no Patient. The new Client becomes the contact's Client.

Link changes do not modify the Client record beyond that creation, do not modify Patients, and do not change message history.

Every link change appends an immutable audit record: the staff member, the time, the previous Client, and the new Client. Either Client may be absent. Anyone who can read the conversation, including a viewer, can read that contact's audit. This cycle has no clinic-wide audit screen and no clinic-wide audit feed.

### Outbound delivery

An outbound message is stored before the Telegram call. The staff author is the signed-in user id and the staff display label. A repeated request for the same outbound action returns the existing message and does not insert another. Retry of a failed message continues that same record. A new composition is a new message.

Delivery status is one of:

- **Queued.** Stored, not yet accepted by Telegram.
- **Sent.** Telegram accepted the message and returned a message id. This is not a read receipt.
- **Failed.** Telegram, or the local preconditions, definitely rejected the send.
- **Unconfirmed.** The request may have reached Telegram, and the result was not stored. A worker that stops after the request is sent and before the result is saved leaves the message unconfirmed.

Automatic retry happens only when the request definitely was not accepted, including a failure before the request was sent and a Telegram response that asks for `retry_after`. The next automatic attempt waits at least `retry_after` when Telegram provides it. The number of automatic attempts is bounded. The bound is an engineering choice inside that rule. After the bound, the message is failed.

Ambiguous network loss and ambiguous server errors do not send the message again. Unconfirmed messages are not automatically retried, and the API does not resend that same record. A later new message is a separate record.

The API accepts a send only after this contact has an inbound private message to the clinic's current bot. A stored Telegram user id is not enough. Migrated Owner Cabinet messages do not count. An inbound message to a previous bot does not count.

Disconnecting and later connecting the same bot keeps queued messages for that bot, and they may be sent after it is connected again. Replacing the clinic bot with a different Telegram bot marks still-queued messages failed and does not send them through the new bot. Sent and unconfirmed messages keep their status across replacement.

### Historical migration

Migration creates a contact only for an `owner_telegram_identities` row with a clinic and a Telegram user id. The private chat id is that user id. All chat threads of that owner become one conversation. Each migrated message keeps its original time, direction, available author id and label, and attachments. An owner message is inbound. A staff message is outbound. When the source thread is tied to a Patient, the message keeps that Patient tag.

The contact is linked to a Client only when the accepted registration has one `client_uuid` and every Patient on the migrated threads belongs to that same Client. Threads with no Patient do not conflict. Any second Client leaves the contact unlinked. Messages, attachments, dates, direction, authors, and historical Patient tags still migrate.

Migrated messages are marked as Owner Cabinet origin. They have no Telegram message id and no delivery status. They are exempt from external-message uniqueness and are deduplicated by the source message identity. Running the migration again does not create a second contact, conversation, message, or attachment.

Identities without a clinic, and chats with no Telegram identity, stay in the existing tables. No contact is invented for them. Clients are not merged by name. Migrated text is not sent to Telegram. A later staff reply is a new outbound message and is sent only when the current-bot inbound rule allows it.

Original Owner Cabinet rows, including `chat_threads`, `chat_messages`, and `owner_uploads`, remain after migration. The new message uses the existing stored file.

## Changed Existing Functionality

### Communications journal removal

The patient tab «Коммуникации», the manual journal, and follow-up on that journal are removed. The communications API is removed, including `/patients/{patient_id}/communications`, `/communications/{communication_id}`, and the additive `/v1` staff aliases. Stored `communications` rows are deleted with the table. Nothing in this cycle replaces follow-up.

### Animal chat removal

The per-animal chat is removed from the patient card and from the registration queue. The chat API is removed, including patient chat, registration-animal chat, their file routes, and the additive `/v1` staff aliases. The registration queue still accepts and rejects registrations. It no longer embeds a chat. Historical chat tables remain as the migration source and archive. No new messaging page, navigation item, search, filter, or patient-card action is added.

### Gateway updates become business messages

Stored private updates remain available after a bot disconnect. This cycle's processing selects updates that are transport-complete and not yet consumed as conversation messages. A transport retry does not hide them and does not duplicate the conversation message. Group, channel, and other non-private updates stay outside the conversation, as the gateway already acknowledges them without storing them.

## Product Architecture Impact

All contacts, conversations, messages, attachments, and Client and Patient associations are isolated to one clinic. Isolation and access rights are enforced on the server. Uniqueness of contacts, conversations, and external messages is enforced by PostgreSQL constraints. Cross-clinic associations are forbidden.

The work stays in the existing FastAPI process and PostgreSQL. Inbound business processing and outbound delivery use a durable PostgreSQL-backed worker in that process. Restart leaves an unfinished send unconfirmed when the Telegram request may already have been made, and leaves an unsent queued message eligible again. There is no new broker, cache, or object store.

The existing on-disk attachment store holds chat images and PDFs. Gallery metadata is a separate record. OpenAPI remains the staff contract. This cycle adds no clinic-web screen. Removing the journal and the animal chat is deletion of those surfaces, not a new workspace.

Telegram methods for this cycle are the send calls for text, a photo, and a PDF document. Bot credential management stays the gateway cycle. Tokens and webhook secrets stay out of logs, API error bodies, and stored delivery errors.

## Functional Nuances

- Viewers can read contacts, conversations, messages, attachments, and link audit. Members, admins, and organization owners can also send, retry a failed message, edit the local name, set or clear a Patient tag, link, unlink, relink, and create a Client. The observer write rejection stays the current read-only behavior.
- Organization owner and admin remain the only roles that connect, replace, verify, or disconnect a bot.
- A Patient tag, a Client link, and a created Client are always inside the contact's clinic. A foreign clinic's Client or Patient is rejected.
- Historical Patient tags survive relink. New tags consult only the current Client.
- Staff message text is not edited in place. Telegram edits of an inbound message update that one record when the edit is newer.
- Sent means Telegram accepted the message. It does not mean the person read it. Per-staff read state is not stored in this cycle.
- The same-record retry exists for failed messages only. Unconfirmed is terminal for that record.
- Queued messages survive a disconnect of the same bot. A different bot id fails them and does not inherit them.
- Migration is idempotent and does not invent Telegram ids, delivery statuses, Clients, or Patients.

## Data, Integrations, and Constraints

- PostgreSQL is the source of truth for contacts, conversations, messages, link audit, delivery status, and business consumption of `telegram_updates`.
- External message identity is `bot_id` + `chat_id` + `message_id`. Owner Cabinet messages keep a source-message identity instead.
- Contact identity is the clinic plus Telegram user id, and the clinic plus chat id.
- File bytes stay on the existing attachment disk. The 8 MiB limit and the JPEG, PNG, WebP, GIF, and PDF allow-list are unchanged.
- The current clinic bot is the bot id stored for that clinic. Send permission follows inbound messages to that bot id.
- `communications` is removed. `chat_threads`, `chat_messages`, `owner_uploads`, and `owner_telegram_identities` stay.
- No new payment, email, or booking integration.

## Out of Scope for This Cycle

- The staff messaging workspace: navigation, search, filters, opening a conversation from a patient card, choosing among several contacts in the UI, per-staff read state, and a conversation that updates without a full reload. Those belong to Clinic Messaging Interface (#14).
- Visit notices, chat notices, and booking inside Telegram.
- Group chats, channel posts, command menus, Mini Apps, and inline keyboards.
- Creating a Patient from a contact or from a message.
- Merging Clients, forwarding historical messages to Telegram, and treating a known user id as permission to send.
- Other channels than Telegram.
- Copying chat files into the lesion gallery.
- A clinic-wide audit console.
- A replacement for journal follow-up.
- Staff editing or deleting messages.
- Dropping the retained Owner Cabinet chat tables.

## Open Questions

- The numeric cap on automatic delivery attempts is an engineering choice. The product rule is fixed: only definite non-acceptance is retried, `retry_after` is honored, and the cap is finite.

## Execution Slices

| Slice | Issues | Depends on | Why this cut |
| --- | --- | --- | --- |
| slice-1 | `docs/issues/client-contacts-messaging/animal-chat-removal.md`, `docs/issues/client-contacts-messaging/communications-journal-removal.md`, `docs/issues/client-contacts-messaging/contact-and-conversation.md`, `docs/issues/client-contacts-messaging/gateway-updates-business-messages.md` | None | Cut at the dependency-wave boundary before client-link-and-audit, which depends on contact-and-conversation in this slice. |
| slice-2 | `docs/issues/client-contacts-messaging/client-link-and-audit.md`, `docs/issues/client-contacts-messaging/inbound-message-intake.md` | slice-1 | Cut before message-content-and-attachments because it depends on inbound-message-intake already in this slice. |
| slice-3 | `docs/issues/client-contacts-messaging/message-content-and-attachments.md`, `docs/issues/client-contacts-messaging/patient-tag.md` | slice-2 | Cut before historical-migration because it depends on message-content-and-attachments and patient-tag in this slice. |
| slice-4 | `docs/issues/client-contacts-messaging/historical-migration.md`, `docs/issues/client-contacts-messaging/outbound-delivery.md` | slice-3 | This last wave is separate because both issues depend on message content finished in the previous slice. |
