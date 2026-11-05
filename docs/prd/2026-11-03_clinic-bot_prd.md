---
prd_id: 2026-11-03-clinic-bot
cycle_id: 2026-11-03-clinic-bot
cycle_slug: clinic-bot
title: Clinic Bot
created: 2026-11-03
filename: docs/prd/2026-11-03_clinic-bot_prd.md
project_doc: docs/PROJECT.md
status: approved
scope_type: cycle
source: product-discovery
related_issue_batch: null
---

# PRD: Clinic Bot

## Cycle Summary

Roadmap **#9**, stage **Pro**, status **📋 Defined**. Predecessor is Owner Cabinet (#7), closed on the shipped cabinet. Specialty Depth moved from #9 to **#10** and stays later. This approval does not start implementation.

## Goal

A clinic, including a solo doctor, has one Telegram bot. The clinic administrator pastes the bot token and completes BotFather setup from the values shown in clinic settings. An owner who opens that bot, or the clinic's one link, enters that clinic's cabinet.

The running product has one deployment bot and a personal-versus-organization workspace switch. This cycle removes both. Clinical records, the owner cabinet, and the bot belong to the clinic. There is one implementation of that door.

## Current Project Context

Owner Cabinet (#7) is shipped. An owner joins one doctor by code or link, registers animals, chats, requests a visit with that doctor's questionnaire and files, and downloads only files the clinician shares. The clinician workspace is the system of record.

Today the owner Telegram door is one deployment bot (`TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`). Mini App launch data and the website login widget are checked with that token. An owner can open a cabinet before connecting a doctor. A workspace is either personal (`tenant_id` null, `created_by` equal to the doctor) or one module-auth organization. Questionnaires belong to a doctor. Chat replies are shown under the inviting doctor's name. The schedule has no doctor column.

Staff accounts and organization membership stay in module-auth. Organization roles in use are owner, admin, member, and viewer. Viewers are read-only. Owner sessions stay separate from staff sessions. The Food catalog stays global.

## New Functionality

### The doctor is a clinic

Registration gives the doctor one clinic and makes that doctor its administrator. A solo doctor does not create an organization by hand and does not work in a personal workspace. The clinic is the module-auth organization, created for the doctor.

If the doctor already belongs to an organization, that organization is the clinic. Personal clinical rows move into it. A second clinic is not created.

After this cycle the clinician has no personal/organization switch. Every clinical read and write uses the clinic.

Clinic administrators are the module-auth organization owner and admin roles. The solo doctor holds the owner role of that clinic.

### One bot for the clinic

Clinic settings let an administrator paste a Telegram bot token.

- A token Telegram accepts is stored for that clinic together with the bot id and username. The status becomes connected. The token is not shown again.
- A token Telegram rejects does not replace a connected bot. The screen shows the error.
- A bot id already stored for another clinic is rejected.
- Members and viewers see the connected or error status and the bot username. They do not see or replace the token.
- Replacing a token with a newly accepted token switches Mini App and website-widget checks to that bot. Owner cabinets already tied to the same Telegram user in this clinic stay in place.
- Connected means Telegram accepted the token. It does not mean the Mini App button or the widget domain is already set in BotFather.

The settings screen shows the clinic link, the Mini App URL, and the login-widget domain. The administrator copies those values into BotFather. This product does not operate BotFather and does not require a webhook.

The deployment-wide bot token is not a second door. Owner Telegram checks use only the clinic token.

While the clinic has no connected token, the clinic link still accepts email registration and email sign-in. The Telegram control is absent. Owners who already have a password can sign in by email.

The clinic name starts as the doctor's display name. An administrator can rename it. Owners see that name.

### Entering the clinic

The clinic has one link. This cycle does not change or rotate it. The link shows the clinic name before an account exists.

An owner who opens the clinic bot gets a cabinet for that clinic immediately. A join code is not required on that path. The same Telegram user who opens another clinic's bot gets a separate cabinet. Animals, chat, and visits stay inside the clinic where they were created.

On the website, the owner opens that clinic's page. Email and password on that page open the cabinet of that clinic. The same email may register a separate cabinet in another clinic, with its own password. A staff email cannot be an owner email in any clinic.

The Telegram login control on the clinic page is shown only when that clinic's bot is connected. It uses that clinic's bot username, and the server checks it with that clinic's token.

All clinics use one owner website. The bot button opens that site already aimed at its clinic. A clinic does not get its own domain in this cycle.

Owners who already joined stay with the clinic of their current doctor, with their animals and conversation history. Old per-doctor codes stop resolving. During migration the clinic link is the administrator's existing join code when that code exists; otherwise it is the newest join code among the doctors placed in that clinic.

### The cabinet faces the clinic

The owner sees the clinic name as the practice.

The clinic has one published questionnaire per bookable visit type (`primary`, `secondary`, `consultation`, `supervision`). Administrators edit it from settings. A visit request uses that clinic list and does not ask the owner to pick a doctor. Replacing a list does not change answers already submitted.

When several doctors in the clinic already published a list for the same visit type, the clinic keeps the administrator's list. If the administrator published none, it keeps the most recently saved list. The other lists for that type are removed.

A chat reply shows the display name of the staff member who sent it. Roles that can edit clinical records reply and confirm or reject visit requests. Viewers read the pending queues, download request files, and read chat. They do not accept, confirm, reject, or reply.

The day schedule stays the clinic schedule. It does not gain a doctor column, and it still excludes unconfirmed requests.

### Joining another doctor's clinic

A doctor belongs to one clinic. An administrator invites a colleague with the existing module-auth invite and chooses that colleague's role there.

The colleague can accept only when their own clinic has no patients and no connected owners. Encounter templates, clinical catalog items, and diet plans saved without a patient move with that doctor into the inviting clinic. The empty clinic is then closed, and its bot credential is removed.

If the colleague's clinic has a patient or a connected owner, acceptance is refused. Both clinics stay as they are.

## Changed Existing Functionality

- The personal workspace ceases to be a place where patients, templates, or owner entry live. Rows that were personal move to the doctor's clinic. The workspace switch is removed.
- Owner Telegram sign-in no longer uses `TELEGRAM_BOT_TOKEN` or `TELEGRAM_BOT_USERNAME`. A clinic with no stored token has no Telegram door.
- Per-doctor join codes cease to be an entry path. One clinic link replaces them. Already connected owners remain connected.
- Questionnaires move from one list per doctor to one list per clinic per visit type, under the rule in [The cabinet faces the clinic](#the-cabinet-faces-the-clinic).
- The owner cabinet presents the clinic. Chat shows the replying staff member's name. A visit request has no doctor choice.
- Email and password identify an owner inside one clinic. The same address in another clinic is another cabinet.
- An owner can register and sign in by email on the clinic link before a bot token exists.

Cabinet behavior shipped in #7 stays in place: pending registration off the main patient list, acceptance by creating or linking a client, one text thread per animal, visit types `primary`, `secondary`, `consultation`, and `supervision`, file sharing only when the clinician marks a file visible, and no encounter text in the cabinet.

## Product Architecture Impact

- One owner website serves every clinic. The clinic is identified on the bot button URL and on the clinic link, and Telegram checks use that clinic's stored token.
- The bot token is a clinic secret. It is write-only after a successful save. Bot id and username are the visible identity of the connected bot.
- Clinical tenancy becomes the clinic id from module-auth. The personal pattern `tenant_id` null plus `created_by` is not kept as a second runtime path.
- Owner identity is per clinic. A Telegram user id may have one cabinet in each clinic. Sessions opened for one clinic do not open another clinic's cabinet.
- Doctor-scoped templates and catalog items that move with a doctor become clinic-scoped records in the destination clinic. Shipped standard templates stay read-only.
- The Food catalog stays global. Catalog writes still require service `super_admin`.
- Which process creates the module-auth organization at doctor registration is an engineering choice. The product rule is that the doctor never submits a separate "create organization" step and never works before that clinic exists.

## Functional Nuances

- An invalid replacement token leaves the previous connected bot in place.
- A clinic link with no token shows email registration and email sign-in, and hides the Telegram control.
- Opening an old per-doctor code does not create or attach an owner.
- Submitted questionnaire snapshots and existing chat text stay as stored through the questionnaire and sender-label change.
- Invite acceptance is refused for a clinic that has patients or connected owners even when the invitee is an administrator of that clinic.
- Templates, custom fields, and patient-less diet plans are not a reason to refuse the invite. They move, and the empty clinic closes.
- Closing an empty clinic removes its bot. The inviting clinic keeps its own bot.
- Observers stay read-only on clinical records, pending queues, and chat.
- Russian UI stays. No owner email is sent. No payment is collected.
- A forgotten owner password still cannot be recovered in this cycle.

## Data, Integrations, and Constraints

Records this cycle adds or re-homes:

- Clinic: the doctor's single module-auth organization, with a visible name.
- Clinic bot: token secret, bot id, username, and connected or error status. One bot id belongs to one clinic.
- Clinic link: one stable code per clinic.
- Owner cabinet: bound to one clinic. Email and password are unique inside that clinic. Telegram user id is unique inside that clinic and may exist again in another clinic.
- Visit questionnaire: one published list per clinic per visit type.

Telegram is the only new external integration, and only as each clinic's own bot. The product calls Telegram to verify a pasted token and to check Mini App and login-widget payloads. It does not send messages and does not receive a webhook.

Staff and owner sessions remain unable to open each other's surface. Attachment limits stay 8 MiB and JPEG, PNG, WebP, GIF, or PDF.

## Out of Scope for This Cycle

- Messages from the bot, including visit status and chat notices
- Booking or chat inside Telegram
- A domain per clinic
- Rotating or replacing the clinic link
- A doctor who belongs to more than one clinic
- Accepting an invite when the invitee's clinic already has patients or connected owners
- Owner email verification, password reset, and any email, SMS, or push notice
- Online payment
- Specialty Depth (#10)
- Changes to FEDIAF assessment, the Food catalog, or encounter signing

## Open Questions

- Which process creates the module-auth organization when a doctor registers. The doctor does not create it by hand, and a personal workspace is not a fallback.
- Where owner password hashes remain, so long as an owner session cannot open the clinician workspace and a staff session cannot open the cabinet.
---
