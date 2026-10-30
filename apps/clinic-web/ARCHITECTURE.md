# Frontend: features и композиция страниц

Next.js routing остаётся в `src/app/`: пути, параметры, layouts и BFF
`app/api/[...path]/route.ts` принадлежат приложению. UI и логика организованы
по функциональным областям:

```text
src/
  app/
    _components/       # композиция экранов, shell и граница staff/owner
    _lib/navigation.ts # сопоставление URL и разделов приложения
    ...                # существующие маршруты Next.js
  features/
    patients/          # пациенты, клиенты, формы, карточка и список
    encounters/        # приёмы, назначения, вложения, журнал контактов
    clinical-builder/  # клинические документы, шаблоны и каталог полей
    nutrition/         # продукты, нутриенты, оценка и планы питания
    appointments/      # расписание, записи и API анкет визитов
    authentication/    # account API, auth context, workspace и организация
    owner-cabinet/     # кабинет владельца, заявки, привязки, файлы и чат
  shared/
    api/               # транспорт, ошибки, retry и тип доступа к API-схеме
    hooks/             # debounce и toast
    lib/               # классы CSS и форматирование времени
    providers/         # React Query и theme
    ui/                # универсальные UI-примитивы
```

## Владение кодом

Компонент, hook, API-интеграция и состояние конкретной области живут в её
feature. `api.ts` содержит запросы и типы этой области, `hooks.ts` — React Query
hooks. Ключи кеша и invalidation остаются прежними. Состояние форм и документов
остаётся в существующих компонентах и hooks; новый глобальный store не нужен.

`model.ts`, `form.ts`, `labels.ts` и `components/` существуют только там, где
есть соответствующий код. Пустые обязательные слои и общие barrel-файлы не
нужны. Универсальность определяется поведением, а не числом импортов:
например, данные пациента остаются в `patients`, даже если их читает диетолог.

`shared/api/client.ts` сохраняет единственный транспорт и его состояние:
workspace, регистрацию восстановления сессии, cookies и CSRF. Он не знает
features. `authentication/api.ts` владеет account-запросами, а
`owner-cabinet/api.ts` сохраняет отдельное поведение owner 401.
Генерируемые контракты по-прежнему находятся в `packages/api-contract`.

## Межфункциональные зависимости

Композиция разных features находится в `app/_components`. Например, оболочка
карточки и редактирование пациента принадлежат `patients`; приложение передаёт
ей очереди заявок и содержимое вкладок приёмов, галереи, контактов и питания.
Экран приёма соединяет пациента, запись и clinical-builder на уровне приложения.
Это обычные React props, без отдельного framework для композиции.

Разрешённые внешние модули features:

| Feature | Публичные зависимости |
| --- | --- |
| patients | — |
| authentication | — |
| appointments | patients: `api`, `form`, `hooks` |
| clinical-builder | encounters: `api` (только типы) |
| encounters | patients: `api` (типы); authentication: `auth-provider` |
| nutrition | patients: `api`, `form`, `hooks` |
| owner-cabinet | patients: `form`, `hooks`; appointments: `api`, `labels`; authentication: `auth-provider` |

Импорты UI другой feature делаются в композиции приложения. Features не
импортируют `app/`; `shared/` не импортирует ни features, ни `app/`.
Внутри одной feature допустимы прямые импорты. При добавлении обоснованной
публичной зависимости обновляйте таблицу и проверку границ вместе с кодом.

## Проверки

Из корня репозитория:

```sh
pnpm --filter vetdietderm-web check
pnpm --filter vetdietderm-web test
pnpm --filter vetdietderm-web build
```

`src/architecture.test.ts` проверяет импорты, включая относительные пути,
re-exports и статические dynamic imports: запрещает старые общие каталоги,
зависимости вверх, доступ к внутренностям соседней feature и runtime-циклы
между features. Тесты поведения находятся рядом со своими модулями;
интеграционные проверки нескольких features — рядом с композицией в `app/`.

При следующих переносах сначала переносите самостоятельный модуль, обновляйте
его импорты и mocks, запускайте проверки, затем переходите к следующему.
Маршруты и UI при структурных изменениях сохраняйте.
