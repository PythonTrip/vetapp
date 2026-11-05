---
source_prd: docs/prd/2026-11-03_clinic-bot_prd.md
prd_id: 2026-11-03-clinic-bot
cycle_id: 2026-11-03-clinic-bot
cycle_slug: clinic-bot
project_doc: docs/PROJECT.md
status: Not Started
---

# Preserve Telegram Cabinets During Clinic Migration

## Implementation Status
Status: Not Started

## Description
Review finding P1: `rehome_personal_rows` replaces a personal owner's join code before evaluating the Telegram binding selection. When the canonical clinic link belongs to another doctor, the selection no longer finds that owner, leaving the identity tenant-null. Subsequent Telegram login can create a new cabinet instead of restoring the existing animals and history. This repairs the PRD's Entering the clinic migration guarantee.

## Requirements
- Identify the affected owners before changing their join codes or deleting the personal code, and use that stable selection to move their eligible Telegram identities into the clinic.
- Keep the canonical clinic link selection unchanged, including a link owned by another doctor.
- Preserve owner account IDs, animals, messages, and visit history. Do not create replacement owner accounts during migration.
- Preserve the existing conflict guard when the destination already has the same Telegram user ID. Do not overwrite another cabinet's identity or move identities belonging to unrelated doctors or clinics.
- Keep migration idempotent and perform the owner and identity changes in the same database transaction.

## Acceptance Criteria
- A personal owner with a tenant-null Telegram identity is migrated to a clinic whose canonical link belongs to a different doctor. Both the owner and identity receive the clinic ID.
- A subsequent login through that clinic bot returns the same owner account and existing animals and history.
- Repeating migration produces no additional accounts or identities and changes no unrelated clinic records.
- A destination Telegram identity conflict preserves the existing destination identity and does not violate the uniqueness constraint.
- Migration also works when the personal code itself becomes the clinic code.

## Dependencies
None. Existing clinic link selection and Telegram owner login are the integration contracts; do not change their selection policy. Review finding 1 is the repair scope, not a request to regenerate the full Clinic Bot feature set.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/tenancy.py`
- `apps/api/src/vetdietderm_api/owners/models.py`
- `apps/api/src/vetdietderm_api/owners/repository.py`
- `apps/api/tests/test_multi_user_auth.py`
- `apps/api/tests/test_telegram_owner.py`

## Implementation Steps
- [ ] Step 1: Inspect `rehome_personal_rows`, the identity uniqueness constraints, and clinic Telegram login resolution.
- [ ] Step 2: Capture affected owner IDs or move eligible identity bindings before replacing join codes, preserving the existing destination conflict predicate.
- [ ] Step 3: Keep owner reassignment and identity migration atomic and idempotent without changing canonical link selection.
- [ ] Step 4: Verify migration and subsequent login for a link owned by another doctor, code promotion, repeated migration, and an identity conflict.

## Verification
- With isolated database fixtures, seed a personal owner, animal, chat history, and tenant-null Telegram binding, plus a canonical clinic link owned by another doctor. Run migration and inspect owner/identity tenant IDs; authenticate as the same Telegram user and confirm the original owner ID and history.
- Repeat migration and compare account and identity counts. Seed an unrelated owner and a destination identity conflict and confirm neither existing binding is overwritten.
- Run `uv run --directory apps/api python -m py_compile src/vetdietderm_api/tenancy.py`.
