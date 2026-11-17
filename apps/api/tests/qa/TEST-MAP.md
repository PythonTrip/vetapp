# VetDietDerm API — Test Map

> Source: repository not supplied · ref `0308862f9d870ce387a7dbb9cc0055a6796906d0`

## Short Review

| Parameter | Value |
|---|---|
| Core domains | Clinical records and appointments · Reproducible nutrition plans · Clinic data isolation · Owner request and staff confirmation |
| Core selection approval | `pending` |
| Scope approval | `pending` |
| Plan | **4 features, 5 checks, 5 Core smoke** |
| Execution status | **PLANNED only** — this map does not execute tests or prove PASS |

## Testing scope and boundaries

| Module | Feature | Place (file / API / method / class) | Expected results |
|---|---|---|---|
| **Clinical workflow** | **Persist a patient's encounter and appointment** (`FEAT-API-CLINICAL`)<br>Checks: `CHECK-API-CLINICAL` | `apps/api/src/vetdietderm_api/patients/router.py`<br>`apps/api/src/vetdietderm_api/encounters/router.py`<br>`apps/api/src/vetdietderm_api/appointments/router.py`<br>`apps/api/src/vetdietderm_api/attachments/router.py` | A separate read returns the encounter values, the linked appointment and the stored attachment. |
| **Nutrition** | **Save and explicitly replace a diet plan snapshot** (`FEAT-API-NUTRITION`)<br>Checks: `CHECK-API-NUTRITION` | `apps/api/src/vetdietderm_api/catalog/router.py`<br>`apps/api/src/vetdietderm_api/assessments/router.py`<br>`apps/api/src/vetdietderm_api/standards/fediaf/v2025/provider.py` | Renaming a catalog food preserves the saved snapshot. Explicit replacement records newly selected inputs and provider provenance. |
| **Authorization** | **Restrict client records by clinic and role** (`FEAT-API-CLINIC-ACCESS`)<br>Checks: `CHECK-API-CLINIC-ACCESS` | `apps/api/src/vetdietderm_api/auth.py`<br>`apps/api/src/vetdietderm_api/patients/router.py` | The owning clinic keeps access to its record. Another clinic cannot read or change it, and a viewer cannot create a record. |
| **Visits** | **Preserve owner submissions and schedule confirmed visits** (`FEAT-API-VISITS`)<br>Checks: `CHECK-API-VISITS`, `CHECK-API-VISIT-CONFIRMATION-PG` | `apps/api/src/vetdietderm_api/visits/router.py`<br>`apps/api/src/vetdietderm_api/questionnaires/router.py`<br>`apps/api/src/vetdietderm_api/appointments/router.py` | Submitted answers survive questionnaire edits. Valid confirmation creates a typed appointment. Invalid confirmation leaves the request and registration pending. |

### Included

- Clinical records, appointments and attachment persistence through FastAPI.
- Nutrition catalog, assessment and saved diet plan snapshots.
- Clinic access controls and owner visit requests.

### Excluded / not Core

- Live module-auth, Telegram, deployed network and migration behavior are outside these test fixtures.
- The wider visit matrix runs on SQLite. The focused confirmation rollback and retry check uses PostgreSQL.

### Real dependencies

- FastAPI and SQLAlchemy
- PostgreSQL for clinical and nutrition integration
- Temporary attachment filesystem
- In-process FEDIAF 2025 provider

### Stubbed dependencies

- **module-auth**: The fixtures provide synthetic users and clinic roles without calling the external service.

## Execution matrix — when each check runs

`B` blocks the event · `✓` runs without blocking · `—` not scheduled. All mandatory Core smoke apply regardless of changed-file filters.

| Module | Check IDs | Local | PR | Main | Nightly | Release | Post-deploy |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Clinical workflow** | `CHECK-API-CLINICAL` | — | B | B | — | B | — |
| **Nutrition** | `CHECK-API-NUTRITION` | — | B | B | — | B | — |
| **Authorization** | `CHECK-API-CLINIC-ACCESS` | — | B | B | — | B | — |
| **Visits** | `CHECK-API-VISITS`, `CHECK-API-VISIT-CONFIRMATION-PG` | — | B | B | — | B | — |

**Mandatory events:** `pull_request, main_push, release_candidate`. Execution evidence stays in ephemeral runner storage / CI, not in this map.

## Test structure

Proposed organization; do not assume these directories/tests exist until implementation:

```text
tests/
  qa/                     # VAT-specific metadata and QA artifacts
    test-map.yaml         # draft proposal; authority only after approval
    TEST-MAP.md           # generated human interface
    # No persistent run reports or separate check catalog
  unit/
    clinical-workflow/
    nutrition/
    authorization/
    visits/
  api/
    clinical-workflow/
    nutrition/
    authorization/
    visits/
  integration/
    clinical-workflow/
    nutrition/
    authorization/
    visits/
  e2e/
    clinical-workflow/
    nutrition/
    authorization/
    visits/
  secure/
    clinical-workflow/
    nutrition/
    authorization/
    visits/
  _support/                # disposable fixtures and cleanup
```

`mock` is a test double, not a test level. `security` is a cross-cutting dimension and may instead be applied as a tag. Keep colocated existing tests unless there is a reason to migrate.

## Check details

> Generated from `test-map.yaml`. Expected results are a plan, not evidence of passing tests.

## CHECK-API-CLINICAL — Create a patient and encounter, complete the encounter, then read the linked appointment and attachment.

**Module / Feature:** Clinical workflow / `FEAT-API-CLINICAL` · **Level:** `integration` · **Core smoke:** `True`

**Expected:** The response preserves the patient link, completed status, edited plan and stored file contents.

**Independent oracle:** Project clinical-workflow contract and fixed record values and file bytes supplied by the test.

**Test data:** Synthetic patient, encounter, appointment and disposable attachment.

**real:** `FastAPI ASGI routes`, `PostgreSQL`, `Temporary attachment filesystem`

**stubbed:** `module-auth`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/integration/test_clinical_workflow.py`

## CHECK-API-NUTRITION — Assess a ration, save a plan, rename its food and then explicitly replace the plan snapshot.

**Module / Feature:** Nutrition / `FEAT-API-NUTRITION` · **Level:** `integration` · **Core smoke:** `True`

**Expected:** The old food name and input hash survive the catalog edit. Replacement keeps the plan ID and records the new inputs and provider metadata.

**Independent oracle:** Project snapshot contract, fixed original and replacement inputs and independent reads of the saved plan.

**Test data:** Synthetic patient, seeded nutrients, one catalog food and a disposable ration.

**real:** `FastAPI ASGI routes`, `PostgreSQL`, `In-process FEDIAF 2025 provider`

**stubbed:** `module-auth`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/integration/test_nutrition_workflow.py`

## CHECK-API-CLINIC-ACCESS — Compare access to a client record for its clinic, another clinic and a viewer.

**Module / Feature:** Authorization / `FEAT-API-CLINIC-ACCESS` · **Level:** `integration` · **Core smoke:** `True`

**Expected:** The other clinic sees an empty list and receives 404 for direct reads and writes. Viewer creation returns 403 and the original record remains readable.

**Independent oracle:** Clinic and role assignments fixed in the fixture and the documented clinic and viewer access rules.

**Test data:** Synthetic clinic memberships, sessions and client record.

**real:** `FastAPI ASGI authorization and client routes`, `PostgreSQL`

**stubbed:** `module-auth`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/integration/test_multi_user_boundaries.py`

## CHECK-API-VISITS — Submit a visit request, change the published questionnaire, and exercise valid and invalid confirmation cases.

**Module / Feature:** Visits / `FEAT-API-VISITS` · **Level:** `integration` · **Core smoke:** `True`

**Expected:** Saved answers stay intact and the schedule stays empty until confirmation. Valid types create one appointment. An invalid type returns 422 and leaves the pending records intact.

**Independent oracle:** Booking by Problem PRD and project contract, fixed questionnaire options and visit types, and independent schedule and database reads.

**Test data:** Synthetic owner, pet, clinic, questionnaire and pending registration.

**real:** `FastAPI ASGI routes`, `In-memory SQLite`, `Temporary attachment filesystem`

**stubbed:** `module-auth`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/integration/test_visit_requests.py`

## CHECK-API-VISIT-CONFIRMATION-PG — Confirm an owner request while its uploaded file is missing, then restore the file and retry.

**Module / Feature:** Visits / `FEAT-API-VISITS` · **Level:** `integration` · **Core smoke:** `True`

**Expected:** The failed confirmation leaves the request and registration pending, with zero clinical rows. Retry accepts the registration and creates one linked appointment and gallery attachment.

**Independent oracle:** Project atomic-confirmation requirement and independently queried PostgreSQL rows, staff schedule and patient lists.

**Test data:** Synthetic clinic, pending owner registration, pet, request and temporary PDF.

**real:** `FastAPI ASGI routes`, `PostgreSQL`, `Temporary attachment filesystem`

**stubbed:** `module-auth`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/integration/test_visit_confirmation_postgres.py`
