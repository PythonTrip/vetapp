# Telegram Mini App: быстрый вход владельца

Открытие `/cabinet` в Mini App автоматически обменивает подписанный
`WebApp.initData` на HttpOnly owner-cookie. Если Telegram ещё не привязан,
сервер создаёт отдельный кабинет с именем из проверенных данных Telegram.
Почта, пароль, телефон и код врача для начала работы не нужны.
Пользователь сразу может добавлять и редактировать паспорта питомцев.

## Необязательные следующие шаги

- «Добавить вход по почте»: `POST /owner/credentials` с `{email, password}`.
  Устанавливает первые credentials у текущего владельца, сохраняя UUID,
  питомцев и Telegram identity. Пароль — 15–128 символов, пробелы сохраняются.
  Повторная установка запрещена. Почта проверяется на коллизии с владельцами
  и staff. Если врач уже принял владельца, почта синхронизируется с клиентом.
- «Подключить врача»: `POST /owner/connect-doctor` с `{code}`. Проверяет код,
  атомарно назначает врача и workspace существующей регистрации. Питомцы
  сохраняются. Повторная привязка к врачу запрещена. До этого шага кабинет
  не виден врачам; чат и заявки недоступны. `start_param` врача не назначает.
- Профиль Telegram-пользователя можно сохранить без почты и телефона.
  После установки пароля почту для входа нельзя очистить.
- Переход по `/join/{code}` в Mini App показывает врача и позволяет продолжить
  через Telegram без обязательной контактной формы и пароля.

## Веб-вход в тот же кабинет

`GET /owner/telegram/config` возвращает только публичный `bot_username`.
Веб-версия подключает официальный Telegram Login Widget и отправляет его
подписанный callback на `POST /owner/telegram/widget`.

Сервер проверяет HMAC-SHA-256 с ключом `SHA256(bot_token)`, срок `auth_date`
и положительный целочисленный Telegram ID. Mini App использует отдельную
проверку с ключом `HMAC-SHA-256(key=WebAppData, message=bot_token)`.
Оба способа разрешают одну `TelegramIdentity` и один OwnerAccount.
Если identity новая, кабинет создаётся так же, как в Mini App.
Вход по почте и паролю остаётся доступен.

Документация Telegram: [Mini Apps](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app),
[Login Widget](https://core.telegram.org/widgets/login-legacy).
Используется существующий bot-token HMAC протокол виджета; это не OIDC.

## Защита и существующие аккаунты

- `POST /owner/telegram/link` с `{init_data, email, password}` привязывает
  Telegram к существующему кабинету только после проверки пароля.
  Войти по почте можно в Mini App после выхода; для привязки нужны свежие
  launch data — закрыть и заново открыть приложение, сохранив owner-cookie.
- Совпадение почты не объединяет аккаунты. Существующая активная сессия
  другого владельца блокирует вход и автоматическое создание нового кабинета.
- Unique constraints обеспечивают связь Telegram и владельца 1:1.
  Создание владельца, identity, регистрации, replay marker и сессии атомарно.
- Проверяются подпись, срок (по умолчанию 300 секунд), дубли query-параметров,
  percent encoding, JSON и Telegram ID до 52 бит. `initDataUnsafe` не доверяется.
- Canonical digest обменивается один раз. Widget и Mini App имеют раздельные
  replay domains. После logout повторный обмен отклоняется; автологин после
  явного выхода не выполняется. Для Mini App нужны свежие launch data.
- Сессии случайные, в БД хранится hash; cookie HttpOnly. Credentials не передаются
  в URL/localStorage и не отражаются в validation errors. Ответы не кэшируются.
- Owner endpoints сохраняют CSRF, принадлежность питомцев и файлов и изоляцию
  от staff. Неподключённые кабинеты не дают доступа к клиническим данным.

## Развёртывание

1. Применить Alembic `0031_owner_quick_start` через `pnpm db:migrate`.
   Существующие аккаунты сохраняются. Откат не удаляет новые кабинеты:
   восстановление NOT NULL потребует сначала заполнить их отсутствующие поля.
2. API: задать `TELEGRAM_BOT_TOKEN` и `TELEGRAM_BOT_USERNAME` одного бота
   (username без `@`), HTTPS `OWNER_FRONTEND_URL`. Compose читает их из
   `infra/.env`. Token остаётся только на API. Без него обмены возвращают 503.
3. BotFather: Mini App URL — owner host `/cabinet`; для веб-виджета привязать
   домен owner host командой `/setdomain`. В production `AUTH_COOKIE_SECURE=true`.
4. Для Telegram Web iframe собрать owner host с `TELEGRAM_WEB_ENABLED=true`,
   API: `OWNER_COOKIE_SAMESITE=none`, `AUTH_COOKIE_SECURE=true`. Framing разрешён
   только официальным HTTPS Telegram origins. Staff SameSite не меняется.
   При блокировке third-party cookies потребуется мобильный Telegram или браузер.
5. Пересобрать и развернуть API и owner host. Проверить реальный вход в
   Telegram iOS/Android/Desktop/Web и callback виджета на разрешённом HTTPS домене.

## Проверки

`tests/test_telegram_owner.py`: HMAC, срок, replay, CSRF, конфликты, создание
без контактов, настройка credentials, веб-вход в тот же UUID, подключение врача,
перенос питомцев и изоляция клинических данных.
`apps/owner-web/src/telegram-auth.test.tsx`: автологин, single flight, logout,
необязательные credentials, привязка и сообщения об ошибках.
Локальные тесты не заменяют настройку BotFather и реальный HTTPS вход.
