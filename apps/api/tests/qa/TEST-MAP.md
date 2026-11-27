# Vet Space API — Test Map

> Source: repository not supplied · ref `be72a1448236e94be1ec29ec7cf8e1a6b7005315`

## Short Review

| Parameter | Value |
|---|---|
| Core domains | Clinical records and appointments · Reproducible nutrition plans · Clinic data isolation · Clinic Telegram conversations and replies |
| Core selection approval | `pending` |
| Scope approval | `pending` |
| Plan | **10 features, 13 checks, 7 Core smoke** |
| Execution status | **PLANNED only** — this map does not execute tests or prove PASS |

## Testing scope and boundaries

| Module | Feature | Place (file / API / method / class) | Expected results |
|---|---|---|---|
| **Clinical workflow** | **Persist a patient's encounter and appointment** (`FEAT-API-CLINICAL`)<br>Checks: `CHECK-API-CLINICAL` | `apps/api/src/vetdietderm_api/patients/router.py`<br>`apps/api/src/vetdietderm_api/encounters/router.py`<br>`apps/api/src/vetdietderm_api/appointments/router.py`<br>`apps/api/src/vetdietderm_api/attachments/router.py` | A separate read returns the encounter values, the linked appointment and the stored attachment. |
| **Nutrition** | **Save and explicitly replace a diet plan snapshot** (`FEAT-API-NUTRITION`)<br>Checks: `CHECK-API-NUTRITION` | `apps/api/src/vetdietderm_api/catalog/router.py`<br>`apps/api/src/vetdietderm_api/assessments/router.py`<br>`apps/api/src/vetdietderm_api/assessments/plans.py`<br>`apps/api/src/vetdietderm_api/assessments/service.py`<br>`apps/api/src/vetdietderm_api/standards/fediaf/v2025/provider.py` | Renaming a catalog food preserves the saved snapshot. Explicit replacement records newly selected inputs and provider provenance. |
| **Authorization** | **Restrict client records by clinic and role** (`FEAT-API-CLINIC-ACCESS`)<br>Checks: `CHECK-API-CLINIC-ACCESS` | `apps/api/src/vetdietderm_api/auth.py`<br>`apps/api/src/vetdietderm_api/auth_sessions.py`<br>`apps/api/src/vetdietderm_api/tenancy.py`<br>`apps/api/src/vetdietderm_api/patients/router.py` | The owning clinic keeps access to its record. Another clinic cannot read or change it, and a viewer cannot create a record. |
| **PostgreSQL** | **Replace the as-fed nutrient set atomically under concurrent writes** (`FEAT-API-PG-NUTRIENTS`)<br>Checks: `CHECK-API-PG-NUTRIENTS-CONCURRENT` | `apps/api/src/vetdietderm_api/catalog/router.py`<br>`apps/api/src/vetdietderm_api/catalog/repository.py` | The persisted as-fed rows equal one complete replacement and contain exactly one row per submitted nutrient. Other bases remain intact. |
| **PostgreSQL** | **Confirm a visit once under concurrent staff requests** (`FEAT-API-PG-CONFIRMATION`)<br>Checks: `CHECK-API-PG-VISIT-CONFIRM-CONCURRENT` | `apps/api/src/vetdietderm_api/visits/router.py`<br>`apps/api/src/vetdietderm_api/visits/service.py`<br>`apps/api/src/vetdietderm_api/visits/repository.py`<br>`apps/api/src/vetdietderm_api/owners/registrations.py` | One confirmation accepts the registration and creates one linked appointment. A competing confirmation leaves the committed result intact. |
| **PostgreSQL** | **Preserve a paid charge when a concurrent edit is already in progress** (`FEAT-API-PG-CHARGE`)<br>Checks: `CHECK-API-PG-CHARGE-CONCURRENT` | `apps/api/src/vetdietderm_api/appointments/router.py`<br>`apps/api/src/vetdietderm_api/appointments/repository.py` | Once payment of a recorded amount commits, the amount and paid flag remain unchanged by a competing amount edit. |
| **PostgreSQL** | **Install and upgrade the database with Alembic** (`FEAT-API-PG-MIGRATIONS`)<br>Checks: `CHECK-API-PG-ALEMBIC` | `apps/api/alembic/env.py`<br>`apps/api/alembic/versions`<br>`apps/api/src/vetdietderm_api/appointments/repository.py` | Both a fresh database and a database upgraded from an earlier revision reach the repository head and serve clinical reads and writes. Upgrades retain existing records, initialize new fields, and enforce the charge constraint. |
| **PostgreSQL** | **Gate dependent web startup on migration and API readiness** (`FEAT-API-PG-READINESS`)<br>Checks: `CHECK-API-PG-COMPOSE-READINESS` | `infra/docker-compose.yml`<br>`apps/api/src/vetdietderm_api/main.py`<br>`apps/api/src/vetdietderm_api/db.py` | A reachable database with a pending migration cannot make the API healthy. The API is listening and can use the migrated database before the web services start. |
| **Telegram** | **Accept private Telegram updates and persist a clinic conversation** (`FEAT-API-TELEGRAM-INBOUND`)<br>Checks: `CHECK-API-TELEGRAM-WEBHOOK`, `CHECK-API-TELEGRAM-CONVERSATION` | `apps/api/src/vetdietderm_api/telegram`<br>`apps/api/src/vetdietderm_api/messaging/intake.py`<br>`apps/api/src/vetdietderm_api/messaging/router.py` | The authorized private update is stored once, its latest accepted edit is visible in the clinic conversation, and another clinic cannot read that conversation. |
| **Telegram** | **Deliver a staff reply once with a durable status** (`FEAT-API-TELEGRAM-OUTBOUND`)<br>Checks: `CHECK-API-TELEGRAM-DELIVERY`, `CHECK-API-TELEGRAM-UNCONFIRMED`, `CHECK-API-TELEGRAM-LIVE` | `apps/api/src/vetdietderm_api/messaging/router.py`<br>`apps/api/src/vetdietderm_api/messaging/delivery.py`<br>`apps/api/src/vetdietderm_api/owners/telegram.py`<br>`apps/api/src/vetdietderm_api/owners/clinic_bots.py` | A send with the current bot and a qualifying inbound message is queued once per idempotency key. Telegram acceptance marks it sent. An ambiguous attempt remains unconfirmed across restart. |

### Included

- Clinical records, appointments and attachment persistence through FastAPI.
- Nutrition catalog, assessment and saved diet plan snapshots.
- Clinic access controls and staff handling of stored owner visit requests.
- Clinic bot webhook intake, Telegram conversation persistence and durable staff reply delivery.
- Targeted PostgreSQL correctness checks for competing writes, Alembic migrations, and API readiness during migration.

### Excluded / not Core

- Existing API fixtures exercise ORM-created schemas. The targeted migration and readiness checks use separate Alembic and Compose environments.
- Live Telegram verification runs manually against a dedicated bot. Use a synthetic message and a consenting test sender.

### Real dependencies

- FastAPI and SQLAlchemy
- PostgreSQL for clinical and nutrition integration
- Temporary attachment filesystem
- In-process FEDIAF 2025 provider
- Alembic for schema changes
- Docker Compose for startup checks
- Telegram Bot API for the manual round trip

### Stubbed dependencies

- **module-auth**: The fixtures provide synthetic users and clinic roles without calling the external service.
- **Telegram Bot API**: Automated PostgreSQL checks control Telegram responses and inject repeatable transport outcomes.

### Exclusions and residual risk

| Exclusion | Residual risk | Owner / decision |
|---|---|---|
| EXCL-API-PG-PRODUCTION: Production systems, production credentials and production data | Disposable environments do not establish the effective settings or operational health of the deployed database. | unassigned / `approved` |
| EXCL-API-PG-PERFORMANCE: Query latency, query counts and index effectiveness | Correctness results provide no workload-based performance or capacity evidence. | unassigned / `approved` |

## Execution matrix — when each check runs

`B` blocks the event · `✓` runs without blocking · `—` not scheduled. All mandatory Core smoke apply regardless of changed-file filters.

| Module | Check IDs | Local | PR | Main | Nightly | Release | Post-deploy |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Clinical workflow** | `CHECK-API-CLINICAL` | — | B | B | — | B | — |
| **Nutrition** | `CHECK-API-NUTRITION` | — | B | B | — | B | — |
| **Authorization** | `CHECK-API-CLINIC-ACCESS` | — | B | B | — | B | — |
| **PostgreSQL** | `CHECK-API-PG-NUTRIENTS-CONCURRENT`, `CHECK-API-PG-VISIT-CONFIRM-CONCURRENT`, `CHECK-API-PG-CHARGE-CONCURRENT`, `CHECK-API-PG-ALEMBIC` | — | ✓ | ✓ | — | ✓ | — |
| **PostgreSQL** | `CHECK-API-PG-COMPOSE-READINESS` | — | — | — | — | ✓ | — |
| **Telegram** | `CHECK-API-TELEGRAM-WEBHOOK`, `CHECK-API-TELEGRAM-CONVERSATION`, `CHECK-API-TELEGRAM-DELIVERY`, `CHECK-API-TELEGRAM-UNCONFIRMED` | — | B | B | — | B | — |
| **Telegram** | `CHECK-API-TELEGRAM-LIVE` | ✓ | — | — | — | — | — |

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
    postgresql/
    telegram/
  api/
    clinical-workflow/
    nutrition/
    authorization/
    postgresql/
    telegram/
  integration/
    clinical-workflow/
    nutrition/
    authorization/
    postgresql/
    telegram/
  e2e/
    clinical-workflow/
    nutrition/
    authorization/
    postgresql/
    telegram/
  secure/
    clinical-workflow/
    nutrition/
    authorization/
    postgresql/
    telegram/
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

**Implementation:** `implemented` · **test_ref:** `tests/integration/test_clinical_workflow.py::test_clinical_records_persist_across_requests_and_attachment_storage`

## CHECK-API-NUTRITION — Assess a ration, save a plan, rename its food and then explicitly replace the plan snapshot.

**Module / Feature:** Nutrition / `FEAT-API-NUTRITION` · **Level:** `integration` · **Core smoke:** `True`

**Expected:** The old food name and input hash survive the catalog edit. Replacement keeps the plan ID and records the new inputs and provider metadata.

**Independent oracle:** Project snapshot contract, fixed original and replacement inputs and independent reads of the saved plan.

**Test data:** Synthetic patient, seeded nutrients, one catalog food and a disposable ration.

**real:** `FastAPI ASGI routes`, `PostgreSQL`, `In-process FEDIAF 2025 provider`

**stubbed:** `module-auth`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/integration/test_nutrition_workflow.py::test_catalog_assessment_and_diet_plan_snapshot_are_integrated`

## CHECK-API-CLINIC-ACCESS — Compare access to a client record for its clinic, another clinic and a viewer.

**Module / Feature:** Authorization / `FEAT-API-CLINIC-ACCESS` · **Level:** `integration` · **Core smoke:** `True`

**Expected:** The other clinic sees an empty list and receives 404 for direct reads and writes. Viewer creation returns 403 and the original record remains readable.

**Independent oracle:** Clinic and role assignments fixed in the fixture and the documented clinic and viewer access rules.

**Test data:** Synthetic clinic memberships, sessions and client record.

**real:** `FastAPI ASGI authorization and client routes`, `PostgreSQL`

**stubbed:** `module-auth`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/integration/test_multi_user_boundaries.py::test_tenant_boundaries_and_parallel_refresh`

## CHECK-API-PG-NUTRIENTS-CONCURRENT — Submit two overlapping PUT replacements for the same food without existing as-fed rows, using separate admin sessions and independently committed transactions.

**Module / Feature:** PostgreSQL / `FEAT-API-PG-NUTRIENTS` · **Level:** `integration` · **Core smoke:** `False`

**Expected:** Both requests complete successfully. Direct SQL finds exactly set A or set B, including correct values and no duplicates. A pre-existing value on another basis is unchanged.

**Independent oracle:** The replacement endpoint and documented nutrient identity, with fixed payloads that have a shared nutrient with different values and one distinct nutrient each. Compare all physical as-fed rows to the specified payloads, independent of the API read mapper.

**Test data:** One synthetic food, three known nutrients, one value on a different basis, and two admin sessions. Synchronize at the write boundary without replacing the repository or SQL statements.

**real:** `FastAPI catalog route`, `PostgreSQL transactions and row locks`

**stubbed:** `module-auth`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:**

**Implementation:** `planned` · **test_ref:** `not implemented`

## CHECK-API-PG-VISIT-CONFIRM-CONCURRENT — Use two authorized staff sessions to submit overlapping confirmations of one pending request, with different valid appointment times.

**Module / Feature:** PostgreSQL / `FEAT-API-PG-CONFIRMATION` · **Level:** `integration` · **Core smoke:** `False`

**Expected:** One confirmation succeeds and the other returns 409. A fresh database read finds one accepted registration, one scheduled appointment linked to the original request with the winning time, and one gallery copy of the uploaded file.

**Independent oracle:** The Booking by Problem atomic confirmation contract, the original request ID, two fixed times, and independent counts of the linked appointment and copied attachment.

**Test data:** One pending registration, one animal, one visit request with a synthetic PDF, and two editor sessions in the same clinic.

**real:** `FastAPI visit routes`, `PostgreSQL transactions and row locks`, `Temporary attachment filesystem`

**stubbed:** `module-auth`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:**

**Implementation:** `planned` · **test_ref:** `not implemented`

## CHECK-API-PG-CHARGE-CONCURRENT — Start an amount edit while a separate transaction holds the appointment lock and is marking the original amount paid. Confirm the editor reached the write boundary before releasing the paying transaction.

**Module / Feature:** PostgreSQL / `FEAT-API-PG-CHARGE` · **Level:** `integration` · **Core smoke:** `False`

**Expected:** Payment succeeds. The overlapping edit returns 422. A fresh SQL read returns the original amount and paid true, and the linked owner sees that same paid amount.

**Independent oracle:** The Booking by Problem rule that payment freezes the amount, fixed distinct ruble amounts, and independent persisted row and owner-facing reads.

**Test data:** One completed appointment linked to an owner, one recorded unpaid amount, and two editor sessions in the same clinic.

**real:** `FastAPI appointment and owner routes`, `PostgreSQL transactions and row locks`

**stubbed:** `module-auth`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:**

**Implementation:** `planned` · **test_ref:** `not implemented`

## CHECK-API-PG-ALEMBIC — Upgrade a fresh database to head. In a separate database, migrate to 0039_owner_problem_request, seed a legacy appointment linked to a visit request, then upgrade to head and rerun the upgrade.

**Module / Feature:** PostgreSQL / `FEAT-API-PG-MIGRATIONS` · **Level:** `integration` · **Core smoke:** `False`

**Expected:** Both databases report the repository Alembic head and support an appointment read and write via FastAPI. Legacy IDs, relationship, time and status are retained, with amount_rub NULL and paid false after upgrade. In both databases a direct write marking an appointment paid without an amount is rejected by ck_appointments_charge.

**Independent oracle:** Project schema and deployment contract, the legacy defaults and named constraint in 0040_visit_charge.py, and fixed pre-upgrade rows checked directly after applying the real migration chain.

**Test data:** Two disposable databases. Seed the legacy appointment and its dependencies with SQL valid at the earlier revision.

**real:** `Alembic`, `PostgreSQL`, `FastAPI appointment routes`

**stubbed:** `module-auth`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:**

**Implementation:** `planned` · **test_ref:** `not implemented`

## CHECK-API-PG-COMPOSE-READINESS — Start Compose with the owner profile while a controlled PostgreSQL lock delays a real pending migration and ordinary SELECT 1 remains successful. Observe a healthcheck attempt before releasing the lock.

**Module / Feature:** PostgreSQL / `FEAT-API-PG-READINESS` · **Level:** `e2e` · **Core smoke:** `False`

**Expected:** The API is not healthy and dependent web services do not start while migration is held. After release the database reaches head, the API responds to HTTP, and both web services can proxy a database-backed API request with a synthetic staff or owner session as appropriate.

**Independent oracle:** Project Alembic startup order and the API-health dependency declared by both web services. Compare observed container state, the independently read Alembic revision and proxied HTTP responses.

**Test data:** Isolated Compose project and network, fresh attachment volume, test-only credentials, synthetic staff and owner and one controlled PostgreSQL lock released during cleanup.

**real:** `Docker Compose`, `Alembic`, `PostgreSQL`, `Uvicorn`, `Web API proxies`

**stubbed:** `module-auth`

**Schedule:** `release_candidate` · **Blocking:**

**Implementation:** `planned` · **test_ref:** `not implemented`

## CHECK-API-TELEGRAM-WEBHOOK — Send authorized and unauthorized webhook requests with private and non-private synthetic updates and replay a private update.

**Module / Feature:** Telegram / `FEAT-API-TELEGRAM-INBOUND` · **Level:** `integration` · **Core smoke:** `True`

**Expected:** Invalid credentials and unsupported updates add no rows. The authorized private update is durable and a replay leaves one stored update.

**Independent oracle:** Telegram Bot Gateway PRD, fixed synthetic update IDs and independent PostgreSQL reads.

**Test data:** Dedicated synthetic clinics, bots and private updates.

**real:** `FastAPI webhook route`, `PostgreSQL`

**stubbed:** `module-auth`, `Telegram Bot API`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/integration/postgres/test_telegram_intake.py::test_private_telegram_updates_are_committed_once`

## CHECK-API-TELEGRAM-CONVERSATION — Process completed private updates with duplicate messages and out-of-order edits in a database migrated to head.

**Module / Feature:** Telegram / `FEAT-API-TELEGRAM-INBOUND` · **Level:** `integration` · **Core smoke:** `True`

**Expected:** One contact and conversation hold each message once with the latest accepted edit. A staff member in another clinic receives 404.

**Independent oracle:** Client Contacts and Messaging Domain PRD, explicit expected message bodies and independent PostgreSQL and staff API reads.

**Test data:** Synthetic private updates with fixed message IDs, timestamps and edit order.

**real:** `Alembic`, `PostgreSQL`, `Business intake worker`, `FastAPI staff API`

**stubbed:** `module-auth`, `Telegram update input`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/integration/postgres/test_conversation_intake.py::test_messages_deduplicate_and_keep_the_newest_edit`

## CHECK-API-TELEGRAM-DELIVERY — Submit a staff reply twice with one key. Try sending as a viewer and to contacts lacking inbound from the current bot. Process a Telegram acceptance.

**Module / Feature:** Telegram / `FEAT-API-TELEGRAM-OUTBOUND` · **Level:** `integration` · **Core smoke:** `True`

**Expected:** The first eligible send returns 201 and the replay returns 200 with the same ID. Ineligible contacts return 422 and a viewer gets 403. The worker records sent with the accepted Telegram message ID.

**Independent oracle:** Outbound-delivery acceptance criteria, fixed response from the Telegram HTTP stub and independently read PostgreSQL rows.

**Test data:** Synthetic clinic bot, current and former inbound messages, staff roles and sample PDF.

**real:** `FastAPI staff API`, `PostgreSQL`, `Delivery worker`, `Temporary attachment filesystem`

**stubbed:** `module-auth`, `Telegram Bot API`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/integration/postgres/test_outbound_delivery.py::test_staff_composition_and_send_gate`

## CHECK-API-TELEGRAM-UNCONFIRMED — Interrupt result handling after committing the outbound attempt and run the worker again.

**Module / Feature:** Telegram / `FEAT-API-TELEGRAM-OUTBOUND` · **Level:** `integration` · **Core smoke:** `True`

**Expected:** The worker leaves the stored message unconfirmed and calls Telegram only once. Explicit retry returns 409.

**Independent oracle:** Outbound-delivery issue rule for ambiguous results, recorded call count and independently read PostgreSQL status.

**Test data:** One synthetic staff reply with an interrupted delivery attempt.

**real:** `FastAPI retry API`, `PostgreSQL`, `Delivery worker`

**stubbed:** `module-auth`, `Telegram Bot API`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/integration/postgres/test_outbound_delivery.py::test_worker_restart_leaves_unconfirmed`

## CHECK-API-TELEGRAM-LIVE — Connect a dedicated bot and verify the HTTPS webhook. Send a unique private message from Telegram, locate it via the staff API, send a reply and replay the same idempotency key.

**Module / Feature:** Telegram / `FEAT-API-TELEGRAM-OUTBOUND` · **Level:** `e2e` · **Core smoke:** `False`

**Expected:** The webhook is active, the clinic API shows exactly one matching inbound message, and Telegram displays exactly one reply while the staff API reports sent.

**Independent oracle:** Matching test text in both the staff API and the independent Telegram client, plus stable outbound ID on replay.

**Test data:** Dedicated test bot, consenting sender, synthetic clinic and a unique text marker.

**real:** `Telegram Bot API`, `Public HTTPS webhook`, `FastAPI`, `PostgreSQL`, `Telegram client`

**stubbed:** `module-auth`

**Schedule:** `local_change` · **Blocking:**

**Implementation:** `planned` · **test_ref:** `not implemented`
