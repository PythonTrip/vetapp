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

# Message Content and Attachments

## Implementation Status
Status: Not Started

## Description
A conversation message can hold text, one image, or one PDF. An image or PDF can also hold a caption. Any other inbound file still creates the message, shows that a file arrived, and does not store the file. Staff cannot edit or delete a stored message. A staff send with neither text nor a file is rejected.

## Requirements
- Add nullable attachment columns on `conversation_messages` in a new Alembic revision chained from the current head: `attachment_storage_key` text, `attachment_content_type` text, `attachment_byte_size` bigint, and `unsupported_attachment` boolean not null default false. Do not insert a row into the gallery `attachments` table.
- Store bytes only through `vetdietderm_api.attachments.storage`. The limit is `MAX_ATTACHMENT_BYTES` (8 MiB). The allow-list is JPEG, PNG, WebP, GIF, and PDF, checked by the same signatures as `owners/uploads.py`. The storage key is the file name returned by `write_bytes`.
- Extend the inbound processor from `docs/issues/client-contacts-messaging/inbound-message-intake.md` before it sets `business_consumed_at`. Apply file changes only when that issue's version compare accepts the update.
- Inbound text stays in `body`. A caption on an allowed image or PDF is `body`. One message stores one file. For a Telegram photo, choose the largest size whose file size is known and within 8 MiB. A document is stored only when Telegram reports `application/pdf` and the bytes match PDF. Download with `getFile` using the bot token for that update's `bot_id`, through a URL builder that rejects any host other than `api.telegram.org`. Do not log the URL, the token, or the webhook secret.
- When the inbound payload has a file that is not an allowed image or PDF, or the allowed file is larger than 8 MiB, fails the signature check, or cannot be downloaded, set `unsupported_attachment` true and leave `attachment_storage_key` null. Still keep the message, including a message with null `body`. A message that is only `/start` or another service update with no file keeps `unsupported_attachment` false.
- A newer accepted edit may replace `body` and the stored file. Delete the previous storage file when the key changes. An older update must not replace the file. Do not copy the file into the patient gallery.
- `GET /messages/{message_id}/file` returns the stored bytes with the stored content type for a message in the signed-in clinic. Viewers can read. No stored key returns 404. Another clinic returns 404.
- There is no `PATCH` or `DELETE` for message text or the file. Patient tag changes stay in `docs/issues/client-contacts-messaging/patient-tag.md`.
- Export `validate_staff_composition(text, file)` for outbound delivery. It accepts text, one allowed file, or both. It rejects a composition with neither. It uses the same size and signature rules. It does not call Telegram.
- The message read schema includes `body`, `unsupported_attachment`, `attachment_content_type`, and `has_attachment`. It does not include the storage key.
- In `docs/PROJECT.md`, state that a conversation file uses the existing 8 MiB disk store and is not a gallery lesion.

## Acceptance Criteria
- An inbound photo within 8 MiB with a caption stores one file and the caption in `body`, and does not add an `attachments` gallery row.
- An inbound sticker or video stores a message with `unsupported_attachment` true and a null storage key. `/start` without a file stores a message with `unsupported_attachment` false.
- A PDF over 8 MiB, or a file whose bytes do not match JPEG, PNG, WebP, GIF, or PDF, sets the marker and does not write a storage file.
- A newer edit can replace the stored file. An older original left in the queue does not change the key.
- `GET /messages/{id}/file` as a viewer returns the bytes. A message with only the unsupported marker returns 404. There is no route that edits or deletes the message body.
- `validate_staff_composition(None, None)` raises HTTP 422. Text alone, and a JPEG alone, pass.

## Dependencies
- `docs/issues/client-contacts-messaging/inbound-message-intake.md`
- Existing `ATTACHMENT_DIR`, `attachments/storage.py`, and the clinic bot token decrypt path.

## Files Likely Touched
- `apps/api/alembic/versions/`
- `apps/api/src/vetdietderm_api/messaging/models.py`
- `apps/api/src/vetdietderm_api/messaging/intake.py`
- `apps/api/src/vetdietderm_api/messaging/content.py`
- `apps/api/src/vetdietderm_api/messaging/router.py`
- `apps/api/src/vetdietderm_api/messaging/schemas.py`
- `apps/api/src/vetdietderm_api/owners/telegram.py`
- `docs/PROJECT.md`
- `packages/api-contract/openapi.json`
- `packages/api-contract/src/generated.ts`

## Implementation Steps
- [ ] Add the attachment columns and `unsupported_attachment` on `conversation_messages`.
- [ ] Add content application inside the inbound transaction, after the newer-version check and before `business_consumed_at` is set. Download and store at most one allowed file.
- [ ] Add `GET /messages/{message_id}/file` using `resolve_file`. Do not add a body edit or delete route.
- [ ] Add `validate_staff_composition` with the empty-composition rejection and the shared allow-list.
- [ ] Add the PROJECT.md sentence, run `pnpm api:generate`, and run the checks in Verification.

## Verification
- Process an inbound photo update under 8 MiB and confirm one storage file, a caption in `body`, `unsupported_attachment` false, and no new `attachments` row.
- Process a sticker update and confirm a message with `unsupported_attachment` true and a null `attachment_storage_key`.
- Process a newer edit that replaces the photo and confirm the new key. Reprocess an older original and confirm the key is unchanged.
- `GET /messages/{id}/file` as a viewer returns 200 for the stored photo and 404 for the sticker message.
- Call `validate_staff_composition` with no text and no file and confirm rejection. Call it with text `Ок` and confirm it returns the text.
- `pnpm api:check` passes.
