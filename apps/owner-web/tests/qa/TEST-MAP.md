# Vet Space Owner Web — Test Map

> Source: repository not supplied · ref `0308862f9d870ce387a7dbb9cc0055a6796906d0`

## Short Review

| Parameter | Value |
|---|---|
| Core domains | Clinic-scoped cabinet access · Owner visit submission and recovery |
| Core selection approval | `pending` |
| Scope approval | `pending` |
| Plan | **4 features, 4 checks, 1 Core smoke** |
| Execution status | **PLANNED only** — this map does not execute tests or prove PASS |

## Testing scope and boundaries

| Module | Feature | Place (file / API / method / class) | Expected results |
|---|---|---|---|
| **Owner identity** | **Sign in via a clinic invitation** (`FEAT-OWNER-CLINIC-SESSION`)<br>Checks: `CHECK-OWNER-CLINIC-SIGN-IN` | `apps/owner-web/src/app/join/[code]/page.tsx`<br>`apps/owner-web/src/app/cabinet/page.tsx`<br>`packages/owner-features/src/components/join-form.tsx` | The invitation shows the selected clinic. Sign-in sends its code and enters its cabinet. |
| **Owner visits** | **Create a request and recover from a partial upload failure** (`FEAT-OWNER-VISIT`)<br>Checks: `CHECK-OWNER-VISIT-FORM` | `packages/owner-features/src/components/visit-request-form.tsx`<br>`packages/owner-features/src/api.ts` | A nonblank problem is required, only answered questions are sent, and retry uploads only failed files. |
| **Owner HTTP proxy** | **Scope credentials and prevent caching for private downloads** (`FEAT-OWNER-PROXY`)<br>Checks: `CHECK-OWNER-PROXY` | `apps/owner-web/src/app/api/[...path]/route.ts`<br>`packages/web-proxy/src/index.ts` | The proxy forwards only the owner cookie and preserves download bytes with no-store caching policy. |
| **Owner cabinet** | **Sign in and submit a request through the deployed application paths** (`FEAT-OWNER-CABINET-TO-VISIT`)<br>Checks: `CHECK-OWNER-CABINET-TO-VISIT` | `apps/owner-web/src/app/cabinet/page.tsx`<br>`apps/owner-web/src/app/api/[...path]/route.ts`<br>`apps/api/src/vetdietderm_api/owners/router.py`<br>`apps/api/src/vetdietderm_api/visits/router.py` | A request for a pet from the invited clinic remains visible after the cabinet reloads. |

### Included

- Clinic-scoped sign-in and cabinet access from an invitation link.
- Owner visit form, optional questionnaire answers and attachment retry.
- Request and response handling in the owner proxy.

### Excluded / not Core

- Live Telegram, staff workflows, accessibility audits and performance budgets are outside this initial draft.

### Real dependencies

- Owner React components and transport
- Next.js request objects and owner proxy handler
- Chromium and the isolated API stack for E2E

### Stubbed dependencies

- **Upstream owner API**: Current component and proxy checks supply controlled responses or API method stubs.
- **Browser platform navigation**: Current sign-in test observes the requested navigation through a fake adapter.

## Execution matrix — when each check runs

`B` blocks the event · `✓` runs without blocking · `—` not scheduled. All mandatory Core smoke apply regardless of changed-file filters.

| Module | Check IDs | Local | PR | Main | Nightly | Release | Post-deploy |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Owner identity** | `CHECK-OWNER-CLINIC-SIGN-IN` | ✓ | ✓ | — | — | — | — |
| **Owner visits** | `CHECK-OWNER-VISIT-FORM` | ✓ | ✓ | — | — | — | — |
| **Owner HTTP proxy** | `CHECK-OWNER-PROXY` | ✓ | ✓ | — | — | — | — |
| **Owner cabinet** | `CHECK-OWNER-CABINET-TO-VISIT` | — | B | B | — | B | — |

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
    owner-identity/
    owner-visits/
    owner-http-proxy/
    owner-cabinet/
  api/
    owner-identity/
    owner-visits/
    owner-http-proxy/
    owner-cabinet/
  integration/
    owner-identity/
    owner-visits/
    owner-http-proxy/
    owner-cabinet/
  e2e/
    owner-identity/
    owner-visits/
    owner-http-proxy/
    owner-cabinet/
  secure/
    owner-identity/
    owner-visits/
    owner-http-proxy/
    owner-cabinet/
  _support/                # disposable fixtures and cleanup
```

`mock` is a test double, not a test level. `security` is a cross-cutting dimension and may instead be applied as a tag. Keep colocated existing tests unless there is a reason to migrate.

## Check details

> Generated from `test-map.yaml`. Expected results are a plan, not evidence of passing tests.

## CHECK-OWNER-CLINIC-SIGN-IN — Open clinic A's invitation while the controlled session response identifies clinic B, then sign in to clinic A.

**Module / Feature:** Owner identity / `FEAT-OWNER-CLINIC-SESSION` · **Level:** `integration` · **Core smoke:** `False`

**Expected:** Clinic A is displayed, clinic B is absent, the login sends clinic A's code and the navigation adapter receives /cabinet.

**Independent oracle:** Clinic-link contract in docs/PROJECT.md and fixed clinic codes and headings from the test fixture.

**Test data:** Two synthetic clinic codes and disposable test credentials.

**real:** `Join form`, `React DOM interaction`, `Owner HTTP client`

**stubbed:** `Upstream owner API`, `Browser platform navigation`

**Schedule:** `local_change`, `pull_request` · **Blocking:** 

**Implementation:** `implemented` · **test_ref:** `tests/integration/owner-scenarios.test.tsx`

## CHECK-OWNER-VISIT-FORM — Submit the selected animal's problem with partial answers, then exercise the file retry case.

**Module / Feature:** Owner visits / `FEAT-OWNER-VISIT` · **Level:** `integration` · **Core smoke:** `False`

**Expected:** A blank problem prevents submission. The submitted body contains the proposed time and answered question with no visit type. Retrying a failed file creates no second request.

**Independent oracle:** Booking by Problem PRD and fixed request payload and upload sequence asserted in the component tests.

**Test data:** Synthetic pet, two questionnaire items and in-memory uploads.

**real:** `Visit form`, `React DOM interaction`

**stubbed:** `Owner API methods`

**Schedule:** `local_change`, `pull_request` · **Blocking:** 

**Implementation:** `implemented` · **test_ref:** `tests/integration/visit-request-form.test.tsx`

## CHECK-OWNER-PROXY — Stream a private owner file through the proxy handler with synthetic staff and owner credentials in the request.

**Module / Feature:** Owner HTTP proxy / `FEAT-OWNER-PROXY` · **Level:** `integration` · **Core smoke:** `False`

**Expected:** Only the owner cookie reaches the upstream request. The file bytes are preserved and Cache-Control is no-store.

**Independent oracle:** Owner proxy contract in docs/architecture/owner-web.md and independently specified input cookies and stubbed response bytes.

**Test data:** Synthetic cookies and in-memory PDF response.

**real:** `Owner proxy handler`, `NextRequest`, `Response stream`

**stubbed:** `Upstream fetch`

**Schedule:** `local_change`, `pull_request` · **Blocking:** 

**Implementation:** `implemented` · **test_ref:** `tests/secure/owner-boundary.test.ts`

## CHECK-OWNER-CABINET-TO-VISIT — In a browser, sign in via a clinic invitation, submit a request for that clinic's pet and reload the cabinet.

**Module / Feature:** Owner cabinet / `FEAT-OWNER-CABINET-TO-VISIT` · **Level:** `e2e` · **Core smoke:** `True`

**Expected:** The invited clinic opens. The chosen pet shows one persisted request with the submitted problem and time, in requested status with no confirmed time or visit type. The other pet has no requests.

**Independent oracle:** Clinic-link and Booking by Problem contracts, fixed clinic and pet fixtures, and separate reads of both pets' requests after navigation.

**Test data:** Seeded disposable clinic, unique synthetic owner, two pets, and a synthetic problem and proposed time.

**real:** `Browser`, `Next.js application and owner proxy`, `FastAPI`, `PostgreSQL`

**Schedule:** `pull_request`, `main_push`, `release_candidate` · **Blocking:** `pull_request`, `main_push`, `release_candidate`

**Implementation:** `implemented` · **test_ref:** `tests/e2e/test_cabinet_to_visit.py`
