# Аудит неиспользуемого кода и безопасная очистка — 2026-11-02

## Область и исходное состояние

Проверены приложения `apps/clinic-web`, `apps/owner-web`, `apps/api`, все пять
пакетов `packages/`, workspace/lockfiles, Alembic, операторские скрипты,
Docker/Compose и CI. Это аудит технического долга и использования кода;
он не доказывает отсутствие всех функциональных или эксплуатационных дефектов.

До изменений рабочее дерево уже содержало правки
`apps/api/src/vetdietderm_api/attachments/repository.py`,
`apps/api/src/vetdietderm_api/visits/repository.py`,
`apps/api/tests/test_visit_requests.py`, а также новые `.codex/`, `.cursor/`,
миграцию `0034_owner_gallery_ownership.py`, тест этой миграции, предыдущий отчёт
аудита, `docs/issues/` и `infra/b.ps1`. Эти материалы не очищаются и не переписываются.

## Архитектура и реальные точки входа

- Два Next.js App Router host. `page.tsx`, `layout.tsx`, `route.ts`, loading и
  not-found зарегистрированы соглашением файловой системы, а не обычными импортами.
  Clinic `SurfaceBoundary` сохраняет `/join`, `/join/[code]`, `/cabinet` вне staff shell.
- Оба `/api/[...path]` используют `packages/web-proxy`; owner proxy имеет отдельные
  ограничения маршрутов, cookie и CSRF. Транспорт ведёт в FastAPI, а не во второй UI.
- FastAPI: `main.py:create_app`, CLI `main.py:run`; routers подключаются явно.
  `v1.py` регистрирует aliases через копирование APIRoute и обход routes;
  `FILE_HANDLERS` опирается на имена endpoint. Отсутствие обычного вызова функции
  не означает, что endpoint или его имя не используются.
- Staff: browser session → внешний module-auth → workspace/tenant scope →
  доменные repositories → SQLAlchemy/PostgreSQL. Owner: отдельная session,
  doctor binding, паспорта/chat/заявки/файлы. Эти границы при очистке не меняются.
- Nutrition: `STANDARD_REGISTRY` регистрирует provider FEDIAF 2025 при импорте;
  вычисления и данные находятся в `standards/fediaf/v2025`, snapshots сохраняются
  в diet plans. Legacy snapshots читаются через compatibility validators.
- Alembic `env.py` импортирует models для регистрации `Base.metadata`.
  Миграции необходимы для новой БД, существующих deployment и downgrade.
- `packages/api-contract/scripts/generate.mjs` запускает Python export OpenAPI
  и генерирует JSON/TypeScript. `contract.typecheck.ts` включён в tsc без runtime
  импорта. Vitest setup подключён конфигами. Всё это не мёртвые файлы.
- `apps/api/scripts/fetch_products.py` — отдельная операторская точка входа;
  импортирует `scripts/file.py`. Тест нормализатора загружает этот файл через
  `importlib.util`, поэтому он сохраняется.

## Метод и границы доказательств

Проведён AST-обход import/export/string references TypeScript между приложениями
и workspace exports, затем проверка кандидатов по всему репозиторию, конфигам,
CSS, тестам и документации. Проверены dynamic import, Python `__getattr__`,
`import_module`, `getattr`/`setattr`, callbacks и framework registration.
Python AST отдельно проверен на невостребованные импорты и одиночные определения.
Результат статического анализа использовался только как список кандидатов.

Имеющийся `graphify-out/graph.json` содержит 1502 узла и 3474 связи, но устарел:
например, приписывает `assessments/engine.py` реализации, которые теперь вынесены
в provider. CLI недоступен в сохранённом interpreter (`No module named graphify`).
Граф прочитан напрямую как историческая карта, но не использован как доказательство
неиспользования. Пакеты для обновления графа не устанавливались.

## Классификация до изменений

### Безопасные удаления и упрощения

| ID | Файлы / кандидаты | Фактическое основание | Уверенность | Риск / действие |
| --- | --- | --- | --- | --- |
| S1 | `apps/clinic-web/src/shared/ui/{accordion,alert-dialog,collapsible,progress,separator}.tsx` | Нет входящих импортов/re-export, строковых ссылок или регистрации. Это обычные локальные компоненты, не маршруты и не package exports. | Высокая | Низкий; удалить вместе с пятью прямыми Radix dependencies. |
| S2 | `apps/clinic-web/src/shared/hooks/use-toast.ts`, `src/shared/ui/{toast,toaster}.tsx`, `src/app/layout.tsx` | `useToast` потребляет только старый Toaster, а экспортированный `toast` никто не вызывает. Все реальные уведомления вызывают `sonner`. Старый provider монтирует пустое хранилище и подписку. | Высокая | Низкий; удалить старую цепочку и её mount, сохранить Sonner и его вызовы; убрать `@radix-ui/react-toast`. |
| S3 | `apps/clinic-web/src/features/owner-cabinet/components/{animal-files,animal-form,animal-list,contact-fields,doctor-block,visit-request-form}.tsx` | Каждый файл содержит только re-export в общий пакет; ни один не импортируется текущими исходниками/тестами/конфигами. Host routes идут через используемые `cabinet-home`/`join-form`, а shared components используют свои локальные импорты. | Высокая | Низкий; удалить только эти внутренние адаптеры. Публичные маршруты и package exports сохранить. |
| S4 | `apps/clinic-web/package.json`: `z-ai-web-dev-sdk`, `zustand`, `recharts`, `zod` | Нет import/require/dynamic/config использования во всём текущем first-party коде; единственный остаток Recharts — CSS selector. Dependency не является plugin или интеграционной точкой входа. | Высокая | Низкий; убрать прямые зависимости и остаток Recharts CSS. Транзитивный Zod при необходимости других пакетов остаётся в lockfile. |
| S5 | `apps/clinic-web/package.json`: `bun-types` | Workspace/CI/Docker работают через Node/pnpm; Bun API, triple-slash types и `types: ["bun-types"]` отсутствуют. | Высокая | Низкий; убрать ненужные ambient types, подтвердить tsc/build. |
| S6 | `apps/clinic-web/tailwind.config.ts`, dependency `tailwindcss-animate` | PostCSS запускает Tailwind 4; стили приходят из `packages/ui/src/styles.css` через `@import "tailwindcss"` и `tw-animate-css`. Нет `@config`, import или CLI загрузки старого TS-конфига; shadcn `components.json` имеет пустой `tailwind.config`. Установленный compiler загружает JS config только по явному `@config`. | Высокая | Низкий; удалить неактивную v3-конфигурацию и её единственный plugin dependency. Действующие theme/animation CSS сохранить. |
| S7 | `apps/{clinic-web,owner-web}/eslint.config.mjs` | Импорты `dirname`/`fileURLToPath` и вычисленные `__filename`/`__dirname` не используются правилами/settings. | Высокая | Низкий; удалить только эти вычисления. Правила lint не менять. |
| S8 | `apps/api/src/vetdietderm_api/owners/uploads.py` | Импорт `UUID` не используется в annotations, проверках или регистрации. | Высокая | Низкий; удалить один импорт. |
| S9 | `package.json` scripts `compose` / `test:db`, пять примеров README | Указаны отсутствующие `infra/compose.yml` и `infra/compose.test.yml`; реальные конфиги называются `infra/docker-compose.yml` и `infra/docker-compose.test.yml`. Команды не могут открыть конфигурацию. | Высокая | Низкий; исправить только ссылки, существующие Compose services/порты/параметры не менять. |
| S10 | `apps/clinic-web/src/features/{clinical-builder,encounters,nutrition}/hooks.ts`: `useUpdateEncounterTemplate`, `useUpdateClinicalCatalogItem`, `useUpdateCommunication`, `useGuidelineContextOptions` | AST-проверка экспортированных функций и поиск по исходникам/конфигам/тестам дают только определения. Нет dynamic registration или namespace lookup этих hooks; это внутренние модули приложения без package exports. | Высокая | Низкий; удалить четыре обёртки React Query. HTTP endpoints и методы API сохранить. |

### Рекомендуемый рефакторинг — в этом изменении не выполняется

| ID | Файлы | Причина и практическая польза | Уверенность | Риск / предварительная проверка |
| --- | --- | --- | --- | --- |
| R1 | `packages/api-client/src/{index,http}.ts`, `apps/clinic-web/src/shared/api/client.ts` | Сосуществуют typed OpenAPI client и JSON facade; дублируются ошибки, fetch и recovery. Унификация уменьшит расхождение transport semantics. | Высокая | Средний/высокий: различаются audience rules, legacy/v1 paths, multipart/blob, обработка ошибок и recovery. Нужны отдельный план и подтверждение перед изменением. |
| R2 | `apps/api/src/vetdietderm_api/{attachments/storage,owners/uploads,visits/repository,chat/repository}.py` | Ограничения формата/размера, сигнатуры и очистка файлов повторяются в нескольких сценариях. Можно сократить расхождение правил без переноса ACL. | Высокая | Средний/высокий: различаются владение, транзакции и компенсация файлов. `visits/repository.py` уже изменён пользователем. Нужны отдельный review и failure-path tests. |
| R3 | `apps/clinic-web/src/app/_components/encounter-workspace.tsx`, `features/nutrition/components/nutrition-workspace.tsx`, `features/clinical-builder/model.ts` | Крупные модули объединяют много состояний, преобразований и взаимодействий. Возможна точечная декомпозиция по существующим обязанностям. | Средняя | Средний: autosave и клинические вычисления чувствительны к порядку обновления. Не делить механически по длине файла. |
| R4 | `README.md` | Раздел структуры утверждает, что `apps/owner-web` ещё не создан, хотя соседние разделы уже документируют его запуск; текст обещает активный CI при закомментированном workflow. | Высокая | Низкий; привести описание структуры и проверок в соответствие текущему workspace. |

### Спорные случаи / сохранить

| ID | Файлы | Почему не удалено | Следующая проверка |
| --- | --- | --- | --- |
| K1 | `apps/clinic-web/src/app/{join,cabinet}`, используемые owner adapters | Документированная совместимость старых URL и host-only sessions; есть реальные точки входа. | Проверить production reverse proxy, действующие приглашения и статистику обращений перед отдельным удалением. |
| K2 | `apps/api/src/vetdietderm_api/{v1,auth}.py`, unversioned routers | HTTP-контракты legacy и v1 одновременно зарегистрированы и протестированы; нельзя объявлять legacy API мёртвым по отсутствию новых импортов. | Инвентаризация внешних клиентов и согласованная deprecation policy. |
| K3 | `assessments/{engine,ast,schemas,plans}.py`, `catalog/energy.py` | Compatibility exports, сохранённые snapshots, старые units. `plans.assess_nutrition` намеренно существует как hook для legacy snapshot test. | Проверить внешних Python callers и persisted data; усилить test hook в отдельной задаче, не менять тест ради удаления импорта. |
| K4 | `guidelines/models.py`, Alembic imports/revisions, archived guideline schema | ORM registration имеет side effects; metadata tables и migration history остаются частью схемы. Тест явно проверяет наличие metadata tables. | Отдельный schema/data retirement с backup и подтверждением. |
| K5 | `packages/owner-features/src/platform/telegram.ts`, Telegram host/provider/API | Telegram adapter реально выбирается host; редкие платформенные ветви не являются dead code. | HTTPS smoke в реальных Telegram clients. |
| K6 | `sharp`, `python-multipart`, `psycopg`, `uvicorn[standard]` | Framework/runtime dependencies используются не обязательно прямым импортом: Next image pipeline, multipart parsing, DB dialect, server extras. | Оставить; прямой поиск импортов недостаточен для удаления. |
| K7 | `.github/workflows/ci.yml` | Весь workflow закомментирован; до аудита README обещал CI, но активных jobs в репозитории нет. Описание исправлено; workflow не удалялся и не включался. | P1: согласовать восстановление CI и добавить проверку owner image. Путь `infra/docker-compose.yml` в закомментированном job соответствует существующему файлу. |
| K8 | `apps/clinic-web/src/app/globals.css` | Есть исторические стили audio/print/animation. Часть классов может формироваться динамически; импорт не доказывает использование каждого selector. | Coverage CSS по экранам/темам/печати и визуальная проверка перед массовым удалением. |
| K9 | `apps/api/scripts/file.py`, `packages/api-client/src/contract.typecheck.ts`, Vitest setup, generator | Подключение из операторского скрипта, importlib, tsc include, конфигов и package scripts подтверждено. | Сохранить. |

## Реализация и проверки

Основной список зафиксирован до production-изменений; S9 дополнен после проверки
интеграционных команд, S10 — после дополнительного анализа экспортов, до внесения
соответствующих изменений. Выполнены S1–S10 и исправление
устаревшего описания README (R4). R1–R3 и K1–K9 оставлены без изменения поведения.

Базовые проверки до очистки: `pnpm check` — PASS; `pnpm test:web` — 89 PASS
(10 api-client, 47 clinic, 32 owner). Первый запуск Vitest получил Windows EPERM
при rename во временной папке sandbox; повтор с TEMP/TMP в `.tmp/audit-temp`
прошёл без изменения тестов или конфигурации приложения.

### Выполненные изменения

- Удалены 15 файлов: пять UI-примитивов, три файла старой toast-системы,
  шесть невостребованных внутренних owner re-export и неактивный Tailwind config.
- Удалены четыре неиспользуемых React hook из трёх feature-модулей.
- Удалены 12 прямых dependencies/devDependencies Clinic UI. Штатный pnpm
  удалил 43 ненужных package entries; lockfile сократился на 500 строк,
  версии оставшихся пакетов не обновлялись.
- Сохранены действующие Sonner notifications, package exports, legacy/v1 HTTP
  endpoints, DTO/OpenAPI, migrations, provider registry и compatibility readers.
- Удалены остаточный Recharts CSS, неиспользуемые вычисления в двух ESLint
  конфигах и один Python import. Правила lint, тесты и их assertions не менялись.
- Исправлены пути в двух root scripts, пяти Compose-примерах README и описание
  структуры/фактического состояния CI. Образы и deployment не запускались.

### Результаты проверок после изменений

| Проверка | Результат |
| --- | --- |
| `pnpm install --lockfile-only --ignore-scripts --fetch-retries=0` | PASS вне sandbox с доступом к npm metadata; supply-chain policy check прошёл. Offline-попытка до этого не смогла получить отсутствующие metadata. |
| `pnpm install --frozen-lockfile --offline --ignore-scripts` | PASS вне sandbox; node_modules синхронизирован, 43 пакета исключены. В sandbox операция упиралась в Windows symlink EPERM. |
| `pnpm install --frozen-lockfile --lockfile-only --offline --ignore-scripts` | PASS; повторного изменения lockfile нет. |
| `pnpm check` | PASS для workspace: TypeScript и ESLint. После последнего удаления hooks проверка Clinic повторена отдельно. |
| `pnpm test:web` | PASS: 89 tests, 21 files (10 api-client, 47 clinic, 32 owner). После последнего удаления hooks 47 Clinic tests повторены. |
| `uv run --directory apps/api --cache-dir .tmp/uv-cache pytest --ignore=tests/integration -q -o faulthandler_timeout=60` | PASS вне sandbox: 142 tests за 34.69 s. Первый sandbox-прогон завис и остановлен; тесты не изменялись. Остаётся один StarletteDeprecationWarning о httpx/httpx2. |
| `pnpm api:check` | PASS; JSON OpenAPI и generated TypeScript совпадают с текущим сервером. |
| `DOCKER_BUILD=1` + `node node_modules/next/dist/bin/next build` из каждого web host | PASS с системным Node 24.13.1 и Turbopack: оба production/standalone build, typecheck, prerender; `standalone/apps/<host>/server.js` существует. Clinic повторно собран после удаления hooks. |
| `pnpm build` через предоставленную pnpm-обёртку | FAIL: child process Turbopack завершался до соединения при PostCSS. В sandbox также недоступны Google Fonts. Повтор вне sandbox через обёртку воспроизвёл child-process error; прямой запуск того же Next CLI системным Node собрал оба host. Обёртка/конфиги сборки не менялись, root-команда не объявляется успешной. |
| Локальный production HTTP smoke каждого host в отдельном Node process | PASS: `/join`, `/cabinet` и CSS — 200 в обоих host; Clinic `/patients` — 200; owner `/patients` и `/api/patients` — 404. Первый вариант harness с двумя Next apps в одном процессе дал CSS 404 второго host; раздельные процессы устранили конфликт harness. Это не browser/E2E проверка всех клинических сценариев. |
| `uv build --project apps/api --cache-dir .tmp/uv-cache --out-dir .tmp/audit-api-dist --offline` | PASS: sdist и wheel. Первая попытка без явного cache-dir получила отказ доступа к глобальному `C:/uv/cache`; повтор использовал cache проекта. |
| `docker compose --env-file infra/.env.example -f infra/docker-compose.yml --profile owner config --quiet` | PASS; конфигурация deployment, включая owner profile, валидна. |
| `pnpm test:db config --quiet` | PASS; исправленная root-команда открывает реальный test Compose config. |
| `PGCONNECT_TIMEOUT=5` + `uv run --directory apps/api --cache-dir .tmp/uv-cache pytest tests/integration -q --tb=short --maxfail=1` | BLOCKED: первый fixture не подключился к настроенному PostgreSQL, `psycopg.errors.ConnectionTimeout`; 1 setup error, тесты не выполнены. Остальные три integration tests не запускались после первого сбоя. |
| Docker daemon / container build | BLOCKED: отсутствует pipe `dockerDesktopLinuxEngine`. Образы не собирались, тестовый PostgreSQL через Docker запустить невозможно. |
| Python lint/typecheck | В pyproject и CI нет настроенных Ruff/mypy/pyright задач; такие проверки не заявляются пройденными. Новые инструменты и зависимости не добавлялись. |
| `git diff --check`, повторный AST-анализ импортов | PASS. Остались только кандидаты с подтверждёнными config/script/tsc entry points (Vitest setup, contract typecheck, generator). |

### Оставшиеся риски и приоритеты

1. **P1 — восстановить воспроизводимую автоматическую проверку.** Согласовать
   включение CI, PostgreSQL integration и Docker build обоих host. Устранить
   различие между root pnpm build и прямым Next CLI в окружении разработки.
2. **P2 — сократить дублирование transport.** Отдельно спланировать R1, покрыть
   recovery/audience/blob/multipart/error semantics и только затем объединять.
3. **P2 — согласовать правила файлов.** Разобрать R2 после текущей пользовательской
   работы над visits/attachments; отдельно проверить ACL, rollback и file cleanup.
4. **P3 — убрать compatibility только после инвентаризации потребителей и данных.**
   Нужны production URL/session usage, внешние API/Python callers и анализ
   сохранённых snapshots. Переход не должен терять старые записи.
5. **P3 — точечная декомпозиция и CSS coverage.** R3 и исторические стили чистить
   по конкретным изменениям поведения с визуальными проверками, включая печать.
   Обновить устаревший graphify snapshot отдельным запуском, когда доступен runtime.

Вывод о сохранении поведения подтверждён доступными тестами, контрактом, сборками
и HTTP smoke, но не полным PostgreSQL integration, Docker deployment или реальными
Telegram clients. Коммиты, миграции существующей БД и публикация не выполнялись.
