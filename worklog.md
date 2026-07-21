# VetDietDerm — Project Worklog

## Project Overview
**VetDietDerm** is a Micro-CRM for independent veterinary nutritionists & dermatologists offering online consultations. Built as a single-page Next.js 16 dashboard with AI voice scribing, nutrition calculators, dermatology tracking, and one-click branded PDF reports.

---

## Phase 11 — Nutritionist Assistant: связанное рабочее пространство (Current)

### Goal
Подмодули Nutritionist Assistant (каталог, расчёты, конструктор диеты) связаны в единый поток для максимальной эффективности специалиста: продукты каталога используются в расчётах и рационах напрямую, MER передаётся в конструктор, общий пациент даёт префилл и сохранение в один клик.

### New Features
1. **Workspace store** (`src/lib/nutrition-workspace.ts`) — общее состояние модуля: управляемые вкладки, общий пациент, целевые ккал, префилл Dry Matter, состояние конструктора (переживает переключение вкладок — Radix Tabs размонтирует контент).
2. **Панель пациента** — селект над вкладками: чипы (вес, BCS, MER ≈), префилл калькулятора RER/MER из карты (вид, вес, life stage, активность, кастрация, BCS, целевой вес), сохранение планов в один клик («Сохранить для {name}») во всех инструментах.
3. **Каталог → Dry Matter** — кнопка «Анализ DM» в карточке продукта подставляет CP/CFa/CFi/влажность в конвертер; бейдж продукта; рядом с оценкой по Атуотеру — каталожная ME и расхождение в % (подсветка при |Δ| > 10%).
4. **Каталог → Конструктор** — кнопка «В рацион»: продукт становится компонентом с реальной ME (ккал/кг) и макросами (CP/CFa), доля — остаток до 100%, дубликаты не добавляются; метка «из каталога» на компоненте; кнопка «Из каталога» в конструкторе ведёт обратно.
5. **RER/MER → Конструктор** — кнопка «Использовать N ккал в конструкторе рациона» передаёт MER как целевую калорийность (+ чип для повторного применения при ручных изменениях).
6. **Точная граммовка** (`buildDietTemplate`) — проценты = доли массы (BARF-конвенция); общая масса решается из целевых ккал через взвешенную энергоплотность; плотность компонента — реальная ME из каталога или дефолт категории (`DIET_CATEGORY_DENSITY`); новая категория `commercial`.
7. **Сводка рациона** (`summarizeDiet`) — г/день, ккал/день, белок/жир г/день по данным каталога с % покрытия массы; macros плана сохраняются как `{proteinG, fatG}`.
8. **Поиск каталога внутри конструктора** — инлайн-поле с выпадающей выдачей по всему каталогу (API-режим `?q=`, до 20 результатов с категорией и ME); клик добавляет продукт компонентом без переключения вкладок. Ранжирование: совпадение в начале названия и более короткие имена выше (сырьё «Морковь» выше брендовых кормов). **Ручные записи полностью убраны**: нет кнопки «Add Component», нет пресетов с текстовыми ингредиентами, стартовый рацион пуст, название компонента — только из каталога (текст, не input; рядом ME ккал/кг); редактируются лишь категория и доля. Пустые состояния в конструкторе/составе/сохранении, сохранение пустого рациона заблокировано.
9. **Нутриентный анализ рациона** (`src/lib/nutrition-analysis.ts` + полноширинная панель под конструктором) — агрегация per-day итогов по связанным продуктам (API-режим `?ids=`): стат-плитки (белок/жир/углеводы г/день, Ca:P с диапазоном 1.0–2.0, ω6:ω3), структура энергии (стековая полоса по Атуотеру) и **пять полноценных recharts-графиков по группам** (горизонтальные бары, прямые подписи значений, тултипы со значением и нормой): «Основные» (белок/жир/НФЭ/клетчатка, г/день), «Минералы» и «Витамины» (% от нормы NRC с референс-линией 100%, шкала обрезана на 300% — фактический % в подписи, дефицит <90% амбером), «Аминокислоты» и «Жирные кислоты» (г/день). Нормы NRC 2006 (взрослые собака/кошка, на 1000 ккал МЭ, масштабируются к целевой калорийности; вид — от выбранного пациента; добавлены Cl, J, холин B4, B5). Витамины A/D/C/B7 — справочные плитки без норм. Легенда цветов, предупреждение при покрытии <60% массы, дисклеймер. `NUTRIENT_UNITS` расширен единицами минералов/витаминов/аминокислот — единицы появились и в карточках каталога.

### Verification
- ✅ Пациент → чипы + префилл калькулятора (Biscuit: 28.5 кг, BCS 4, MER 1726)
- ✅ «Анализ DM»: Бараний рубец → 12/4/0/83, оценка 780 vs каталог 795 ккал/кг (-2%)
- ✅ «В рацион»: тост, компонент с ME; 256 г × 0.795 = 203 ккал; итог = целевым 1726 ккал
- ✅ MER → конструктор: вкладка переключилась, kcal применились, граммы пересчитались
- ✅ Сохранение рациона в один клик: POST /api/diet-plans 201, template с полями связи
- ✅ tsc 0 ошибок (перегенерирован Prisma client + db push: колонка ownerEmail отсутствовала в dev-БД), eslint 0, консоль чистая

### Files
**New**: `src/lib/nutrition-workspace.ts`, `src/lib/nutrition-analysis.ts`, `docs/superpowers/specs/2026-07-20-nutrition-workspace-design.md`
**Modified**: `src/lib/nutrition.ts`, `src/lib/types.ts`, `src/lib/hooks.ts`, `src/lib/nutrition-products.ts`, `src/components/modules/nutrition.tsx`, `src/components/nutrition/product-catalog.tsx`, `src/app/api/nutrition-products/route.ts`

### Notes / Risks
- Дефолтные плотности категорий — усреднённые as-fed значения; для точной граммовки компоненты стоит связывать с каталогом (реальная ME).
- Сохранённые ранее планы читаются без изменений; новые поля компонентов опциональны, diet-plan-panel рендерит их толерантно.
- Нормы NRC в `nutrition-analysis.ts` — справочные округлённые значения для взрослых животных (в UI есть дисклеймер); витамины A/D показываются только итогами (единицы каталога «МЕ» без знаменателя), в сравнение с нормами не входят.
- Анализ учитывает только массу, связанную с каталогом, — при низком покрытии итоги занижены (предупреждение в UI).

---

## Phase 10 — Structured Anamnesis, Repeatable Patient Baseline & Editable History

### Goal
Максимально удобное взаимодействие с пациентом: врач не перепечатывает повторяемые данные (возраст, активность, кормление, аллергии), анамнез заполняется структурированно с готовыми шаблонами для дерматологии и диетологии, история обращений доступна для просмотра и редактирования.

### Data Model
- **Pet**: `allergies` (JSON array), `chronicConditions` (JSON array), `feeding` (JSON: foodType, brand, dailyAmount, feedingsPerDay, treats, supplements, notes) — «анамнестическая база», вводится один раз.
- **Consultation**: `anamnesisData` (JSON: { specialty, answers, freeText }) — структурированный анамнез; текстовая сводка по-прежнему пишется в `anamnesis`/`notes` (совместимость с отчётами, share-страницей, AI).
- API: pets POST/PATCH и consultations POST/PATCH принимают новые поля (сериализация JSON на сервере).

### New Features
1. **Anamnesis schema** (`src/lib/anamnesis-schema.ts`) — декларативные наборы полей: дерматология (давность, течение, сезонность, локализация-чипы, проявления зуда, обработки от эктопаразитов, контактные животные/люди, среда, прежнее лечение), диетология (цель, аппетит, стул, рвота, динамика веса, вода, еда со стола, доступ к еде, история рационов), общий приём. Генерация текстовой сводки: базовые данные пациента + ответы + свободный текст.
2. **AnamnesisForm** (`src/components/crm/anamnesis-form.tsx`) — панель «Из карточки пациента» (read-only чипы: возраст, пол, вес/BCS, активность, аллергии с акцентом, хронические, кормление + кнопка «Изменить карточку»), поля по направлению (select/чипы/переключатели/текст), кнопка «Скопировать из прошлого приёма» (переносит ответы последнего приёма того же направления).
3. **Pet form** — chip-ввод аллергий и хронических состояний с быстрыми подсказками, блок «Кормление» (тип рациона, марка, объём, кратность, лакомства, добавки).
4. **ConsultationWorkspace** — большой textarea анамнеза заменён на AnamnesisForm; сохранение пишет `anamnesisData` + сводку; валидация завершения по заполненности структуры; шаблоны заполняют структурированные ответы; «Создать из карточки» сохраняет их в пользовательский шаблон.
5. **Built-in templates** — 4 дерматологических + 3 диетологических шаблона получили `sections` со структурированными ответами анамнеза (RU), осмотром, диагнозами, назначениями и контрольным планом.
6. **Timeline** — записи раскрываются («Подробнее»): структурированный анамнез (метка → значение), осмотр, диагнозы-badges, назначения; кнопка «Редактировать» на каждой записи.
7. **ConsultationEditDialog** (`src/components/crm/consultation-edit-dialog.tsx`) — полный редактор записи истории: дата, тип, направление, статус, жалоба, вес, VAS, AnamnesisForm, осмотр, диагнозы, назначения, контроль; PATCH с перегенерацией сводки.

### Verification
- ✅ `prisma db push` + generate; dev-сервер и все API 200
- ✅ Шаблон «Atopic Dermatitis Flare» заполняет селекты, чипы (Лапы/Морда/Подмышки; Чешется/Грызёт лапы/Трётся мордой), осмотр, 2 диагноза, 3 назначения, контроль
- ✅ Приём завершён (POST 201), в Timeline раскрыт структурированный вид
- ✅ Редактирование записи: VAS 7 → 5, PATCH 200, таймлайн обновился
- ✅ Карточка пациента: аллергии/хронические/кормление сохранены (PATCH 200) и отображаются в панели «Из карточки пациента»
- ✅ «Скопировать из прошлого приёма» переносит ответы в новый приём
- ✅ Переключение на «Диетология» показывает диетологические поля и шаблоны
- ✅ Lint: 0 ошибок; tsc: 0 ошибок; консоль браузера чистая

### Files
**New**: `src/lib/anamnesis-schema.ts`, `src/components/crm/anamnesis-form.tsx`, `src/components/crm/consultation-edit-dialog.tsx`, `docs/superpowers/specs/2026-07-20-structured-anamnesis-design.md`
**Modified**: `prisma/schema.prisma`, `src/lib/types.ts`, `src/lib/treatment-templates.ts`, `src/components/crm/pet-form.tsx`, `src/components/crm/consultation-workspace.tsx`, `src/components/crm/consultation-timeline.tsx`, `src/components/modules/crm.tsx`, `src/app/api/pets/route.ts`, `src/app/api/pets/[id]/route.ts`, `src/app/api/pets/[id]/consultations/route.ts`, `src/app/api/consultations/[id]/route.ts`

### Notes / Risks
- Существующие текстовые анамнезы не мигрируются в структуру: при редактировании старой записи текст попадает в поле «Дополнительно» — данные не теряются.
- Live Consult Mode и Voice Scribe пишут анамнез по-прежнему текстом (structured-путь их не ломает).
- CSV import/backup не включают новые поля Pet — значения по умолчанию корректны; стоит расширить в следующей фазе.

---

## Phase 9 — Custom Handout Builder, Backup Restore, Share PDF & Clinical Insights

### QA Assessment (agent-browser)
- ✅ All Phase 1-8 features verified functional (Dashboard 3 tabs, CRM 6 tabs w/ CDS + Live Consult + Drug Safety + Owner Portal Share, Nutrition 3 calculators, Knowledge Base 4 tabs w/ Elimination Wizard + 32 allergens, CSV Import/Export, JSON Backup, Appointments, Treatment Templates w/ custom CRUD, Owner Communication Log persisted, Appointment Reminders)
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: running clean, all API routes returning 200
- No bugs found — project is stable

### New Features Added (Phase 9)

#### 1. Custom Handout Builder UI (Full CRUD integration)
- **Component**: Extended `src/components/modules/knowledge.tsx` HandoutBuilder function + new `HandoutEditor` sub-component
- **Integration**: Custom handouts now appear alongside 6 built-in templates in the Handout Builder tab
- **API Enhancement**: Updated `src/app/api/ai/handout/route.ts` to accept `customPrompt` and `customTitle` parameters — when `templateId === "custom"`, uses the custom prompt with `{{petName}}`/`{{species}}` placeholder replacement
- **UI Features**:
  - "New" button in Handout Builder header (next to "Choose a Handout" title)
  - **Built-in section**: 6 templates with BookOpen icon header showing count
  - **Custom section**: User-created handouts with BookMarked icon header, "Custom" badge (User icon + primary color border)
  - Per-custom-handout actions: Edit (Pencil), Delete (Trash2) — only on custom handouts
  - Empty state: "No custom handouts yet" with FilePlus icon + CTA
  - AlertDialog confirmation before delete
- **HandoutEditor dialog** (AlertDialog-based):
  - Title input (required)
  - Category select (5 options: General, Dermatology, Nutrition, Wellness, Behavioral)
  - Description input (optional)
  - Icon select (6 lucide icons: ClipboardCheck, ArrowRightLeft, NotebookPen, Pill, ShieldAlert, FlaskConical)
  - **AI Prompt textarea** (required) — with placeholder showing example and `{{petName}}`/`{{species}}` placeholder hints
  - Sparkles icon hint: "The AI will use this prompt to generate a personalized handout"
  - Save Changes / Create Handout buttons with validation
- **Verified**: Created "Post-Dental Care Instructions" custom handout → appeared in Custom section with badge → AI generation uses custom prompt

#### 2. Backup Restore/Import (POST endpoint + UI dialog)
- **API Route**: `src/app/api/backup/restore/route.ts` — POST accepts `{ backup, mode }` where mode is "skip" or "overwrite"
- **Restore logic**:
  - Iterates all pets with nested relations (consultations, photos, dietPlans, appointments)
  - Restores customTemplates, customHandouts, communications
  - **Conflict resolution**: "skip" keeps existing records, "overwrite" deletes & replaces by ID
  - Per-record error handling — failures collected in `summary.errors[]` without aborting the whole restore
  - Returns detailed summary: petsAdded/Skipped/Overwritten, consultationsAdded, photosAdded, dietPlansAdded, appointmentsAdded, customTemplatesAdded, customHandoutsAdded, communicationsAdded, errors[]
- **UI Component**: `src/components/crm/backup-restore-dialog.tsx` — 4-phase dialog
  - **Phase 1 (idle)**: Drag-and-drop JSON file upload zone with warning card
  - **Phase 2 (preview)**: File info card (name, export date, version), 9 count boxes (Pets, Consultations, Photos, Diet Plans, Appointments, Custom Templates, Custom Handouts, Communications, Share Tokens), conflict mode selector (Skip/Overwrite with visual cards), overwrite warning
  - **Phase 3 (restoring)**: Spinner with "Restoring records from backup..."
  - **Phase 4 (done)**: Result card (emerald if no errors, amber if errors), 7 result boxes with +count badges, scrollable error list (if any)
  - Invalidates all React Query caches (pets, appointments, custom-templates, custom-handouts) on success
- **Integration**: New "Restore" button (Upload icon) in Dashboard header next to Backup button
- **Verified**: Dialog opens, drop zone functional, file upload parses JSON, preview shows counts, mode selector works

#### 3. Share Page Enhancements (Download/Print PDF buttons)
- **Component**: Updated `src/components/share/share-report.tsx`
- **New action toolbar** (no-print): Sticky bar below the secure portal banner with:
  - **Print button** (outline, Printer icon) — triggers `window.print()` with toast
  - **Download PDF button** (primary, Download icon) — triggers `window.print()` with "Choose 'Save as PDF' as the destination" toast
- **Print CSS**: Updated `src/app/globals.css` `@media print` block:
  - Added `.share-print-area` visibility rules (parallel to existing `.report-print-area`)
  - `break-inside: avoid` on sections to prevent ugly page breaks
  - `overflow: visible` on Recharts containers for clean chart printing
  - Wrapped share content div with `share-print-area` class
- **Verified**: Share page at `/share/sO7pe-hqmfmW` shows Print + Download PDF buttons in action toolbar

#### 4. Clinical Dashboard Insights Panel (KPI trends + at-risk patients)
- **Component**: `src/components/dashboard/clinical-insights.tsx` — new panel at bottom of Dashboard Overview tab
- **4 KPI cards** (top row):
  - **Active Cases** (amber) — patients with VAS ≥ 4 or BCS ≥ 7, with progress bar
  - **Improving** (emerald) — patients with VAS trending down between last 2 visits
  - **Stable** (teal) — patients with no active issues
  - **Weight On-Track** (violet) — patients losing weight as planned (last weight < first recorded)
- **At-Risk Patients panel** (2/3 width):
  - Algorithm flags patients by severity (high/medium/low) for:
    - Severe pruritus (VAS ≥ 7 → high, VAS ≥ 5 → medium)
    - Worsening VAS (Δ ≥ 2 → high)
    - Obese (BCS ≥ 8 → high, BCS 7 → medium)
    - Underweight (BCS ≤ 3 → medium)
    - Recheck overdue (>60d with VAS ≥ 4 → medium)
    - No visit in 180d → low
  - Sorted by top severity (high first)
  - Color-coded cards: rose border for high, amber for medium, default for low
  - Each card: pet avatar, name, breed, severity badges with reasons, days since last visit
  - Click to open patient record
  - Empty state: "All patients stable" with green heart icon
- **VAS Trend mini-chart** (1/3 width):
  - 6-month average VAS by month (horizontal bar chart)
  - Color-coded bars: emerald (≤3), amber (4-6), rose (7+)
  - "Lower is better — target ≤ 3" hint with TrendingDown icon
- **Integration**: Added `<ClinicalInsights />` below Quick Actions in Dashboard Overview tab
- **Verified**: Luna flagged as at-risk with 3 reasons (Moderate pruritus VAS 5/10, Obese BCS 8/9, Recheck overdue 66d), VAS trend shows 6 months of data

#### 5. Styling Polish (Phase 9)
- **12 new CSS classes/animations** in `globals.css`:
  - `kpi-card-hover` — hover lift effect for KPI cards
  - `at-risk-stripe-high/medium/low` — left border severity stripes
  - `@keyframes bar-grow` + `.bar-grow` — animated width for VAS trend bars
  - `restore-dropzone` — ambient gradient for restore file drop zone (light + dark)
  - `restore-count-box` — hover scale for count boxes
  - `handout-prompt-focus` — focus glow for prompt textarea
  - `custom-handout-card` — gradient + left accent for custom handout cards
  - `share-toolbar` — sticky backdrop-blur toolbar for share page
  - `insights-header` — subtle gradient for insights section
  - `backup-group` — visual grouping for backup button cluster
  - `@keyframes mode-select` + `.mode-selected` — animated conflict mode selection
- **Footer version**: Updated v1.3 → v1.4

### Verification Results (Phase 9)
- ✅ Custom Handout Builder: "New" button opens editor, form fields functional, created "Post-Dental Care Instructions" → appeared in Custom section with badge
- ✅ Custom Handout AI generation: API accepts `customPrompt` + `customTitle`, generates personalized handout from custom prompt
- ✅ Custom Handout Edit/Delete: per-card action buttons visible only on custom handouts
- ✅ Backup Restore dialog: opens from Dashboard "Restore" button, drop zone functional, file upload parses JSON
- ✅ Backup Restore API: POST endpoint accepts backup + mode, returns detailed summary
- ✅ Share page: Print + Download PDF buttons visible in action toolbar
- ✅ Clinical Insights: 4 KPI cards render with progress bars
- ✅ At-Risk Patients: Luna correctly flagged with 3 severity reasons (Moderate pruritus, Obese, Recheck overdue)
- ✅ VAS Trend: 6-month mini-chart renders with color-coded bars
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: no runtime errors, all APIs returning 200

### Files Created/Modified (Phase 9)
**New files**:
- `src/app/api/backup/restore/route.ts` — POST restore endpoint with conflict resolution
- `src/components/crm/backup-restore-dialog.tsx` — 4-phase restore dialog with preview + mode selector
- `src/components/dashboard/clinical-insights.tsx` — KPI trends + at-risk patients + VAS trend

**Modified files**:
- `src/components/modules/knowledge.tsx` — Extended HandoutBuilder with custom handout CRUD + HandoutEditor dialog
- `src/app/api/ai/handout/route.ts` — Added customPrompt/customTitle support for custom handouts
- `src/components/modules/dashboard.tsx` — Added Restore button + BackupRestoreDialog + ClinicalInsights panel
- `src/components/share/share-report.tsx` — Added Print/Download PDF action toolbar + share-print-area class
- `src/components/app-shell.tsx` — Version v1.4
- `src/app/globals.css` — 12 new CSS classes/animations + enhanced print styles for share page

### Unresolved Issues / Risks
1. **Custom handout AI generation rate limits** — Each custom handout generation calls the LLM (3-6s). Sequential generation with 429 retry logic is in place but bulk generation could hit rate limits.
2. **Restore doesn't validate backup schema version** — A backup from a future version could fail silently if the schema changed. Could add version validation.
3. **Restore overwrites timestamps** — Restored records keep their original `createdAt`/`updatedAt` from the backup, which is correct for historical accuracy but means "recently modified" views may show old dates.
4. **At-risk algorithm is rule-based** — Same rules as CDS alerts. Could add LLM-powered natural language summaries in a future phase.
5. **VAS trend chart is simple bars** — Could be upgraded to a proper line chart with Recharts for smoother visualization.
6. **Share page Print uses browser print** — Still not true server-side PDF generation (Playwright). Owner must choose "Save as PDF" in print dialog.
7. **Dev server process management** — Dev server can be killed between bash sessions. Restart with `(setsid bash -c 'exec bun run dev' > /dev/null 2>&1 < /dev/null &)` and wait ~15 seconds.

### Priority Recommendations for Next Phase (Phase 10)
1. **Server-side PDF generation** — Playwright-based API route for true one-click PDF download (no browser print dialog). Still the top requested feature.
2. **Real-time WebSocket consultation** — extend Live Consult Mode with WebSocket support for collaborative multi-vet consultations.
3. **Custom allergens** — allow vets to add practice-specific allergens (e.g., local regional pollens).
4. **Inventory & dispensing** — track medication inventory and auto-deduct when dispensed in consultations.
5. **Invoice/billing basics** — line-item billing per consultation with simple totals.
6. **Share token analytics** — add ShareTokenView model for detailed view history (timestamps, IP, user agent).
7. **Backup schema versioning** — validate backup version on restore and migrate if needed.
8. **VAS trend line chart** — upgrade the mini-chart to a proper Recharts line chart with gradient fill.

---

## Phase 8 — Owner Portal, JSON Backup, Allergen Expansion & Custom Handouts

### QA Assessment (agent-browser)
- ✅ All Phase 1-7 features verified functional (Dashboard 3 tabs, CRM 6 tabs w/ CDS alerts + sparklines + Live Consult + Drug Safety, Nutrition 3 calculators, Knowledge Base 4 tabs w/ Elimination Wizard, CSV Import/Export, Appointments, Treatment Templates w/ custom CRUD, Owner Communication Log persisted, Appointment Reminders)
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: running clean, all API routes returning 200
- 🐛 **Bug Fixed**: ShareToken model was missing `pet` relation — public share page threw "Unknown field `pet` for include statement" error. Added bidirectional Pet↔ShareToken and Pet↔CommunicationLog relations to schema, re-pushed, regenerated client, restarted dev server.

### New Features Added (Phase 8)

#### 1. JSON Full Backup Export (Data Portability)
- **API Route**: `src/app/api/backup/route.ts` — GET returns full JSON backup
- **Backup contents**:
  - `meta`: version, exportedAt, app name, counts object (pets, consultations, photos, dietPlans, appointments, customTemplates, customHandouts, communications, shareTokens)
  - `pets`: full pet records with all relations (consultations, photos, dietPlans, appointments)
  - `customTemplates`: user-created treatment plan templates
  - `customHandouts`: user-created handout templates
  - `communications`: all owner communication log entries
  - Share tokens intentionally excluded for security (transient auth credentials)
- **UI**: New "Backup" button in Dashboard header (DatabaseBackup icon) with loading spinner
- **Download**: Browser triggers download of `vetdietderm-backup-YYYY-MM-DD.json` with `Content-Disposition: attachment`
- **Toast**: Shows counts summary on success ("3 pets · 8 consultations · 1 templates")
- **Verified**: Backup downloaded successfully via agent-browser, JSON contains all 3 pets, 8 consultations, 3 photos, 3 diet plans, 6 appointments, 1 custom template, 1 communication

#### 2. Owner Portal — Shareable Report Link with Expiry
- **Prisma Model**: `ShareToken` (id, token [unique 12-char URL-safe], petId, label, expiresAt, viewedAt, viewCount, revoked, createdAt) — bidirectional relation with Pet
- **API Routes**:
  - `src/app/api/share-tokens/route.ts` (GET by petId, POST with expiresInDays + label)
  - `src/app/api/share-tokens/[id]/route.ts` (PATCH for revoke/label update, DELETE idempotent)
- **Public Share Page**: `src/app/share/[token]/page.tsx` — server component
  - Validates token: checks revoked, expiry, existence
  - 3 error states: invalid/revoked (rose icon), expired (amber icon with expiry date), not found
  - Increments viewCount + updates viewedAt on each access (fire-and-forget)
  - Renders `ShareReport` client component
- **ShareReport Component**: `src/components/share/share-report.tsx`
  - Top banner: "Secure owner portal — shared by your veterinarian" with days-left + view count
  - Branded header (VetDietDerm Clinic + PawPrint)
  - Patient Profile grid (8 fields)
  - Latest Clinical Summary with chief complaint + VAS
  - Progress Tracking: Weight + VAS line charts (Recharts)
  - Nutrition Plan: RER/MER + macros + notes
  - Consultation History: last 6 visits condensed
  - Footer: generation timestamp + expiry warning with amber alert
- **Owner Portal Dialog**: `src/components/crm/owner-portal-dialog.tsx`
  - "Share" button in pet detail header (between Live Consult and Report)
  - Create form: optional label + expiry select (7/14/30/90 days)
  - Auto-copies link to clipboard on creation
  - Token list grouped by status: Active (emerald), Expired (amber), Revoked (rose)
  - Per-token actions: Copy link, Open in new tab (preview), Revoke, Delete
  - Each card shows: label, status badge, days left, view count, created/expires dates, last viewed
  - Empty state with link icon
- **React Query Hooks**: `useShareTokens`, `useCreateShareToken`, `useRevokeShareToken`, `useDeleteShareToken`
- **Verified end-to-end**:
  - Created share token via API: `{"token":"sO7pe-hqmfmW","expiresAt":"2026-07-04..."}`
  - Public page at `/share/sO7pe-hqmfmW` returns 200 with all report sections (Patient Profile, Latest Clinical Summary, Progress Tracking, Nutrition Plan, Consultation History)
  - Created token via UI dialog with label "Test link for QA" → appeared in Active list with Copy/Revoke buttons
  - View count increments on each page visit

#### 3. Custom Handout Templates (Prisma model + API + hooks)
- **Prisma Model**: `CustomHandout` (id, title, description, prompt, category, icon, createdAt, updatedAt)
- **API Routes**:
  - `src/app/api/custom-handouts/route.ts` (GET list, POST create)
  - `src/app/api/custom-handouts/[id]/route.ts` (PATCH, DELETE idempotent)
- **React Query Hooks**: `useCustomHandouts`, `useCreateCustomHandout`, `useUpdateCustomHandout`, `useDeleteCustomHandout`
- **Schema fields**:
  - `title`: handout name
  - `description`: short summary
  - `prompt`: AI prompt template with `{{petName}}`, `{{species}}` placeholders
  - `category`: general | dermatology | nutrition | wellness | behavioral
  - `icon`: lucide icon name (default FileText)
- **Note**: Full CRUD UI for custom handouts will be integrated into the Handout Builder in a follow-up phase. The data model, API, and hooks are production-ready.

#### 4. Allergen Directory Expansion (+18 new allergens)
- **File**: `src/lib/clinical-data.ts` — expanded from 14 → 32 allergens
- **New food allergens (6)**: Corn/Maize, Rice, Pork, Lamb, Tomato, Peanut
- **New environmental allergens (4)**: Ragweed Pollen, Mugwort Pollen, English Plantain Pollen, Sheep Sorrel Pollen
- **New regional pollens (3)**: Japanese Cedar (Sugi) Pollen, Birch Pollen, Mountain Cedar Pollen
- **New indoor/contact allergens (3)**: Storage Mites, Bird Feather Dander, Human Dander
- **New chemical/contact allergens (2)**: Flea Collar Chemicals (Tetrachlorvinphos), Shampoo Surfactants (SLS)
- **New cross-reactive clusters (2)**: Nightshade Cross-Reactivity, Legume Cross-Reactivity
- **Each entry includes**: id, category, name, detailed description, cross-reactants list, safe alternatives
- **Cross-reactivity highlights**:
  - Ragweed ↔ melon/banana (oral allergy syndrome)
  - Birch ↔ raw apple/carrot/hazelnut/stone fruits
  - Storage mites ↔ dust mites (70% co-sensitization)
  - Legume cluster: soy/pea/peanut/lentil/chickpea
  - Nightshade cluster: potato/tomato/eggplant/pepper
- **Verified**: Allergen Directory tab now shows all 32 entries with category filter (All / Environmental / Food / Cross-Reactive)

#### 5. Styling Polish (Phase 8)
- **15 new CSS classes/animations** in `globals.css`:
  - `portal-banner` + `@keyframes portal-shimmer` — animated gradient banner for share page top
  - `token-card` — hover lift effect for share token cards
  - `@keyframes copy-ripple` + `.copy-ripple` — ripple animation on copy success
  - `backup-btn` — distinct gradient background for data-safety action
  - `@keyframes allergen-fade-in` + `.allergen-card` — staggered entrance for allergen entries
  - `.allergen-tag-env/food/cross` — gradient severity tags per allergen category (light + dark)
  - `.active-token-glow` — soft glow for active share tokens
  - `.qr-pattern` — QR-code style background pattern for share icons
  - `@keyframes backup-pulse` + `.backup-pulse` — loading pulse for backup button
  - `.portal-empty` — ambient gradient for empty portal state
- **Footer version**: Updated v1.2 → v1.3

### Verification Results (Phase 8)
- ✅ JSON Backup: API returns 200 with full structured JSON, download triggers, toast shows counts
- ✅ Backup contents verified: 3 pets, 8 consultations, 3 photos, 3 diet plans, 6 appointments, 1 custom template, 1 communication, 2 share tokens
- ✅ Share Token creation: API returns 201 with 12-char URL-safe token
- ✅ Public share page (`/share/[token]`): renders 200 with Patient Profile, Latest Clinical Summary, Progress Tracking (weight + VAS charts), Nutrition Plan, Consultation History
- ✅ Share page banner: "Secure owner portal — shared by your veterinarian" with days-left + view count
- ✅ Owner Portal dialog: opens from CRM header, create form with label + expiry, auto-copy on create
- ✅ Token list: groups by Active/Expired/Revoked with color-coded borders
- ✅ Per-token actions: Copy link, Open in new tab, Revoke, Delete
- ✅ Allergen Directory: 32 entries (up from 14), all new categories visible (food, environmental, regional pollens, indoor, contact chemicals, cross-reactive clusters)
- ✅ Allergen search: filters across all 32 entries
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: no runtime errors, all APIs returning 200

### Files Created/Modified (Phase 8)
**New files**:
- `src/app/api/backup/route.ts` — GET full JSON backup
- `src/app/api/share-tokens/route.ts` — GET/POST share tokens
- `src/app/api/share-tokens/[id]/route.ts` — PATCH/DELETE
- `src/app/api/custom-handouts/route.ts` — GET/POST custom handouts
- `src/app/api/custom-handouts/[id]/route.ts` — PATCH/DELETE
- `src/app/share/[token]/page.tsx` — public share page (server component)
- `src/components/share/share-report.tsx` — read-only public report viewer
- `src/components/crm/owner-portal-dialog.tsx` — share link management dialog

**Modified files**:
- `prisma/schema.prisma` — Added CustomHandout, ShareToken models; added Pet↔ShareToken and Pet↔CommunicationLog relations
- `src/lib/hooks.ts` — Added 8 new hooks (share tokens CRUD + custom handouts CRUD)
- `src/lib/clinical-data.ts` — Expanded ALLERGENS array from 14 → 32 entries
- `src/components/modules/dashboard.tsx` — Added Backup button with download + toast
- `src/components/modules/crm.tsx` — Added Share button + OwnerPortalDialog
- `src/components/app-shell.tsx` — Version v1.3
- `src/app/globals.css` — 15 new CSS classes/animations for Phase 8

### Unresolved Issues / Risks
1. **Custom handout CRUD UI not yet integrated** — the data model, API, and hooks are ready, but the Handout Builder UI still only shows the 6 built-in templates. A follow-up should add a "New Handout" button + editor to the Handout Builder tab.
2. **Backup is download-only** — no restore/import endpoint yet. Could add a POST `/api/backup/restore` that accepts a JSON file and re-creates all records.
3. **Share page is read-only** — owners cannot download/print from the share page. Could add a "Download PDF" button that triggers browser print on the share page.
4. **Share tokens stored in plain text** — token is a 12-char random string, which is sufficient for short-lived links but not cryptographically strong. Could use longer HMAC-signed tokens for higher security.
5. **No share token analytics** — view count is tracked but not a full view history (timestamps, IP, user agent). Could add a ShareTokenView model for detailed analytics.
6. **Allergen directory is static** — no way for vets to add custom allergens specific to their region. Could add a CustomAllergen Prisma model in a future phase.
7. **Dev server process management** — the dev server can be killed between bash sessions. Restart with `(setsid bash -c 'exec bun run dev' > /dev/null 2>&1 < /dev/null &)` and wait ~15 seconds. Prisma client singleton in `db.ts` requires dev server restart after schema changes.

### Priority Recommendations for Next Phase (Phase 9)
1. **Custom Handout Builder UI** — integrate the CustomHandout CRUD into the Knowledge Base Handout Builder tab (add "New Handout" button + editor dialog + custom handout cards alongside the 6 built-ins).
2. **Backup Restore/Import** — POST endpoint + UI to restore a JSON backup file (with conflict resolution: skip/overwrite/rename).
3. **Share page enhancements** — add Download PDF button + Print button on the public share page for owner convenience.
4. **Server-side PDF generation** — Playwright-based API route for true one-click PDF download (still the top requested feature from Phase 6).
5. **Real-time WebSocket consultation** — extend Live Consult Mode with WebSocket support for collaborative multi-vet consultations.
6. **Custom allergens** — allow vets to add practice-specific allergens (e.g., local regional pollens).
7. **Inventory & dispensing** — track medication inventory and auto-deduct when dispensed in consultations.
8. **Invoice/billing basics** — line-item billing per consultation with simple totals.

---

## Phase 7 — Live Consultation Mode, Custom Templates, Drug Safety & Persistence

### QA Assessment (agent-browser)
- ✅ All Phase 1-6 features verified functional (Dashboard 3 tabs, CRM 6 tabs w/ CDS alerts + sparklines, Nutrition 3 calculators, Knowledge Base 4 tabs w/ Elimination Wizard, CSV Import/Export, Appointments, Weight Projection, Treatment Templates, Owner Communication Log)
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: running clean, all API routes returning 200
- 🐛 **Bug Fixed**: Prisma client not regenerated after schema change — new `CustomTemplate` and `CommunicationLog` models weren't available until `bun run db:generate` + dev server restart (Prisma singleton in `db.ts` caches the client).

### New Features Added (Phase 7)

#### 1. Live Consultation Mode (Real-time consult view)
- **Component**: `src/components/crm/live-consult-mode.tsx` — full-screen Sheet (right side panel)
- **Integration**: New gradient "Live Consult" button in pet detail header (between Delete and Report)
- **Features**:
  - **Live elapsed timer** (MM:SS) with breathing animation — starts when sheet opens, stops on save
  - **4-tab interface**: Voice Scribe, Vitals & Symptoms, Notes & Findings, Drug Safety
  - **Voice Scribe tab**: Full MediaRecorder → ASR → AI parse pipeline (reused from existing scribe). 40-bar live waveform visualization. AI auto-fill pre-populates vitals across all tabs
  - **Vitals & Symptoms tab**: Weight input, BCS input, color-coded VAS buttons (1-10, green/amber/red by severity), 12 quick-toggle symptom chips (Pruritus, Erythema, Alopecia, Otitis, etc.), chief complaint input
  - **Notes & Findings tab**: Consultation type selector, 8 quick-add finding buttons (Skin scrape negative, Cytology: Malassezia, CBC/chem submitted, etc.) that append to notes textarea, free-text A/P notes editor
  - **Drug Safety tab**: Inline Drug Interaction Checker (see feature #4)
  - **Footer summary**: Live badges showing entered weight/BCS/VAS/symptoms count/notes length
  - **"End & Save" button**: Builds SOAP-format notes from all fields, creates consultation entry, updates pet weight/BCS if entered, shows toast with elapsed time
  - **Gradient hero header** with patient info, ACTIVE badge, timer
- **Verified**: Opened Live Consult for Mochi, timer running, switched through all 4 tabs, VAS buttons functional, quick-add findings appended to notes, Drug Safety tab loaded checker

#### 2. Custom Treatment Templates (CRUD + persistence)
- **Prisma Model**: `CustomTemplate` (id, name, category, description, icon, type, chiefComplaint, notes, suggestedVas, duration, createdAt, updatedAt)
- **API Routes**: `src/app/api/custom-templates/route.ts` (GET/POST), `src/app/api/custom-templates/[id]/route.ts` (PATCH/DELETE — idempotent)
- **React Query Hooks**: `useCustomTemplates`, `useCreateCustomTemplate`, `useUpdateCustomTemplate`, `useDeleteCustomTemplate`
- **UI**: Extended `src/components/crm/treatment-templates.tsx`:
  - "New Template" button in template dialog header
  - **Full template editor dialog**: name, category (5 options incl. "custom"), description, type, icon (13 lucide options), suggested VAS, chief complaint, duration, SOAP notes textarea
  - Custom templates displayed alongside 10 built-ins with "Custom" badge (User icon + primary color border)
  - Per-template Edit and Delete buttons (only on custom templates — built-ins are read-only)
  - Category filter includes "Custom" category
  - Toast confirmations for create/update/delete
  - AlertDialog confirmation before delete
- **Verified**: Created "Post-Surgical Recheck" custom template → appeared in dialog with "1 custom" badge, "Custom" tag on the card

#### 3. Appointment Reminders (Notification badge + popover)
- **Component**: `src/components/appointment-reminders.tsx` — bell icon + popover
- **Integration**: Added to sidebar footer (desktop) and mobile top bar, next to theme toggle
- **Features**:
  - Bell icon with **urgent count badge** (red, pulsing) for appointments within 2 hours or overdue
  - **Secondary count badge** (primary color) for upcoming within 7 days
  - **Popover** with gradient header showing total count
  - **5 urgency levels**: now (red), today (amber), tomorrow (teal), soon (muted), later (muted)
  - Color-coded cards: red border for overdue/now, amber for today, default for later
  - Each card: pet name, urgency badge, reason, type label, time, duration
  - **Dismiss** button per reminder (X icon, hides from list)
  - **Click to open** patient record (jumps to CRM + selects pet)
  - "View all" link at bottom navigates to Dashboard
  - Empty state: "All clear — No upcoming appointments" with calendar icon
- **Verified**: Bell icon visible in sidebar, popover opens with upcoming appointments

#### 4. Drug Interaction Checker (CDS extension)
- **Database**: `src/lib/drug-interactions.ts` — 19 curated veterinary drug interactions
  - **Severity levels**: contraindicated (4), major (8), moderate (6), minor (2)
  - **18 drug classes** mapped with keyword aliases: NSAIDs, corticosteroids, ACE inhibitors, ARBs, furosemide, spironolactone, aminoglycosides, loop diuretics, CNS depressants, MAO inhibitors, SSRIs, warfarin, cyclosporine, oclacitinib, cyclophosphamide, digoxin, theophylline, fluoroquinolones, azoles (ketoconazole/itraconazole/fluconazole), phenobarbital, metronidazole, thyroid meds, insulin
  - Each interaction: drugA, drugB, severity, mechanism, effect, recommendation
  - `checkDrugInteractions(text)` function: scans free-text for drug names using word-boundary regex, returns matched interactions sorted by severity
- **API Route**: `src/app/api/ai/drug-interactions/route.ts` (POST — accepts text, returns interactions + summary stats)
- **UI Component**: `src/components/crm/drug-interaction-checker.tsx` — collapsible card
  - Pre-fills with pet's latest consultation notes
  - Textarea for prescription/notes input
  - "Check Interactions" button → calls API
  - Results: color-coded cards by severity (rose/amber/orange/teal)
  - Each result: drug A + drug B, severity badge, effect, mechanism, recommendation (with sparkles icon), detected drug names
  - Empty state: "No interactions detected" with green shield icon
  - Summary badges in header: X contraindicated, Y major, Z moderate, W minor
  - Compact mode for inline use (in Live Consult Drug Safety tab)
- **Integration**: Added to pet Profile tab (full width, below Weight Projection) AND Live Consult Drug Safety tab
- **Verified**: Tested "Started carprofen 75mg PO BID for pain. Continue prednisolone 5mg PO daily for atopic flare." → correctly detected NSAID + Corticosteroid **contraindicated** interaction with recommendation and detected drugs (carprofen, prednisolone)

#### 5. Communication Log Persistence (localStorage → Prisma migration)
- **Prisma Model**: `CommunicationLog` (id, petId, channel, direction, date, duration, subject, notes, followUp, createdAt)
- **API Routes**: `src/app/api/communications/route.ts` (GET by petId, POST), `src/app/api/communications/[id]/route.ts` (PATCH, DELETE idempotent)
- **React Query Hooks**: `useCommunications(petId)`, `useCreateCommunication`, `useUpdateCommunication`, `useDeleteCommunication` — all invalidate per-pet query key
- **UI Updates**: `src/components/crm/owner-communication-log.tsx` rewritten:
  - Replaced localStorage with React Query hooks
  - Loading skeleton state (3 skeletons while fetching)
  - "Synced" badge in header (indicates cross-device persistence)
  - **Toggle follow-up** button (Check/RotateCcw icon) — updates entry without opening dialog
  - Submitting state on Log Contact button (Loader2 spinner)
  - Same 5 channels (phone/email/text/video/in_person) with color-coded icons
  - Direction tracking (inbound/outbound)
  - Duration, subject, notes, follow-up flag
  - Stats: total entries, days since last contact, pending follow-ups
- **Verified**: Logged "Recheck scheduled" phone call for Mochi → entry persisted (showed "1 entries · last contact today"), entries survive page reload

#### 6. Styling Polish (Phase 7)
- **15 new CSS classes/animations** in `globals.css`:
  - `live-consult-hero` — deeper ambient radial gradient for live consult header (light + dark)
  - `timer-breathe` — subtle breathing opacity for live timer
  - `vas-press` — VAS button press animation (scale 1→1.15→1.05)
  - `danger-glow` — pulsing red glow for contraindicated interaction badges
  - `badge-bounce` — vertical bounce for reminder badges
  - `template-custom` — gradient background + left accent border for custom template cards
  - `sync-pulse` — slow opacity pulse for "Synced" badge
  - `sheet-slide-in` — cubic-bezier slide-in for Sheet components
  - `tab-pill-active` — soft shadow glow for active tab pills
  - `quick-add-btn` — hover sweep effect (light gradient sweeps across on hover)
  - `stagger-in` — left-to-right stagger entrance for drug interaction results
  - `version-badge` — styled version pill in footer (teal background)
  - `live-pulse` — pulsing ring for Live Consult button
- **Footer version**: Updated v1.1 → v1.2 with styled `version-badge` class

### Verification Results (Phase 7)
- ✅ Live Consult Mode: opens from pet header, 4 tabs functional, timer running, VAS buttons work, quick-add findings append, Drug Safety tab loads checker
- ✅ Custom Templates: "New Template" button opens editor, form fields functional, created "Post-Surgical Recheck" template → appeared in dialog with "1 custom" badge
- ✅ Custom Template badge: "Custom" tag with User icon shown on custom templates
- ✅ Appointment Reminders: bell icon in sidebar with count badge, popover opens with upcoming appointments
- ✅ Drug Interaction Checker: pre-fills with last consultation notes, "carprofen + prednisolone" → contraindicated interaction detected with recommendation
- ✅ Drug Interaction severity badges: contraindicated (rose), major (amber), moderate (orange), minor (teal)
- ✅ Communication Log persistence: created phone call entry → showed "1 entries · last contact today"
- ✅ Communication Log "Synced" badge visible
- ✅ Toggle follow-up button functional
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: no runtime errors, all APIs returning 200
- ✅ All 4 new API endpoints working: /api/custom-templates, /api/communications, /api/ai/drug-interactions (all 200)

### Files Created/Modified (Phase 7)
**New files**:
- `src/lib/drug-interactions.ts` — 19 interactions, 18 drug classes, checkDrugInteractions() function
- `src/app/api/custom-templates/route.ts` — GET/POST custom templates
- `src/app/api/custom-templates/[id]/route.ts` — PATCH/DELETE (idempotent)
- `src/app/api/communications/route.ts` — GET (by petId)/POST communication logs
- `src/app/api/communications/[id]/route.ts` — PATCH/DELETE (idempotent)
- `src/app/api/ai/drug-interactions/route.ts` — POST text → interactions + summary
- `src/components/crm/live-consult-mode.tsx` — 4-tab live consultation Sheet (515 lines)
- `src/components/crm/drug-interaction-checker.tsx` — collapsible checker card
- `src/components/appointment-reminders.tsx` — bell + popover with urgency levels

**Modified files**:
- `prisma/schema.prisma` — Added CustomTemplate and CommunicationLog models
- `src/lib/types.ts` — Added CustomTemplate and CommunicationLogEntry interfaces
- `src/lib/hooks.ts` — Added 9 new hooks (custom templates CRUD + communications CRUD)
- `src/components/crm/treatment-templates.tsx` — Extended with custom template CRUD + editor dialog
- `src/components/crm/owner-communication-log.tsx` — Migrated from localStorage to React Query/Prisma
- `src/components/modules/crm.tsx` — Added Live Consult button, LiveConsultMode sheet, DrugInteractionChecker on profile
- `src/components/app-shell.tsx` — Added AppointmentReminders to sidebar + mobile header, version v1.2
- `src/app/globals.css` — 15 new CSS classes/animations for Phase 7

### Unresolved Issues / Risks
1. **Live Consult voice scribe duplicate** — The Live Consult Mode has its own voice scribe implementation (duplicated from the standalone VoiceScribe component). Could refactor to share a custom hook, but the live consult version has different state management (auto-fills vitals across tabs) so duplication is acceptable for now.
2. **Drug interaction database is curated** — 19 interactions covering common veterinary drugs. Could be expanded with more drugs (e.g., chemotherapy agents, behavioral meds) or integrated with an external API.
3. **Custom templates are global** — not scoped to a specific vet/user. Fine for single-practice use; would need user scoping for multi-tenant.
4. **Appointment reminders are in-app only** — no push notifications or email. The bell badge provides passive awareness but active reminders would need a backend job scheduler.
5. **Communication log migration** — existing localStorage entries are NOT auto-migrated to the database. Users would need to re-log entries. Acceptable for MVP but could add a migration helper.
6. **Dev server process management** — the dev server can be killed between bash sessions in the sandbox. Restart with `(setsid bash -c 'exec bun run dev' > /dev/null 2>&1 < /dev/null &)` and wait ~15 seconds.

### Priority Recommendations for Next Phase (Phase 8)
1. **Server-side PDF generation** — Playwright-based API route for true one-click PDF download (no browser print dialog). Still the top requested feature.
2. **Owner portal / sharing** — generate a shareable link for the PDF report (with expiry) so owners can view online without email.
3. **Allergen directory expansion** — add more species-specific allergens and regional pollens.
4. **Real-time WebSocket consultation** — extend Live Consult Mode with WebSocket support for collaborative multi-vet consultations.
5. **Clinical data export (full backup)** — JSON export of all patients, consultations, photos, diet plans, appointments, communications for backup/migration.
6. **Custom handout templates** — allow vets to create their own client handout templates (currently 6 built-in only).
7. **Inventory & dispensing** — track medication inventory and auto-deduct when dispensed in consultations.
8. **Invoice/billing basics** — line-item billing per consultation with simple totals.

---

## Phase 6 — Clinical Decision Support, CSV Import & Elimination Diet Wizard

### QA Assessment (agent-browser)
- ✅ All Phase 1-5 features verified functional (Dashboard 3 tabs, CRM 6 tabs, Nutrition 3 calculators, Knowledge Base 3 tabs, Analytics, Compare, Command Palette, CSV Export, Quick Templates, Appointments, Weight Projection, Treatment Templates, Owner Communication Log, Health Summary with sparklines)
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: running clean, all API routes returning 200
- 🐛 **Bug Fixed (pre-existing)**: `DeleteDialog` in `crm.tsx` used raw `fetch` for DELETE instead of the `useDeletePet` mutation hook — cache wasn't invalidated, so the UI didn't refresh after delete. Fixed by switching to `deletePet.mutateAsync` + explicit `queryClient.invalidateQueries`. Also made the API DELETE route idempotent (catches "record not found" errors and returns 200).

### New Features Added (Phase 6)

#### 1. Clinical Decision Support (CDS) Alerts Engine
- **Engine**: `src/lib/clinical-alerts.ts` — pure-function alert generator
- **UI**: `src/components/crm/clinical-alerts.tsx` — collapsible panel at top of pet Profile tab
- **Integration**: Inserted as the first card on Profile tab (above Health Summary)
- **Alert Categories & Logic**:
  - **Weight (BCS-based)**: BCS ≥ 8 → critical (obese, weight loss required, cat-specific hepatic lipidosis warning); BCS 7 → warning (overweight); BCS ≤ 3 → warning (underweight, workup advised); BCS 4-5 → success (ideal)
  - **Dermatology (VAS trend)**: VAS ↑ ≥ 3 between visits → critical (worsening pruritus); VAS ↑ ≥ 1 with VAS ≥ 6 → warning; VAS ↓ ≥ 2 → success (improving); VAS ≥ 7 → critical (severe pruritus)
  - **Breed predispositions**: 11 breeds mapped (French Bulldog, Golden Retriever, Labrador, German Shepherd, Pug, Bulldog, DSH, Maine Coon, Persian, Siamese, Sphynx) — each with top condition + advice
  - **Followup**: Last visit > 90 days ago for case with VAS ≥ 4 → recheck overdue
  - **Compliance**: Active pruritus (VAS ≥ 5) without a saved diet plan → warning
  - **Cat-specific**: Cat with weight-loss target > 15% body weight → warning (hepatic lipidosis risk)
  - **Senior screening**: Pet > 7 yr (dog) / 10 yr (cat) without bloodwork in history → info
  - **Nutrition**: Neutered + BCS ≥ 6 → info (lower MER factor needed)
- **Severity Levels**: critical (rose), warning (amber), info (teal), success (emerald) — sorted by severity
- **UI Features**:
  - Collapsible card with severity badge counts in header (e.g., "5 ALERTS · 1 critical · 1 warning · 3 info")
  - Color-coded icon per alert (AlertTriangle, TrendingUp, Dna, Scale, CalendarClock, ClipboardList, etc.)
  - Title + category badge + message + actionable recommendation with lightbulb icon
  - "Decision support is informational only" disclaimer
  - "All clear" empty state with green check icon when no alerts
- **Verified on Luna (obese cat)**: 5 alerts — 1 critical (obese, hepatic lipidosis warning), 1 warning (cat weight-loss caution), 3 info (DSH breed, senior screening, neutered+overweight)
- **Verified on Mochi (atopic Frenchie)**: 3 alerts — 2 info (French Bulldog breed predisposition w/ BOAS, neutered+overweight), 1 success (VAS improving 4→2)

#### 2. CSV Import for Bulk Patient Creation
- **Utilities**: `src/lib/import-utils.ts` — robust CSV parser + template generator
- **UI**: `src/components/crm/csv-import-dialog.tsx` — 4-phase import dialog
- **Integration**: New "Upload" icon button next to "Export CSV" in CRM sidebar header
- **Features**:
  - **Drag-and-drop file upload** with active state animation (`dropzone-active` class)
  - **Template download**: Pre-filled CSV with 14 columns + 2 example rows (Mochi & Luna)
  - **Robust CSV parser**: handles quoted fields with commas, escaped quotes (""), `\r\n` line endings, BOM
  - **Header mapping**: Recognizes multiple column name variants (e.g., `weight`, `currentweight`, `weight_kg` → CurrentWeight; `dob`/`birthdate`/`birth_date` → BirthDate)
  - **Field normalization**: Life stage (`puppy`/`kitten`/`puppy_kitten`/`young` → `puppy_kitten`), activity level, sex, neutered (yes/true/1/y/spayed/fixed)
  - **Per-row validation**: Required fields, BCS 1-9, valid date, valid species, valid sex, weight > 0
  - **Per-row warnings**: e.g., "OwnerContact is empty", "CurrentWeight > 200 kg — verify"
  - **Preview table**: Stats header (Total/Valid/Errors/Source), scrollable table with color-coded row backgrounds (red for errors, amber for warnings, green for OK)
  - **Sequential import**: POSTs to `/api/pets` one at a time with progress bar (0-100%)
  - **Result summary**: "Import complete: X added, Y failed" with appropriate color coding
  - **Cache invalidation**: `queryClient.invalidateQueries({ queryKey: ["pets"] })` after import
  - **Required columns info card**: Lists all 10 required + 4 optional fields
- **Verified end-to-end**: Created test CSV with 2 patients (Buddy the Labrador + Whiskers the DSH), uploaded, parsed correctly (2 valid rows), imported successfully (2 added), both appeared in patient list, then deleted to restore seed data

#### 3. Elimination Diet Wizard
- **Component**: `src/components/knowledge/elimination-wizard.tsx` — 4-step interactive wizard
- **Integration**: New 4th tab "Diet Wizard" in Knowledge Base module (now 4 tabs total: Elimination Protocol, Diet Wizard, Allergen Directory, Handout Builder)
- **Steps**:
  1. **Species selection**: Dog or Cat cards with example proteins
  2. **Known allergens**: Multi-select from 9 food/cross-reactive allergens (Beef, Dairy, Chicken, Wheat, Soy, Egg, Fish, Poultry cross-reactivity, Ruminant cross-reactivity) — each shows cross-reactants inline
  3. **Previous diets**: Multi-select from 14 common proteins (chicken, beef, lamb, fish, dairy, egg, wheat, soy, turkey, pork, venison, duck, rabbit, hydrolyzed) with "common in commercial diets" badges
  4. **Results**: Ranked recommendations with confidence levels (high/medium/low), "Best match" badge on top pick, "Excluded" status with reason (previously fed or cross-reacts with selected allergen)
- **Recommendation Engine**:
  - Filters NOVEL_PROTEINS by species
  - Excludes proteins previously fed (matches by name keywords)
  - Excludes proteins that cross-react with selected allergens (builds keyword set from allergen name + cross-reactants)
  - Hydrolyzed proteins get "High confidence" — gold standard
  - Common novel proteins (venison, rabbit, duck) get "High confidence"
  - Other suitable proteins get "Medium confidence"
  - Sorts: suitable (by confidence) → unsuitable
- **UI Polish**:
  - Gradient hero header on wizard card (`bg-gradient-to-r from-primary/10`)
  - Progress bar + step indicator dots (active = wide pill, completed = small dot)
  - Animated step transitions (`animate-fade-in-up` on each step)
  - Reset button (top-right)
  - "Next steps" callout card with 5-step protocol summary
  - Empty result state: "No suitable novel protein found" with hydrolyzed diet recommendation
  - Each result card has protein icon, badges (Recommended/Excluded/High confidence/Best match), reason text, italic notes
- **Verified end-to-end**: Selected Dog → Beef + Chicken allergens → Chicken/Beef/Lamb/Fish previous diets → got 6 recommendations (Venison [Best match, High], Rabbit [High], Duck [High], Hydrolyzed soy [High], Kangaroo, Pork) + 2 excluded (Hydrolyzed chicken [cross-reacts with chicken allergen], Horse [not suitable for dogs in some regions])

#### 4. Styling Polish (Phase 6)
- **13 new CSS classes/animations** in `globals.css`:
  - `hero-gradient` — ambient radial gradient for hero sections (light + dark)
  - `btn-glow` — soft glow effect on primary buttons (hover lift + shadow)
  - `step-pulse` — pulsing ring animation for active wizard steps
  - `animate-count-up` — number entrance animation
  - `animate-slide-in-top` — toast-like alert entrance
  - `severity-stripe-critical/warning/info/success` — gradient backgrounds for CDS alert cards
  - `fab-shadow` — elevated shadow for floating action buttons
  - `chevron-rotate` — animated chevron for collapsible sections (rotates 180° on open)
  - `dropzone-active` — marching-ants dashed border animation when dragging files
  - `gradient-border` — subtle gradient border using mask compositing
  - `stat-shimmer` — skeleton shimmer variant for stat cards
  - `inset-soft` — subtle inset shadow for nested panels
  - `tab-underline` — gradient underline on active tab
  - `animate-success-bounce` — bounce-in animation for success indicators
  - `row-disabled` — faded disabled row style

#### 5. Bug Fix (Pre-existing)
- **DeleteDialog cache invalidation**: Previously used raw `fetch` without `queryClient.invalidateQueries`. Switched to `useDeletePet` mutation hook + explicit invalidation of both `pets` and `appointments` query keys.
- **DELETE API idempotency**: Wrapped `db.pet.delete` in try/catch — returns `{ ok: true }` even if record not found (idempotent delete, prevents 500 errors on double-click).

### Verification Results (Phase 6)
- ✅ Clinical Alerts on Mochi: 3 alerts (2 info, 1 success) — French Bulldog breed predisposition, neutered+overweight, VAS improving
- ✅ Clinical Alerts on Luna: 5 alerts (1 critical, 1 warning, 3 info) — obese critical with cat hepatic lipidosis warning, cat weight-loss caution, DSH breed, senior screening, neutered+overweight
- ✅ CSV Import: 2-patient test CSV uploaded, parsed (2 valid), imported (2 added), patients appeared in list
- ✅ CSV Template: Downloadable from import dialog
- ✅ CSV Validation: Per-row errors and warnings displayed in preview table
- ✅ CSV Import progress bar: animated 0-100% during sequential POST
- ✅ Elimination Wizard: 4 steps functional, recommendation engine correctly excludes allergens and previously-fed proteins, ranks by confidence
- ✅ Wizard "Best match" badge on top recommendation
- ✅ Knowledge Base: 4 tabs visible (Elimination Protocol, Diet Wizard, Allergen Directory, Handout Builder)
- ✅ Delete dialog bug fix: Whiskers deleted, list refreshed immediately showing "3 in your care"
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: no runtime errors, all APIs returning 200

### Files Created/Modified (Phase 6)
**New files**:
- `src/lib/clinical-alerts.ts` — CDS engine (8 alert types, 11 breed predispositions)
- `src/lib/import-utils.ts` — CSV parser, template, row-to-payload converter
- `src/components/crm/clinical-alerts.tsx` — Collapsible alerts panel UI
- `src/components/crm/csv-import-dialog.tsx` — 4-phase import dialog with preview table
- `src/components/knowledge/elimination-wizard.tsx` — 4-step novel protein wizard

**Modified files**:
- `src/components/modules/crm.tsx` — Added ClinicalAlerts to Profile tab, CsvImportDialog with Upload button, fixed DeleteDialog cache invalidation
- `src/components/modules/knowledge.tsx` — Added 4th "Diet Wizard" tab with EliminationWizard
- `src/app/api/pets/[id]/route.ts` — Made DELETE idempotent
- `src/app/globals.css` — 13 new CSS animations/classes for Phase 6 polish

### Unresolved Issues / Risks
1. **CDS alerts are rule-based** — currently no AI/LLM integration. Could add LLM-powered natural language alert summaries or contextual recommendations in a future phase.
2. **CSV import is sequential** — fine for tens of patients but could be slow for hundreds. Could add a batch transaction mode.
3. **Elimination Diet Wizard recommendations are static** — based on the existing NOVEL_PROTEINS list. Could integrate with the LLM to suggest regionally available commercial diets.
4. **Breed predisposition database is limited** — only 11 breeds mapped. Could expand to cover more breeds or fetch from an external API.
5. **No persistence for elimination wizard results** — wizard results are not saved to a pet record. Could add "Save recommendation to pet" feature.

### Priority Recommendations for Next Phase (Phase 7)
1. **Server-side PDF generation** — Playwright-based API route for true one-click PDF download (no browser print dialog).
2. **Real-time consultation mode** — dedicated "live consultation" view combining voice scribe + auto-timeline + quick-add buttons for common findings.
3. **Custom treatment templates** — allow vets to create and save their own custom treatment plan templates (currently 10 built-in templates are read-only).
4. **Communication log persistence** — migrate Owner Communication Log from localStorage to a Prisma model for cross-device sync.
5. **Appointment reminders** — in-app notification badge for upcoming appointments within 24/48 hours.
6. **Owner portal / sharing** — generate a shareable link for the PDF report (with expiry) so owners can view online.
7. **Drug interaction checker** — extend CDS to flag drug interactions when medications are mentioned in consultation notes.
8. **Allergen directory expansion** — add more species-specific allergens and regional pollens.

---

## Phase 5 — Multi-Patient Comparison & Health Summary

### QA Assessment (agent-browser)
- ✅ All Phase 1-4 features verified functional (Dashboard with 3 tabs, CRM with 6 tabs, Nutrition, Knowledge Base, Analytics, Command Palette, CSV Export, Quick Templates, Appointments, Weight Projection, Treatment Templates, Owner Communication Log)
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: running clean, all API routes returning 200
- 🐛 **Bug Fixed**: `React.useId()` called conditionally in Sparkline component — moved before early return

### New Features Added (Phase 5)

#### 1. Multi-Patient Comparison View
- **Component**: `src/components/modules/comparison.tsx`
- **Location**: New "Compare" tab on Dashboard (3 tabs: Overview, Analytics, Compare)
- **Features**:
  - Select up to 4 patients to compare side-by-side
  - Patient selector with checkboxes and color-coded indicators (teal, emerald, amber, orange, violet, cyan)
  - **Side-by-side comparison table** with 11 metrics:
    - Species, Age, Weight (kg), Weight Δ, BCS (1-9), Latest VAS, VAS Δ, Visits, Photos, Diet Plans, Upcoming Appts
  - Color-coded trend indicators (good/warn/bad tones with ↑↓→ icons)
  - Click patient name in table header to jump to their record
  - **Weight vs Target bar chart** — current + target side-by-side per patient
  - **Latest VAS bar chart** — color-coded by severity (green ≤3, amber 4-6, red 7-10)
  - **Multi-metric radar chart** — BCS, VAS, Visits, Photos, Diets normalized comparison
  - **VAS trend line chart** — pruritus progression over time across all selected patients
  - Empty state with CTA when no patients selected
  - Animated entrance (fade-in-up)
- **Verified**: 3 patients selected (Biscuit, Luna, Mochi), all charts render, table populated with correct metrics

#### 2. Pet Health Summary with Sparklines
- **Components**: `src/components/crm/sparkline.tsx` (Sparkline + HealthMetricSpark), `src/components/crm/health-summary.tsx`
- **Location**: Top of pet Profile tab (full width, above Patient Vitals card)
- **Features**:
  - **4 health metric cards** with inline SVG sparklines:
    - Weight (kg) with trend arrow
    - BCS (/9) with status label
    - Pruritus VAS (/10) with trend
    - Visits count
  - **Lightweight pure-SVG sparklines** — no chart library overhead, gradient fill + animated path draw
  - Smart trend detection: Weight "down" = good if overweight goal; VAS "down" = always good
  - Days-since-last-visit badge
  - Status banner with VAS severity color (green/amber/red) and improvement indicator
  - "Not enough data for trend" fallback for metrics with <2 data points
  - Card hover lift effect
- **Verified on Mochi**: Weight 11.2kg (↓0.6kg trend), BCS 6/9 Overweight, VAS 2/10 (↓5 pts trend), 5 visits, "Minimal itching — improving" banner

#### 3. Styling Polish (Phase 5)
- **New CSS animations** added to `globals.css`:
  - `animate-fade-in-up` — entrance animation for cards/content
  - `animate-scale-in` — dialog/popover entrance
  - `animate-slide-in-right` — panel slide-in
  - `shimmer` — skeleton loading effect
  - `sparkline-draw` — animated SVG path drawing
  - `pulse-ring` — attention indicator
  - `gradient-text` — teal-emerald gradient for emphasis
  - `card-hover-lift` — subtle hover elevation
- Smooth tab transitions (fade-in-up on tab change)
- Color-coded trend indicators throughout comparison table
- Animated sparkline path drawing on mount

### Verification Results (Phase 5)
- ✅ Dashboard: 3 tabs visible (Overview, Analytics, Compare)
- ✅ Compare tab: patient selector with 3/4 selected, comparison table with 11 metrics
- ✅ Compare charts: Weight vs Target, Latest VAS, Multi-metric radar, VAS trend — all rendering
- ✅ Health Summary: visible on Mochi's Profile tab with 4 sparkline cards
- ✅ Sparklines: weight trend (↓0.6kg) and VAS trend (↓5 pts) animating correctly
- ✅ Status banner: "Minimal itching — improving" with green background
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: no runtime errors

---

## Phase 4 — Treatment Templates & Owner Communication Log

### QA Assessment (agent-browser)
- ✅ All Phase 1, 2 & 3 features verified functional (Dashboard, CRM with 6 tabs, Nutrition, Knowledge Base, Analytics, Command Palette, CSV Export, Quick Templates, Appointments, Weight Projection)
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: running clean, all API routes returning 200
- No bugs found — project is stable

### New Features Added (Phase 4)

#### 1. Treatment Plan Templates Library
- **Library**: `src/lib/treatment-templates.ts` — 10 pre-built clinical protocols
- **Component**: `src/components/crm/treatment-templates.tsx` — browse + apply dialog
- **Integration**: Added "Templates" button to Consultation Timeline header
- **Categories**:
  - **Dermatology** (4): Atopic Dermatitis Flare, Otitis Externa Treatment, Food Allergy Elimination Trial, Superficial Pyoderma
  - **Nutrition** (3): Weight Loss Program Initiation, Diet Transition Protocol, BARF Diet Setup
  - **Wellness** (2): Senior Wellness Exam, Vaccination Visit
  - **Emergency** (1): Acute Vomiting Workup
- **Features**:
  - Each template has full SOAP-format notes (Subjective/Objective/Assessment/Plan)
  - Suggested VAS score, type, chief complaint
  - Searchable by name, description, complaint, or notes content
  - Category filter buttons with counts
  - Expandable cards showing SOAP notes preview before applying
  - One-click "Apply Template" creates a new consultation entry instantly
  - Toast confirmation: "Applied: [template name]"
  - Integrated with empty state of Timeline (shows "Browse Templates" CTA when no consultations)
- **Verified**: Applied "Senior Wellness Exam" to Biscuit → entry created with full SOAP notes, count went from 1 → 2

#### 2. Owner Communication Log
- **Component**: `src/components/crm/owner-communication-log.tsx`
- **Integration**: New "Comms" tab on pet detail (6 tabs total now)
- **Storage**: localStorage (per-pet key) — lightweight, no DB schema change needed
- **Features**:
  - 5 communication channels: Phone Call, Email, Text Message, Video Call, In-Person
  - Each channel has distinct icon + color (teal/violet/emerald/amber/rose)
  - Direction tracking: Outbound (I contacted them) vs Inbound (they contacted me)
  - Duration tracking (minutes) for calls
  - Subject + Notes fields
  - **Follow-up flag**: Mark entries needing follow-up with amber badge + highlighted box
  - Stats in header: total entries, days since last contact, pending follow-ups count
  - Chronological list with channel-colored icons
  - Add Contact dialog with all fields + smart defaults (current date/time)
  - Delete entries on hover
  - Rich empty state with explanatory text and CTA
- **Use case**: Track every phone call, email, text, or in-person conversation with pet owners for continuity of care — critical for multi-visit cases like elimination diet trials

#### 3. Styling Polish (Phase 4)
- Enhanced Timeline empty state: icon + descriptive text + dual CTA buttons (Browse Templates / Add Entry)
- 6-tab layout in pet detail (was 5) — wider tab list to accommodate Comms
- Treatment template cards with category-colored badges and expandable SOAP preview
- Communication log entries with channel-colored icon backgrounds
- Follow-up badges with amber highlight for entries needing action
- Direction badges (Inbound/Outbound) with color coding

### Verification Results (Phase 4)
- ✅ Treatment Templates dialog: opens from Timeline tab, shows 10 templates across 4 categories
- ✅ Template search: filters by name/description/complaint/notes
- ✅ Template filter: category buttons with counts (All 10, Dermatology 4, Nutrition 3, Wellness 2, Emergency 1)
- ✅ Template expand: SOAP notes preview before applying
- ✅ Template apply: creates consultation entry with full notes + VAS, toast confirmation shown
- ✅ Biscuit consultation count: 1 → 2 after applying Senior Wellness Exam template
- ✅ Owner Communication Log: new "Comms" tab visible (6 tabs total)
- ✅ Comms empty state: icon + descriptive text + "Log First Contact" CTA
- ✅ Comms form: all fields functional (channel, direction, date, time, duration, subject, notes, follow-up)
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: no runtime errors

---

## Phase 3 — Appointment Scheduling & Weight Projection

### QA Assessment (agent-browser)
- ✅ All Phase 1 & 2 features verified functional (Dashboard, CRM, Nutrition, Knowledge Base, Analytics, Command Palette, CSV Export, Quick Templates)
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: running clean, all API routes returning 200
- 🐛 **Bug Fixed**: Prisma client needed regeneration after schema change — regenerated and restarted dev server

### New Features Added (Phase 3)

#### 1. Appointment Scheduling System
- **Prisma Model**: `Appointment` (petId, date, duration, type, reason, status, notes)
- **API Routes**: `src/app/api/appointments/route.ts` (GET/POST), `src/app/api/appointments/[id]/route.ts` (PATCH/DELETE)
- **Component**: `src/components/appointment-scheduler.tsx`
- **Features**:
  - Calendar-style list grouped by day with sticky date headers
  - 4 appointment types: Consultation, Recheck, Procedure, Telemedicine (each with icon + color)
  - 4 statuses: Scheduled, Completed, Cancelled, No-show
  - "Next appointment in X days" indicator
  - Today/Tomorrow badges with highlighted styling
  - Expandable cards with notes
  - One-click mark-as-completed, delete
  - Click patient name to jump to their record
  - Schedule form dialog: patient picker, date, time, duration (15-90min), type, reason, notes
  - Relative day labels (Today, Tomorrow, weekday, or date)
  - Duration badges
- **Seed Data**: 5 upcoming appointments across all 3 patients (rechecks, telemedicine, procedure, consultation)
- **Location**: Dashboard Overview tab, right column beside Recent Activity

#### 2. Weight Goal Projection Chart
- **Component**: `src/components/crm/weight-projection.tsx`
- **Features**:
  - Historical weight data from consultations + projected trajectory
  - ComposedChart with actual (solid line) + projected (dashed area) data
  - Target weight reference line
  - Progress bar (% to goal from starting weight)
  - Weekly rate calculation from consultation history (with confidence levels)
  - Comparison to recommended rate (1-2% body weight/week)
  - ETA projection (target date calculation)
  - Smart status banners:
    - "On track" (green) when rate is in recommended range
    - "Progress slower than ideal" (amber) with actionable advice
    - "Too fast" (red) with cat-specific hepatic lipidosis warning
  - 3-stat grid: Weekly Rate, Recommended range, ETA
  - Only shows when pet has a target weight set and isn't already at target
- **Location**: Pet Profile tab (below Weight Trend chart)
- **Verified**: Luna (no history, uses default rate, 27wk ETA), Mochi (has history, detected 0.03kg/wk actual rate, 46% progress, "slower than ideal" warning, Nov 14 ETA)

#### 3. Styling Polish (Phase 3)
- Appointment cards with type-colored time blocks (teal/emerald/amber/violet)
- Sticky day headers in appointment list
- Today/Tomorrow cards with subtle highlight backgrounds
- Weight projection chart with gradient fill on projected area
- Status banners with context-aware colors (green/amber/red)
- Progress bars with start/current/target labels

### Verification Results (Phase 3)
- ✅ Appointments API: 200 (GET returns 5 appointments with pet info)
- ✅ Dashboard: "Upcoming Appointments" panel visible with all 5 appointments grouped by day
- ✅ "next in 3 days" indicator working
- ✅ Appointment form: all fields functional (patient, date, time, duration, type, reason, notes)
- ✅ Weight Projection (Luna): 27wk to target, default rate, ETA Dec 26 2026
- ✅ Weight Projection (Mochi): 46% progress, 0.03kg/wk actual rate, "slower than ideal" warning, ETA Nov 14 2026
- ✅ Lint: 0 errors, 0 warnings
- ✅ All API routes: 200

---

## Phase 2 — UX Enhancements & Analytics

### QA Assessment (agent-browser)
- ✅ Dashboard, CRM (all 5 tabs), Nutrition (all 3 calculators), Knowledge Base — all functional
- ✅ Report generation with sequential AI handouts — working
- ✅ Dark mode toggle — working
- ✅ New Patient form — working
- ✅ Mobile responsive (390px) — working
- ✅ Lint: 0 errors, 0 warnings
- 🐛 **Bug Fixed**: `src/app/api/pets/[id]/consultations/route.ts` had typo `next.server` instead of `next/server` — fixed

### New Features Added (Phase 2)

#### 1. Global Command Palette (Cmd+K / Ctrl+K)
- **File**: `src/components/command-palette.tsx`
- Press Cmd+K (Mac) or Ctrl+K (Windows/Linux) anywhere to open
- Quick navigation to all 4 modules
- Instant patient search (by name, breed, owner, species)
- Quick actions: toggle theme, add patient, generate report
- Search button in sidebar with ⌘K shortcut hint
- Mobile: search icon in top bar

#### 2. Dashboard Analytics Tab
- **File**: `src/components/modules/analytics.tsx`
- Practice Health Score (composite metric with SVG circular gauge)
- Species distribution pie chart
- BCS distribution bar chart (under/ideal/over/obese)
- VAS trend area chart (monthly average across all patients)
- Consultation types horizontal bar chart
- Weight management insights (per-patient progress bars with % over target)
- Life stage radar chart
- Mini metrics: Avg BCS, Avg VAS, Ideal BCS %

#### 3. CSV Data Export
- **File**: `src/lib/export-utils.ts`
- Export all patients to CSV (20 columns including demographics, metrics, visit counts)
- Export all consultations to CSV (pet, date, type, VAS, weight, notes)
- UTF-8 BOM for Excel compatibility
- Proper CSV escaping (commas, quotes, newlines)
- Buttons: Dashboard header (patients CSV) + CRM sidebar (consultations CSV)

#### 4. Consultation Quick-Templates
- **File**: `src/components/crm/consultation-timeline.tsx`
- 5 pre-built templates for common visit types:
  - Recheck Visit (appointment)
  - Skin Scrape (diagnostic)
  - Allergy Shot (treatment)
  - Diet Consult (appointment)
  - Phone Follow-up (note)
- One-click fills type, chief complaint, and notes
- Vet can then edit before saving — saves ~30s per common entry

#### 5. Styling Polish
- Active nav indicator (left accent bar on active module)
- Gradient sidebar stats card
- Search trigger button in sidebar with keyboard shortcut display
- Footer: "⌘K to search" hint
- Scrollable nav with custom scrollbar
- Better mobile header with search icon

### Verification Results (Phase 2)
- ✅ Command Palette: opens with Cmd+K, shows 3 sections (Navigate/Patients/Actions), patient search works
- ✅ Analytics: Practice Health Score=53, Avg BCS=6.0, Avg VAS=4.6, all 5 charts render correctly
- ✅ CSV Export: buttons visible on dashboard and CRM
- ✅ Quick Templates: 5 template buttons visible in Add Consultation dialog, auto-fills form fields
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: running clean, no runtime errors

---

## Current Project Status (Phase 1 — MVP Complete)

### Architecture
- **Framework**: Next.js 16 (App Router) + TypeScript 5 + Turbopack
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York) — custom clinical teal/emerald theme (no indigo/blue)
- **Database**: Prisma ORM + SQLite (`db/custom.db`)
- **State**: Zustand (active module/pet) + TanStack Query (server state)
- **AI**: z-ai-web-dev-sdk (ASR for voice transcription, LLM for note parsing & handout generation)
- **Charts**: Recharts (VAS trend, weight trend, macro breakdown, pie charts)
- **Theme**: next-themes (light/dark) — light default

### Database Schema (4 models)
- `Pet` — vitals + nutritional baseline (species, breed, weight, BCS, life stage, activity)
- `Consultation` — timeline entries (appointment/diagnostic/treatment/note) with VAS + weight + transcript
- `LesionPhoto` — dermatology gallery with base64 data URLs, VAS, body region
- `DietPlan` — RER/MER + macros (JSON) + template breakdown (JSON)

Seed data: 3 patients (Mochi the Frenchie w/ atopic dermatitis, Luna the obese DSH, Biscuit the Golden puppy), 7 consultations, 3 lesion photos (SVG placeholders with before/after), 3 diet plans.

---

## Completed Modules

### 1. Dashboard (`src/components/modules/dashboard.tsx`)
- Stat cards: Active Patients, Avg Pruritus VAS, Overweight/Obese count, Total Visits
- Recent consultation activity feed (clickable → opens patient)
- Patient quick-list sidebar
- Quick-action cards for the 3 core value props

### 2. Patients CRM (`src/components/modules/crm.tsx` + `src/components/crm/*`)
- **Pet list panel**: search (name/breed/owner), species-colored avatars, BCS/VAS badges
- **Pet detail** with 5 tabs:
  - Profile (vitals + nutritional baseline with RER/MER + weight trend chart)
  - Timeline (chronological consultation feed with type icons, VAS, weight)
  - Gallery (lesion photos + VAS progress line chart with mild/severe reference lines)
  - Diet (saved plans with RER/MER + macro bar chart + template breakdown)
  - Scribe (AI Voice Scribe — see below)
- **AI Voice Scribe** (`voice-scribe.tsx`):
  - MediaRecorder API → base64 → `/api/ai/transcribe` (ASR) → transcript
  - Live audio waveform visualization (32 bars, animated by frequency data)
  - "AI Auto-Fill" → `/api/ai/parse-notes` (LLM) → structured fields (weight, BCS, VAS, symptoms, chief complaint, diet, treatment, diagnostics, summary)
  - "Save to Timeline & Update Card" — creates consultation entry + updates pet weight/BCS
- **Pet form** (add/edit dialog) — full vitals + nutritional baseline
- **Report generation** (`report-view.tsx`) — see #4

### 3. Nutritionist Assistant (`src/components/modules/nutrition.tsx`)
Three calculators in tabs:
- **RER/MER Calculator**: allometric RER (70×W^0.75), MER factors by species/life-stage/activity/neuter status, weight-status recommendations, save-to-pet
- **Dry Matter Converter**: guaranteed analysis (as-fed) → DM basis, ME kcal estimate (modified Atwater), comparison bar chart
- **Diet Template Builder**: BARF/home-cooked constructor with category/ingredient/percentage rows, presets (BARF Dog, Home-Cooked, Puppy BARF), pie chart, gram calculations from daily kcal, save-to-pet

### 4. Knowledge Base (`src/components/modules/knowledge.tsx`)
- **Elimination Diet Protocol**: 7-step interactive checklist grouped by phase (Preparation → Selection → Transition → Strict Elimination → Monitoring → Rechallenge → Long-term), progress bar, quick dietary-indiscretion log, novel protein reference
- **Allergen Directory**: 14 allergens (environmental/food/cross-reactive) with cross-reactants + safe alternatives, search + category filter
- **Client Handout Builder**: 6 templates → 2-click AI generation → markdown render → print/download as HTML

### 5. Branded PDF Report (`src/components/crm/report-view.tsx`)
The core "hook" — **Hands-Free Consultation to Beautiful PDF**:
- Aggregates: patient profile, latest clinical summary, weight + VAS progress charts, nutrition plan (RER/MER/macros), condensed consultation history, and selected AI-generated client handouts
- Branded header (VetDietDerm Clinic logo + teal accent)
- Handout selector (checkboxes) with sequential AI generation (rate-limit-safe)
- Print-optimized CSS (`@media print` + `.report-print-area`) → browser "Save as PDF"
- Minimal markdown→HTML renderer (headings, bold, lists, tables)

### API Routes (`src/app/api/*`)
- `pets/route.ts`, `pets/[id]/route.ts` — CRUD
- `pets/[id]/consultations/route.ts`, `consultations/[id]/route.ts` — timeline
- `pets/[id]/photos/route.ts`, `photos/[id]/route.ts` — gallery
- `diet-plans/route.ts`, `diet-plans/[id]/route.ts` — diet plans
- `ai/transcribe/route.ts` — ASR (z-ai-web-dev-sdk `audio.asr.create`)
- `ai/parse-notes/route.ts` — LLM parse transcript → structured JSON
- `ai/handout/route.ts` — LLM generate handout markdown (with 429 retry logic)

---

## Verification Results (agent-browser)
- ✅ Dashboard renders with seeded data (3 patients, 6 recent consultations, stat cards)
- ✅ CRM: pet list → detail → all 5 tabs functional
- ✅ RER/MER calculator: RER 451, MER 722 kcal/day for 12kg dog (verified correct)
- ✅ Knowledge Base: Elimination protocol (7 steps), Allergen directory (14 entries), Handout Builder (AI generation confirmed — 3-5s per handout)
- ✅ Report: all 3 selected handouts generate sequentially, charts render, print dialog works
- ✅ Mobile (390px) responsive: mobile nav bar, stacked layout
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: no runtime errors, API routes all returning 200

---

## Unresolved Issues / Risks
1. **Voice Scribe requires microphone permission** — works in real browser; in headless agent-browser the mic isn't testable, but the MediaRecorder flow + ASR API endpoint (`/api/ai/transcribe` returned 200 in dev log) is verified.
2. **Handout generation takes 3-6s each** — sequential generation avoids 429 rate limits but adds wait time for 3 handouts (~15-20s total). Acceptable for the use case.
3. **PDF output is via browser print-to-PDF** (not server-side library) — chosen for reliability and zero extra dependencies. Produces vector text via `window.print()`. A future enhancement could add server-side PDF generation via Playwright for true one-click download.
4. **Lesion photos stored as base64 in SQLite** — fine for MVP scale; large clinics would need object storage.
5. **Dev server process management in sandbox** — the dev server process can be killed when bash sessions end. If the server is unresponsive, restart with `setsid bash -c 'exec bun run dev > /dev/null 2>&1 < /dev/null' &` and wait ~12 seconds.
6. **Weight projection uses linear extrapolation** — real weight loss is non-linear (plateaus, whooshes). The projection is a clinical estimate, not a guarantee. Vet should reassess every 2-4 weeks.
7. **Appointment reminders** — currently no notification system. Appointments are visible on the dashboard but there's no push/email reminder. Could add cron-based reminders in a future phase.

---

## Priority Recommendations for Next Phase (Phase 6)
1. **Server-side PDF generation** — add a Playwright-based API route that renders the report HTML → returns a downloadable PDF (true one-click, no print dialog).
2. **Real-time consultation mode** — a dedicated "live consultation" view that combines voice scribe + auto-timeline + quick-add buttons for common findings.
3. **Allergen directory expansion** — add more species-specific allergens, regional pollens, and a "build elimination diet" wizard that auto-suggests a novel protein based on the pet's known exposures.
4. **Owner portal / sharing** — generate a shareable link for the PDF report (with expiry) so owners can view online without email.
5. **Data import** — CSV import for bulk patient creation from spreadsheets (export already implemented in Phase 2).
6. **Appointment reminders** — email or in-app notifications for upcoming appointments (requires backend job scheduler).
7. **Communication log persistence** — migrate Owner Communication Log from localStorage to Prisma model for cross-device sync (currently localStorage-based).
8. **Treatment template customization** — allow vets to create and save their own custom templates (currently 10 built-in templates are read-only).
9. **Clinical decision support** — AI-powered alerts for drug interactions, breed-specific conditions, and treatment contraindications.
