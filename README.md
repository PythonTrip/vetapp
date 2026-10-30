# VetDietDerm

Ветеринарное рабочее место для пациентов, приёмов и диетологии. Первый сегмент — дерматологи и нутрициологи. Специализации подключаются шаблонами и инструментами на общем клиническом ядре, а не отдельными приложениями.

Продукт не заменяет клиническое решение врача. Оценка рациона показывает источник и версию методики и оставляет решение специалисту.

## Что уже работает

Навигация: **Пациенты**, **Расписание**, **Приём**, **Питание**, **Настройки**.

- клиент и пациент как отдельные сущности;
- приём со структурированным анамнезом и осмотром, диагнозами и VAS;
- шаблоны приёма и клинический справочник полей;
- расписание записей;
- галерея (файлы на диске, метаданные в PostgreSQL);
- журнал коммуникаций;
- каталог кормов, рацион и оценка по FEDIAF 2025;
- аккаунт и необязательная организация через внешний module-auth.

Кабинет владельца выделен в самостоятельный `apps/owner-web`: приглашение конкретным врачом,
паспорта животных, chat, заявки на визит, анкеты и вложения. Общие модули и адаптеры
browser / telegram, запуск и порядок переноса описаны в [Owner Web](docs/architecture/owner-web.md).
Локальный запуск интерфейса: `pnpm dev:owner`; Clinic UI для него не нужен.

Пока нет: knowledge/AI, проверки препаратов, калькуляторов дозы и инфузии, подписанных приёмов, S3.

## Стек

- Next.js и TypeScript в `apps/clinic-web/` — только интерфейс. Браузер ходит в `/api`, Route Handler проксирует запросы в FastAPI.
- `apps/owner-web/` — отдельный owner host; `packages/owner-features/` содержит единые owner-сценарии для web и будущего Telegram entry point.
- FastAPI и Pydantic в `apps/api/`. Клинические расчёты живут на сервере.
- PostgreSQL, схема через Alembic. Prisma в рантайме нет.
- Нормы FEDIAF 2025 — пакет `vetdietderm_api.standards.fediaf.v2025`, не таблицы SQL.
- Аккаунты — внешний module-auth. Браузер хранит только HttpOnly cookie.

## Локальный запуск

### Docker Compose с существующим PostgreSQL

Compose запускает FastAPI и Next.js. PostgreSQL должен быть уже создан и доступен из контейнера API.

```powershell
Copy-Item infra/.env.example infra/.env
# Заполните DATABASE_ADDRESS, DATABASE_PORT, DATABASE_NAME,
# DATABASE_USER, DATABASE_PASSWORD и MODULE_AUTH_URL в infra/.env.
pnpm compose up -d --build
```

Для PostgreSQL на этом VPS задайте `DATABASE_ADDRESS=host.docker.internal` и опубликованный порт базы (в примере `15432`). Для удалённой базы укажите её DNS-имя/IP и порт (обычно `5432`). `127.0.0.1` внутри контейнера указывает на сам контейнер. PostgreSQL должен разрешать соединения из сети Docker.

`DATABASE_SSLMODE` по умолчанию — `prefer`; для сервера, требующего TLS, задайте `require` или подходящий режим проверки сертификата. Пароль можно записать в одинарных кавычках, чтобы Compose не подставлял переменные вместо символов `$`. Спецсимволы в пароле кодировать как URL не нужно.

Перед запуском API автоматически выполняется `alembic upgrade head` для указанной базы. Frontend запускается после успешной проверки API и подключения к БД. Вложения сохраняются в постоянном томе `attachments`; существующие локальные файлы из `apps/api/data/attachments` в него автоматически не переносятся.

На VPS с несколькими приложениями схема такая:

| Кто | Куда |
| --- | --- |
| nginx `vetapp.syndex-ai.ru` | только `127.0.0.1:3003` (vetapp-frontend) |
| браузер | `https://…/api/*` → Next Route Handler → Docker DNS `vetapp-api` |
| vetapp-frontend | Docker DNS `http://vetapp-api:8000` (сеть `shared-backend`) |
| vetapp-api | Postgres по `DATABASE_ADDRESS` (у вас `pgsql` в `shared-backend`) |
| отладка API с хоста | `127.0.0.1:8001` (в интернет не публиковать) |

Порты на этом хосте (loopback): frontend `3003`, API `8001`; заняты другими стеками `3000`/`3001`/`3002`/`8000`. Имена в общей сети уникальны: `vetapp-api`, `vetapp-frontend` — не используйте короткое `api`, чтобы не пересечься с другими compose-проектами.

Не проксируйте `/api` из nginx на FastAPI. После смены `NEXT_PUBLIC_API_URL` / `API_INTERNAL_URL` пересоберите: `pnpm compose up -d --build`.

Пример nginx только для UI:

```nginx
server {
    server_name vetapp.syndex-ai.ru;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Логи: `pnpm compose logs -f`. Остановка: `pnpm compose down` (том вложений сохраняется).

### Без Docker

Стек: Next.js UI в `apps/clinic-web/`, FastAPI в `apps/api/`, PostgreSQL на `127.0.0.1:15432`. Нужны Node.js 22+, pnpm 11.25.0 и Python 3.13+ (`uv`).

```bash
cp apps/api/.env.example apps/api/.env
cp apps/clinic-web/.env.example apps/clinic-web/.env.local
corepack enable
pnpm install --frozen-lockfile
# заполните DATABASE_* и MODULE_AUTH_URL
# для PostgreSQL на этом компьютере: DATABASE_ADDRESS=127.0.0.1

# API
uv sync --project apps/api
pnpm db:migrate
pnpm dev:api

# UI (второй терминал)
pnpm dev
```

`NEXT_PUBLIC_API_URL` (по умолчанию `/api`) и `API_INTERNAL_URL` (локально `http://127.0.0.1:8000`) читаются из `apps/clinic-web/.env.local` (или других стандартных env-файлов Next.js в этом приложении). UI: `http://127.0.0.1:3000`. API: через Route Handler `/api/*` → FastAPI.

API читает `apps/api/.env`; переменные процесса имеют приоритет. Compose использует отдельный `infra/.env`. Старый `DATABASE_URL` поддерживается и имеет приоритет над отдельными `DATABASE_*`; удалите его из env при переходе на новый формат. В Docker локальные env-файлы не копируются в образы, параметры передаёт Compose.

## Пользователи и организации (module-auth)

Приложение использует `/api` того же origin и серверный BFF в FastAPI.
`MODULE_AUTH_URL=http://127.0.0.1:8321` — адрес локального SSH-туннеля.
Для локальной разработки задайте `AUTH_COOKIE_SECURE=false`; для HTTPS — `true`.
В контейнере адрес auth должен быть доступен из контейнера: loopback хоста там недоступен.
`API_INTERNAL_URL` задаёт адрес VetApp API для Next.js (локально `http://127.0.0.1:8000`).

Перед запуском выполните `uv run alembic upgrade head` из `apps/api`.
Миграция 0022 добавляет `tenant_id`, `created_by` и таблицу серверных сессий.
Старые клинические записи с NULL tenant недоступны новым организациям; автоматического переноса нет.
Общие стандартные шаблоны и каталог продуктов остаются доступны для чтения.
Редактирование общего каталога требует глобальной роли `super_admin`.
Пациенты, приёмы, расписание, вложения, коммуникации, рационы и пользовательские шаблоны
изолированы по организации. Личные шаблоны привязаны к user_id, а не имени врача.
Личное рабочее место использует tenant_id=NULL и created_by=user_id: другие пользователи
не видят эти записи. Старые NULL-записи без created_by по-прежнему недоступны.
В настройках можно выбрать личное рабочее место или общие данные текущей организации.
Выбор передаётся как X-Vetapp-Workspace (personal по умолчанию / organization); API
проверяет членство и роли только для организационного контекста. Личные данные не переносятся
при создании организации и остаются доступны при возвращении в личное рабочее место.
Наблюдатели не могут менять клинические записи; вычисления без сохранения доступны.

Вход и регистрация находятся на стартовом экране. Подтверждение почты — email + 6 цифр.
После входа сразу доступно личное рабочее место; организация необязательна и настраивается в настройках.
В настройках: профиль, название организации, участники, роли, приглашения и выход.
Приглашать можно зарегистрированные аккаунты с подтверждённой почтой.
В module-auth настройте ссылки писем на frontend:
`AUTH_ORG_INVITE_BASE_URL` → `/org-invite?token=` и ссылку восстановления → `/reset-password?token=`
(согласно правилам сборки URL вашей конфигурации сервиса).
Сервис выбирает первую активную организацию; переключение организаций не поддерживается.

Браузер получает только случайный HttpOnly/SameSite cookie; токены находятся в PostgreSQL.
Блокировка строки сессии сериализует обновление токенов между вкладками и процессами API.
Токены никогда не возвращаются браузеру. Защитите доступ и резервные копии БД как секреты.
При неопределённом исходе refresh (сетевой таймаут) требуется повторный вход, чтобы не повторять
одноразовый refresh-токен. Истёкшие строки `browser_sessions` можно периодически удалять по `expires`.
Проверка пользователя и текущей организации идёт через авторитетный `/me` на каждый запрос;
при недоступности module-auth клинический доступ закрывается с 503. Отсутствие организации не блокирует аккаунт.

## Структура и команды монорепозитория

- `apps/api/` — независимый uv-проект: исходники, Alembic, тесты, фикстуры, операторские скрипты и локальные данные.
- `apps/clinic-web/` — существующее Next.js приложение, включая текущие экраны владельца.
- `infra/` — Dockerfile, Compose и параметры deployment. Имя Compose-проекта `vetapp`, сервисы, DNS-алиасы и том `vetapp_attachments` сохранены.
- `packages/api-contract` — типы, генерируемые из FastAPI OpenAPI; `packages/api-client` — общий HTTP-клиент для web и будущего mobile. Генерация: `pnpm api:generate`, проверка актуальности: `pnpm api:check`. [Контракт и настройка платформ](docs/api-contract.md).
- `apps/owner-web` и `apps/mobile` пока не создаются. Python не входит в pnpm workspace.

Из корня: `pnpm dev`, `pnpm dev:api`, `pnpm db:migrate`, `pnpm check`, `pnpm build`, `pnpm test`.
`pnpm test` запускает все web- и Python-тесты, включая PostgreSQL integration; нужна доступная тестовая БД с правом CREATE SCHEMA.
Только модульные Python-тесты: `uv run --directory apps/api pytest --ignore=tests/integration`.
Операторский сбор каталога: `uv sync --directory apps/api --group tools`, затем
`uv run --directory apps/api --group tools python scripts/fetch_products.py`.
Каталог сохраняется в `apps/api/data/products_normalized.json`.

У каждого приложения свои env-файлы, тесты и `.tmp/` (pytest/Vitest/TypeScript cache).
Локальные вложения находятся в `apps/api/data/attachments`; относительный явно заданный `ATTACHMENT_DIR` по-прежнему разрешается от корня репозитория.
Старый корневой `.env` при миграции перенесён в `infra/.env`; настройки API перенесены в `apps/api/.env` с сохранением приоритета существующих значений приложения.
Параметры web из старого корневого env перенесены в `apps/clinic-web/.env.local`, если такого файла ещё не было.
Для других checkout перенесите значения вручную; старый корневой env больше не загружается.
При ручном вызове Docker: `docker compose --project-name vetapp --env-file infra/.env -f infra/compose.yml up -d --build`.
CI проверяет frozen lockfiles, web-тесты, типы/lint, standalone-сборку, весь pytest на PostgreSQL и оба Docker-образа.

Для изолированных PostgreSQL-тестов локально: `pnpm test:db up -d --wait`, затем
задайте `DATABASE_URL=postgresql+psycopg://vetapp:test-only@127.0.0.1:15433/vetapp_test`
в окружении терминала и выполните `pnpm test`. После проверки: `pnpm test:db down`.
Тестовая БД живёт в tmpfs и не использует deployment-сеть или постоянные тома.
