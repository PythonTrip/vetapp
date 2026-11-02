---
source_prd: docs/audit/2026-11-01-audit.md
prd_id: 2026-11-01-clinical-state
cycle_id: 2026-11-01-clinical-state
cycle_slug: clinical-state
project_doc: docs/PROJECT.md
status: Not Started
---

# Encounter Completion Autosave

## Implementation Status
Status: Not Started

## Description
Completing an encounter returns `status=completed`, but the workspace builds the next save from `editingRecord` in the patient encounter list. Autosave runs 1,100 ms after the next edit and can still see the previous `draft` or `in_progress` row when the refetch is late. That PATCH writes the old lifecycle status back. A completed visit must stay completed when the clinician fixes a typo. This product has no reopen action.

## Requirements
- `saveEncounter` in `apps/clinic-web/src/app/_components/encounter-workspace.tsx` must choose `EncounterWrite.status` from a local persisted status, not from `editingRecord.status`.
- Initialize that persisted status when an encounter is loaded. Overwrite it only with `saved.status` from a successful create or update response. A later list or detail refetch must not copy an older status back over it.
- The «Завершить приём», «Начать консультацию», and «Идёт консультация» controls must read the same persisted status.
- `useCreateEncounter` and `useUpdateEncounter` in `apps/clinic-web/src/features/encounters/hooks.ts` must `setQueryData` for `["encounter", saved.uuid]` and replace the matching item in `["encounters", patientId]` with `saved` before invalidating those queries and `["appointments"]`.
- Silent autosave after completion sends `status: "completed"`. «Начать консультацию» still sends `in_progress` only when the persisted status is `draft`.
- `update_encounter` in `apps/api/src/vetdietderm_api/encounters/repository.py` rejects a stored `completed` encounter whose payload status is `draft` or `in_progress` with HTTP 409 and detail `Завершённый приём нельзя вернуть в черновик`. `completed` to `completed`, `draft` to `in_progress`, and `in_progress` to `completed` stay allowed. Do not add a reopen route.
- Appointment completion behavior stays as it is: finalize sets the linked appointment to `completed`, and a non-finalize save does not move a completed appointment backward.
- Do not change anamnesis answers, exam text, or the 1,100 ms autosave delay.

## Acceptance Criteria
- Complete a draft or in-progress encounter, keep the encounter-list refetch unresolved, edit a field, and wait for autosave. The update payload status is `completed`.
- After that delayed refetch returns the pre-completion row, another edit still sends `completed`, and «Начать консультацию» stays hidden.
- A direct `PATCH` that changes `completed` to `draft` or `in_progress` returns 409 and leaves the stored status `completed`.
- Autosave of an `in_progress` encounter that has not been completed still sends `in_progress`.
- A failed save leaves the previous persisted status in place and shows the API error on the form.

## Dependencies
None. This cycle is the clinical-state slice of `docs/audit/2026-11-01-audit.md` (AUD-005). No other issue under `docs/issues/clinical-state/` blocks it. Assumption: no clinician control is a reopen action, so a completed encounter cannot move back to `draft` or `in_progress` through this workspace or through `PATCH`.

## Files Likely Touched
- `apps/clinic-web/src/app/_components/encounter-workspace.tsx`
- `apps/clinic-web/src/features/encounters/hooks.ts`
- `apps/clinic-web/src/app/_components/audit-regressions.test.tsx`
- `apps/api/src/vetdietderm_api/encounters/repository.py`
- `apps/api/src/vetdietderm_api/encounters/schemas.py`
- `apps/api/tests/integration/test_clinical_workflow.py`

## Implementation Steps
- [ ] Step 1: In `update_encounter`, when the stored status is `completed` and the payload sets `draft` or `in_progress`, raise HTTP 409 with detail `Завершённый приём нельзя вернуть в черновик` before assigning fields.
- [ ] Step 2: Add React state in `EncounterWorkspace` for the last successful encounter status. Set it from the encounter loaded into the form, and replace it only inside `saveEncounter` after `mutateAsync` resolves. Ignore later query results for that status.
- [ ] Step 3: Build `payload.status` and the completion / start-consultation buttons from that state. Keep the existing finalize and start-consultation transitions.
- [ ] Step 4: In `useCreateEncounter` and `useUpdateEncounter` `onSuccess`, write `saved` into `["encounter", saved.uuid]` and into the `["encounters", patientId]` list item with the same uuid, then invalidate the encounter, list, and appointment queries.
- [ ] Step 5: Extend `audit-regressions.test.tsx` with a completion case: `update` first resolves `{ ...record, status: "completed" }`, the list query stays on the old `draft` or `in_progress` record, a field edit occurs, and the next `update` call includes `status: "completed"`. Keep the existing in-progress autosave test passing.
- [ ] Step 6: Add an API assertion that a completed encounter cannot be patched back to `draft` or `in_progress`. Use the offline client pattern in `apps/api/tests/test_owner_cabinet.py` if `tests/integration/test_clinical_workflow.py` is not part of the offline run.
- [ ] Step 7: Run the verification commands below.

## Verification
- `pnpm --dir apps/clinic-web exec vitest run src/app/_components/audit-regressions.test.tsx --maxWorkers=1` passes, including the delayed-refetch completion case.
- The completed-status downgrade assertion returns 409 and the following read is still `completed`.
- `pnpm --dir apps/clinic-web exec tsc --noEmit --incremental false` passes.
