---
source_prd: docs/prd/2026-11-03_clinic-bot_prd.md
prd_id: 2026-11-03-clinic-bot
cycle_id: 2026-11-03-clinic-bot
cycle_slug: clinic-bot
project_doc: docs/PROJECT.md
status: Not Started
---

# Preserve Required Questionnaires Before Owner Visits

## Implementation Status
Status: Not Started

## Description
Review finding P2: migration `0036` leaves existing questionnaires tenant-null, while owner question reads filter by clinic ID. The freeze currently runs only when staff list questionnaires in settings. Until that happens, owners see no published questions and can submit visits without previously required answers. This repairs the PRD's The cabinet faces the clinic publication migration.

## Requirements
- Resolve existing doctor publications into clinic publications before owner question reads or visit submissions rely on tenant-scoped lookup, without requiring staff to open settings.
- Reuse `freeze_clinic_questionnaires` and the existing authoritative clinic-member information where possible. Never infer clinic membership from unrelated personal rows.
- Apply the PRD selection rule: retain the administrator's list when present, otherwise the most recently saved candidate. Preserve the existing deterministic tie-break and cross-clinic isolation.
- Ensure reads and submissions observe one complete selected publication. Migration must be idempotent and safe with concurrent publication or first access.
- Do not treat unresolved migration or unavailable membership information as an empty publication that permits unanswered submission. Return an explicit retryable failure when publication cannot be resolved safely.
- Preserve stored answers on existing visit requests and the valid empty-questionnaire behavior for clinics without prior publications.

## Acceptance Criteria
- Immediately after schema upgrade, before staff open questionnaire settings, an owner receives the selected legacy questions for each published visit type.
- A submission missing required answers is rejected with 422; a submission answering the selected publication succeeds.
- Multiple doctor lists resolve using administrator preference and then latest save, and the result is stable across repeated access.
- Existing submitted answers remain unchanged. Publications from another clinic never enter the candidate set.
- Concurrent first access and publication replacement do not create duplicate clinic slots or expose a partial publication.
- A clinic with no legacy publication still receives a legitimate empty question list; an unresolved migration does not silently become one.

## Dependencies
None. Migration `0036_clinic_questionnaires` and authoritative module-auth clinic membership are existing runtime prerequisites. Select the migration trigger using those existing contracts; do not add an owner permission to edit questionnaires.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/questionnaires/repository.py`
- `apps/api/src/vetdietderm_api/questionnaires/router.py`
- `apps/api/src/vetdietderm_api/visits/repository.py`
- `apps/api/src/vetdietderm_api/visits/router.py`
- `apps/api/src/vetdietderm_api/auth.py`
- `apps/api/alembic/versions/0036_clinic_questionnaires.py` (inspect; preserve deployed revision history)
- `apps/api/tests/integration/test_clinical_workflow.py`
- `apps/api/tests/test_visit_requests.py`
- `apps/api/tests/test_multi_user_auth.py`

## Implementation Steps
- [ ] Step 1: Trace schema upgrade, staff publication freeze, owner question reads, and visit creation to choose a migration trigger that runs before both owner paths.
- [ ] Step 2: Invoke publication resolution with authoritative membership and the existing winner policy, using a new migration revision only if durable schema changes are necessary.
- [ ] Step 3: Make unresolved migration fail explicitly instead of passing an empty question set into visit-answer validation.
- [ ] Step 4: Verify administrator/latest selection, required-answer validation, stored-answer preservation, empty clinics, and concurrent access on an isolated PostgreSQL database.

## Verification
- Seed tenant-null publications for multiple doctors in one clinic and a publication from another clinic. Without opening staff settings, request owner questions and submit visits with missing and complete answers; inspect the selected publication and response status.
- Compare an existing visit's stored answers before and after migration; repeat resolution and confirm one slot per clinic/type.
- Run concurrent first-access and publication replacement requests against isolated PostgreSQL; confirm no duplicate slots or partial question list.
- Run `uv run --directory apps/api python -m py_compile src/vetdietderm_api/questionnaires/repository.py src/vetdietderm_api/visits/repository.py`.
