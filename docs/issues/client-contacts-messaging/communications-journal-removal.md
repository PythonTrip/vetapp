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

# Communications Journal Removal

## Implementation Status
Status: Done

## Description
The patient tab «Коммуникации», the manual phone-and-email journal, and follow-up on that journal leave the product. Stored `communications` rows are deleted with the table. Nothing in this cycle replaces follow-up, and this issue does not add a messaging page.

## Requirements
- Remove `GET` and `POST /patients/{patient_id}/communications`, `PATCH` and `DELETE /communications/{communication_id}`, and their `/v1/staff` aliases. Those paths must no longer be in the OpenAPI document.
- Remove the `communications` router from `LEGACY_CLINICAL_ROUTERS`. Delete the communications package modules that only serve that API: `router.py`, `repository.py`, `schemas.py`, `models.py`, and `__init__.py`. Remove the model import from `orm.py`.
- Add an Alembic revision whose `down_revision` is the current head. `upgrade` drops table `communications`. `downgrade` recreates the table shape from `0009_communications` and does not restore deleted rows.
- On the patient card, remove the `comms` tab, the «Коммуникации» label, `CommunicationLog`, and the follow-up field. Remaining tabs are `card`, `encounters`, `gallery`, and `nutrition`. `?tab=comms` opens the card tab.
- Delete `communication-log.tsx` and the communications client functions in `features/encounters/api.ts` and `features/encounters/hooks.ts`. Do not delete encounter, gallery, or nutrition code in those files.
- If `patients.tsx` still renders `PatientChat` only inside the removed tab, remove that render with the tab. Do not delete `patient-chat.tsx`, `animal-chat.tsx`, or the chat API. That removal belongs to `docs/issues/client-contacts-messaging/animal-chat-removal.md`.
- Update `apps/api/tests/integration/test_clinical_workflow.py` and `apps/api/tests/integration/test_api_access.py` so they no longer create or request communications. Keep the rest of the clinical workflow assertions.
- Update `patients.test.tsx` so it no longer expects the «Коммуникации» tab. Do not add a replacement follow-up control, navigation item, or messaging screen.
- In `docs/PROJECT.md`, remove the communication-log feature, the `communications` table row, and the `communications` edges in the relationship map. State that follow-up on that journal has no replacement in this cycle.

## Acceptance Criteria
- The patient card shows Карточка, Приёмы, Галерея, and Питание, and does not show Коммуникации or a follow-up time field.
- Opening `/patients/{id}?tab=comms` shows the card tab.
- `GET /patients/{id}/communications` and `GET /v1/staff/patients/{id}/communications` are not registered routes.
- After upgrade, table `communications` is absent. Encounter, gallery, and nutrition tabs still render their existing panels.
- The registration queue still lists registrations. This issue does not remove its chat.

## Dependencies
- None

## Files Likely Touched
- `apps/api/src/vetdietderm_api/communications/`
- `apps/api/src/vetdietderm_api/routing.py`
- `apps/api/src/vetdietderm_api/orm.py`
- `apps/api/alembic/versions/`
- `apps/api/tests/integration/test_clinical_workflow.py`
- `apps/api/tests/integration/test_api_access.py`
- `apps/clinic-web/src/features/encounters/components/communication-log.tsx`
- `apps/clinic-web/src/features/encounters/api.ts`
- `apps/clinic-web/src/features/encounters/hooks.ts`
- `apps/clinic-web/src/features/patients/components/patient-detail.tsx`
- `apps/clinic-web/src/features/patients/components/patients-workspace.tsx`
- `apps/clinic-web/src/app/_components/patients.tsx`
- `apps/clinic-web/src/app/_components/patients.test.tsx`
- `packages/api-contract/openapi.json`
- `packages/api-contract/src/generated.ts`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Remove the communications routes, package, and `orm.py` import. Drop `communications` in a new Alembic revision with a schema-only downgrade.
- [x] Remove the `comms` tab from `PatientTab`, `PATIENT_TABS`, `normalizeTab`, and the tab panel. Delete `CommunicationLog` and its API hooks.
- [x] Update the API and clinic-web tests listed in Requirements so they no longer expect the journal.
- [x] Remove the journal, follow-up, and `communications` table from `docs/PROJECT.md`.
- [x] Run `pnpm api:generate` and the checks in Verification.

## Verification
- `uv run --project apps/api python -c "from vetdietderm_api.main import app"` imports, and `app.openapi()` has no path containing `communications`.
- Upgrade the database and confirm `to_regclass('communications')` is null.
- Open `/patients`, select a patient, and confirm the four remaining tabs render and «Коммуникации» is absent. Open `?tab=comms` and confirm the card tab is shown.
- Confirm the registration queue still renders on `/patients`.
- `pnpm api:check` passes after `pnpm api:generate`.
