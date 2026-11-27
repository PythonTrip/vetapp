---
prd_id: 2026-11-26-telegram-bot-gateway
cycle_id: 2026-11-26-telegram-bot-gateway
cycle_slug: telegram-bot-gateway
title: Telegram Bot Gateway
created: 2026-11-26
filename: docs/prd/2026-11-26_telegram-bot-gateway_prd.md
project_doc: docs/PROJECT.md
status: draft
scope_type: cycle
source: product-discovery
related_issue_batch: null
---

# PRD: Telegram Bot Gateway

## Cycle Summary

Roadmap **#12**, stage **Platform**, status **⬜ Planned** while this PRD is a draft. Predecessor is Catalog Browse (#11), closed 2026-11-26. Clinic Telegram Conversation (#13) follows this cycle and consumes the updates stored here. Specialty Depth stays later and is now #14.

This cycle makes each clinic bot a verified Telegram webhook and durably receives private updates inside the existing FastAPI deployment. It does not show message text to staff and does not write the clinical conversation.

## Goal

A clinic administrator connects one dedicated Telegram bot, sees that its webhook points at this deployment, and can replace, recheck, or disconnect it. A private message to that bot is stored once and handed to a PostgreSQL-backed worker that survives a FastAPI restart. The transport completion mark leaves the update available for cycle #13.

## Current Project Context

The clinician workspace is the system of record. Owner sign-in, the owner web host, Telegram Mini App, and the Login Widget are removed. Staff still have the registrations queue, visit requests, and one text thread per patient.

Each clinic has one `clinic_bots` row. An organization owner or admin pastes a token. `PUT /clinic-bot` calls `getMe`, rejects a bot id already stored for another clinic, and saves a token Telegram accepts. A rejected token does not replace a connected bot. The token is stored in plaintext. `GET /clinic-bot` returns status (`connected` or `error`), bot id, username, and `last_error`. It does not return the token. Members and viewers can read that screen and cannot replace the token. There is no disconnect action, no public bot link, no webhook, and no inbound update path. Telegram cannot reach the API: nginx publishes the clinic UI, and FastAPI listens on loopback. Staff `/api` calls go through the Next.js proxy and the clinical session.

The settings copy already says the credential is kept for later clinic messages. Nothing in the running product receives or sends those messages.

## New Functionality

### Bot lifecycle

Clinic settings keep one bot per clinic. Organization owner and admin can connect, replace, verify, and disconnect. Every clinic role can see the bot username, the public `t.me` link, credential status, webhook status, and the last error. Nobody sees the bot token or the webhook secret. Stored and displayed errors never contain either secret.

Credential status is absent, connected, error, or disconnected. Webhook status is not configured, active, or error. Webhook status is active only when Telegram reports the expected URL for this integration. A different URL, or a webhook that is merely present, is not active.

Connect:

- `getMe` must succeed, the bot id must not belong to another clinic, and the deployment must have both the public HTTPS base URL and the encryption key.
- The token is stored encrypted. A webhook secret is created. `setWebhook` is called immediately with the expected URL.
- If `setWebhook` fails, the credential is connected and the webhook status is error.
- A token Telegram rejects does not replace a connected bot.

Replace follows connect. The integration id stays. The webhook secret changes. When the new bot id differs and the previous token still works, the previous bot's webhook is removed.

Verify calls `getMe` and reads the webhook Telegram has stored. It compares that URL with the expected URL. It does not rotate a working secret. When the reported URL is not the expected one, verify calls `setWebhook` with the current secret. A secret is created only when the row does not have one. A failed `getMe` sets credential status to error, keeps the stored ciphertext, and does not disconnect the row.

Disconnect removes the local credential first. The encrypted token is deleted, the webhook secret is invalidated, and the status becomes disconnected. The public endpoint stops accepting updates for that integration even when `deleteWebhook` fails. A Telegram-side removal error is shown without secrets. The integration id and already stored updates remain. A later connect reuses the integration id and issues a new secret.

Tokens already stored in plaintext are encrypted in place. Their webhook stays inactive until an administrator verifies or connects the bot again.

### Public intake

One deployment-wide HTTPS base URL is used for every clinic. nginx publishes only the webhook path to FastAPI. The path carries the integration id. The webhook secret arrives in a header. The clinic is resolved from the stored integration, not from anything the caller asserts. Staff routes stay behind the clinical session and the Next.js proxy.

A request with a missing or wrong secret is rejected and stored nowhere. A private `message` or `edited_message` is stored, then acknowledged. The same bot id and update id are acknowledged again and are not queued twice. Group, channel, callback, and every other update kind are acknowledged and stored nowhere.

### Durable worker

The existing FastAPI process runs one worker for every clinic bot. There is no process per bot. The worker claims queued updates atomically in PostgreSQL, so two claimers cannot own the same update. After a FastAPI restart, a claim that did not finish returns to the queue and can be claimed again.

The handler in this cycle marks transport complete. It does not create a client, patient, or chat message, and it does not call Telegram. Transport completion is not business consumption: cycle #13 can still select and process these stored updates. A transport retry does not hide them from that cycle.

A transport failure is retried and does not stop other clinics. After a small fixed number of failures the update stays in transport error and the queue moves on. The exact retry limit is an engineering choice inside that rule.

## Changed Existing Functionality

- `GET`/`PUT /clinic-bot` gain verify and disconnect, webhook status, the public link, and encrypted storage. The token remains write-only.
- A connected bot is expected to have this deployment's webhook URL, not only a successful `getMe`.
- The plaintext `clinic_bots.token` values become ciphertext. A missing encryption key or a missing public base URL refuses a new token instead of storing it in the clear.
- One unauthenticated webhook path becomes reachable from Telegram. Every other API route keeps the current session and proxy boundary.
- Displayed and stored bot errors no longer have a path that can echo a token or a webhook secret.

## Product Architecture Impact

- One FastAPI process serves every clinic bot. The worker is in that process. PostgreSQL is the queue. Claim is atomic, and an unfinished claim is recoverable after process restart.
- Telegram transport is a separate boundary from messaging and CRM. This cycle's handler ends at the transport mark.
- The bot token and webhook secret are deployment-encrypted credentials. The integration id is the public locator. Logs, API error bodies, `last_error`, and the settings screen receive neither secret.
- Local disconnect is authoritative for intake. Remote `deleteWebhook` is attempted and is not required for the endpoint to stop.
- Staff HTTP remains same-origin `/api` through Next.js. The webhook is the one path nginx forwards directly to FastAPI.
- No Redis, external broker, Mini App, bot menu, or additional bot process.

## Functional Nuances

- Owner and admin of the clinic organization are the only roles that connect, replace, verify, or disconnect. Members and viewers see username, `t.me` link, both statuses, and the last error.
- Duplicate bot id across clinics stays a conflict. The clinic that already holds it keeps it.
- Verify of a migrated row may call `setWebhook` when the URL does not match. It does not rotate the secret that is already stored.
- Replace that passes `getMe` stores the new credential even if `setWebhook` then fails. Replace that fails `getMe` leaves the previous connected bot in place.
- Disconnect with a failed `deleteWebhook` still invalidates the secret and rejects later deliveries.
- Private `message` and `edited_message` are the only updates that enter the queue. Non-private updates are acknowledged so Telegram does not retry them.
- Persistence happens before the success acknowledgement. A crash after the insert and before the acknowledgement must not create a second logical update.
- Restart recovery replays unfinished transport claims. It does not mark an update consumed for cycle #13.
- The settings screen shows credential health and webhook health. It does not show message content, the token, or the secret.
- Russian UI copy stays on the existing clinic bot card.

## Data, Integrations, and Constraints

- Source of truth for the bot credential, integration id, encrypted secret, stored updates, and the worker queue is PostgreSQL.
- Telegram Bot API methods used by this cycle are `getMe`, `setWebhook`, `getWebhookInfo`, and `deleteWebhook`. Outbound `sendMessage` waits for cycle #13.
- The expected webhook URL is the deployment HTTPS base plus the integration path. Active means `getWebhookInfo` reports that URL.
- One encryption key and one public base URL serve every clinic. Absence of either blocks a new token and makes verify report an error.
- Existing plaintext tokens are encrypted by migration. They do not gain a webhook until verify or a new connect.
- Stored updates are kept after disconnect. The transport-complete mark must remain distinguishable from later business processing.
- The worker shares the API process and uses PostgreSQL atomic claims. A second claimer, including a claimer after restart, cannot take a claim the first one still owns; a claim interrupted by restart becomes claimable again.
- No new broker, cache, or object store.

## Out of Scope for This Cycle

- Reading Telegram text in the clinic UI, creating clients or patients from a chat, and replying through the bot. Those belong to cycle #13.
- Visit notices, chat notices, and booking inside Telegram.
- Mini Apps, command menus, group or channel chats, and inline keyboards.
- Redis, an external message broker, and one OS process per clinic bot.
- Publishing any staff or clinical route outside the existing session and proxy boundary.
- Rotating the clinic link, owner email, or online payments.

## Open Questions

- The exact transport retry limit is intentionally unset. The product rule is a small fixed limit, then transport error, without blocking the rest of the queue.
- Cycle #13 will define how a stored private update becomes a visible conversation and an outbound Telegram reply. This PRD requires only that the transport mark does not make those updates ineligible.
