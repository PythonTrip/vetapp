# Telegram Mini App: авторизация владельца

Общий Owner Cabinet используется без копий паспортов, чата, заявок, анкет и
файлов. Owner host загружает официальный Telegram SDK, передаёт сырой
`WebApp.initData` серверу через owner proxy и использует Telegram platform adapter.
Обычный браузер сохраняет вход по email/password.

## Серверная проверка

Спецификация: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
(проверена 2026-10-30). Используется метод backend бота: HMAC-SHA-256,
ключ `HMAC-SHA-256(key=WebAppData, message=bot_token)`, затем HMAC отсортированных
декодированных полей с разделителем LF, без `hash`. Поле `signature`, если
присутствует, входит в HMAC; Ed25519 для сторонних проверяющих без bot token
здесь не используется. Сравнение выполняется в постоянное время.

После HMAC проверяются `auth_date` (по умолчанию не старше 300 секунд, будущее
не более 30 секунд) и положительный целочисленный `user.id` до 52 бит.
Дубли параметров, некорректный percent encoding, malformed JSON и превышение
размера отклоняются. `initDataUnsafe`, пользовательские ID и email из Telegram
для авторизации не принимаются. Bot token доступен только backend.

## Привязка и повторный вход

- `POST /owner/telegram/link`: `{init_data, email, password}`. Повторно проверяет
  пароль существующего OwnerAccount, даже при наличии owner cookie. Email не
  используется для автоматического объединения identity. Новый владелец сначала
  регистрируется обычным способом по проверенному коду конкретного врача.
- `POST /owner/telegram/login`: `{init_data}`. Вход только для уже привязанной
  identity. Непривязанная identity получает 409 с инструкцией о привязке.
- Версионированные аналоги: `/v1/auth/owner/telegram/link` и `/login`.
- Unique constraints в `owner_telegram_identities` обеспечивают связь 1:1;
  другой Telegram у владельца, другой владелец у Telegram и попытка переключить
  активный чужой кабинет дают 409. Перезаписи привязки и автоматического merge нет.
- Успешный обмен атомарно сохраняет canonical hash в `owner_telegram_exchanges`
  и выдаёт обычную случайную HttpOnly owner-cookie. В БД хранится hash session
  token. Старый токен текущего браузера отзывается. Unique constraint блокирует
  повторный обмен и гонки; перестановка query-полей не обходит проверку.
- Использованный `initData` нельзя обменять снова даже после logout. Нужно
  закрыть и заново открыть Mini App для свежих launch data либо войти по паролю.
  Автоматического повторного входа после logout нет. Просроченные replay-записи
  удаляются при последующих успешных обменах.
- UI показывает ошибки подписи/срока, повторного обмена и конфликтов, сохраняет
  парольный вход. Пароль подтверждения привязки очищается после запроса.

Вход не меняет doctor, join code, workspace, tenant или OwnerRegistration.
`start_param` не назначает врача. Все клинические запросы проходят существующий
`require_owner` и проверки принадлежности пациента, чата, заявки и видимости файла.
Staff-cookie не создаётся и не принимается. Секреты не передаются в URL/localStorage;
ответы обмена и ошибки не кэшируются, ошибки валидации не отражают credentials.

## Настройка

1. Применить Alembic `0030_owner_telegram`: `pnpm db:migrate`.
2. На API задать `TELEGRAM_BOT_TOKEN` нужного бота и HTTPS `OWNER_FRONTEND_URL`.
   Без token endpoints возвращают 503. `TELEGRAM_INIT_DATA_MAX_AGE` — 30–3600
   секунд, по умолчанию 300. В production `AUTH_COOKIE_SECURE=true`.
3. Указать в BotFather Mini App URL owner host `/cabinet`. Существующие владельцы
   входят по паролю и нажимают «Привязать Telegram». Новые вводят код врача в
   общей `/join` форме, регистрируются и привязывают Telegram в кабинете.
4. Для Telegram Web iframe собрать owner host с `TELEGRAM_WEB_ENABLED=true` и
   задать API `OWNER_COOKIE_SAMESITE=none` при `AUTH_COOKIE_SECURE=true`.
   Framing разрешён только официальным HTTPS Telegram origins. Staff SameSite
   не меняется. По умолчанию owner SameSite=lax, framing запрещён. Флаг frame
   policy применяется во время Next build, включая Docker build args Compose.
   Браузеры, блокирующие third-party cookies, могут требовать открытия в мобильном
   Telegram или отдельном браузере.
5. Compose передаёт параметры из `infra/.env`; bot token остаётся только в API.
   Пересобрать профиль owner после смены frame policy.

Файлы передаются адаптеру как авторизованный Blob; при доступности используется
системный share sheet, иначе browser download. Публичные ссылки не создаются.
Проверка в настоящих Telegram iOS/Android/Desktop/Web клиентах и настройка
BotFather требуют развёрнутого HTTPS host и бота; локальные тесты их не заменяют.

## Проверки

`tests/test_telegram_owner.py` проверяет подпись, дополнительные подписанные поля,
другой bot token, срок, дубли, некорректные user IDs, replay после logout,
конфликты, personal/organization binding, CSRF и изоляцию клинических пациентов.
`apps/owner-web/src/telegram-auth.test.tsx` проверяет вход, передачу raw initData,
подтверждение пароля, конфликт, срок и отсутствие auto-login после logout.
Тесты выполняются вместе с существующими owner/chat/visits/auth suites.
