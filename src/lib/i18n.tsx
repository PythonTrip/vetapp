"use client";

import * as React from "react";

export type Locale = "ru" | "en";

const messages = {
  en: {
    "language.name": "English",
    "language.short": "EN",
    "nav.home": "Home",
    "nav.homeDesc": "Overview & activity",
    "nav.patients": "Patients",
    "nav.patientsDesc": "Records & consultations",
    "nav.nutrition": "Nutrition",
    "nav.nutritionDesc": "Calculators & diet builder",
    "nav.knowledge": "Knowledge Base",
    "nav.knowledgeDesc": "Protocols & allergens",
    "nav.settings": "Settings",
    "nav.settingsDesc": "Language & appearance",
    "shell.subtitle": "Nutrition · Dermatology CRM",
    "shell.search": "Search patients...",
    "shell.mainNav": "Main navigation",
    "shell.activePatients": "Active patients",
    "shell.inCare": "in care",
    "shell.dogs": "dogs",
    "shell.cats": "cats",
    "shell.doctor": "Dr. Vet · Clinic",
    "shell.searchAction": "to search",
    "shell.footer": "Lightweight clinical workspace for veterinary nutrition & dermatology",
    "shell.footerMobile": "Vet CRM",
    "shell.powered": "Structured visits · Complete patient history",
    "theme.toggle": "Toggle theme",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "settings.eyebrow": "Application settings",
    "settings.title": "Settings",
    "settings.description": "Choose the interface language and appearance. Your preferences are saved on this device.",
    "settings.languageTitle": "Interface language",
    "settings.languageDescription": "Switch between Russian and English without leaving the current page.",
    "settings.appearanceTitle": "Appearance",
    "settings.appearanceDescription": "Choose a light or dark color scheme.",
    "settings.current": "Current",
    "dashboard.eyebrow": "Clinical overview",
    "dashboard.title": "Welcome back, Doctor",
    "dashboard.description": "Here is your practice at a glance. Start a consultation or review recent activity.",
    "dashboard.start": "Start consultation",
    "dashboard.backup": "Backup",
    "dashboard.recent": "Recent consultation activity",
    "dashboard.recentDesc": "Latest entries across all patients",
    "dashboard.viewAll": "View all",
    "dashboard.noConsultations": "No consultations yet.",
    "dashboard.patients": "Your patients",
    "dashboard.patientsDesc": "Open a complete patient record",
    "dashboard.activePatients": "Active patients",
    "dashboard.needWeight": "need weight management",
    "dashboard.avgPruritus": "Avg. pruritus (VAS)",
    "dashboard.latestVisits": "out of 10 · latest visits",
    "dashboard.overweight": "Overweight / obese",
    "dashboard.ofCaseload": "of caseload",
    "dashboard.totalVisits": "Total visits",
    "dashboard.entriesLogged": "consultation entries logged",
    "dashboard.visitTitle": "Patient workspace",
    "dashboard.visitDesc": "Open a patient record, document a structured consultation, and review the clinical timeline.",
    "dashboard.openPatients": "Open patients",
    "dashboard.calculatorsTitle": "Nutrition calculators",
    "dashboard.calculatorsDesc": "RER/MER, Dry Matter converter, and a flexible home-cooked / BARF diet builder.",
    "dashboard.openTools": "Open tools",
    "dashboard.reportTitle": "One-click PDF report",
    "dashboard.reportDesc": "Combine notes, diet plans, progress charts, and handouts into a branded owner report.",
    "dashboard.buildReport": "Build report",
    "patients.title": "Patients",
    "patients.count": "in your care",
    "patients.new": "New",
    "patients.search": "Search name, breed, owner...",
    "patients.empty": "No patients found.",
    "patients.addFirst": "Add first patient",
    "patients.select": "Select a patient",
    "patients.selectDescription": "Choose a patient from the list to view the complete record, or create a new one.",
    "patients.newPatient": "New patient",
    "patients.edit": "Edit",
    "patients.delete": "Delete",
    "patients.share": "Share",
    "patients.report": "Report",
    "patients.profile": "Profile",
    "patients.timeline": "Timeline",
    "patients.gallery": "Gallery",
    "patients.diet": "Diet",
    "patients.comms": "Comms",
    "nutrition.eyebrow": "Nutritionist assistant",
    "nutrition.title": "Nutritional Assistant",
    "nutrition.description": "One workflow: select a patient, calculate energy needs, compare foods on a dry-matter basis, and build a diet from catalog products.",
    "nutrition.catalog": "Catalog",
    "nutrition.dryMatter": "Dry Matter",
    "nutrition.dietBuilder": "Diet Builder",
    "knowledge.eyebrow": "Knowledge Base & Dermatologist Assistant",
    "knowledge.title": "Clinical Resources",
    "knowledge.description": "Quick-access protocols, an allergen cross-reference, and client handout tools for use during consultations.",
    "knowledge.protocol": "Elimination Protocol",
    "knowledge.wizard": "Diet Wizard",
    "knowledge.allergens": "Allergen Directory",
    "knowledge.handouts": "Handout Builder",
    "command.placeholder": "Search patients, navigate, or run commands...",
    "command.empty": "No results found.",
    "command.navigate": "Navigate",
    "command.actions": "Actions",
    "command.patients": "Patients",
    "command.goHome": "Go to Home",
    "command.goPatients": "Go to Patients",
    "command.goNutrition": "Go to Nutrition",
    "command.goKnowledge": "Go to Knowledge Base",
    "command.goSettings": "Go to Settings",
  },
  ru: {
    "language.name": "Русский",
    "language.short": "RU",
    "nav.home": "Главная",
    "nav.homeDesc": "Обзор и активность",
    "nav.patients": "Пациенты",
    "nav.patientsDesc": "Карточки и приёмы",
    "nav.nutrition": "Питание",
    "nav.nutritionDesc": "Расчёты и конструктор рационов",
    "nav.knowledge": "База знаний",
    "nav.knowledgeDesc": "Протоколы и аллергены",
    "nav.settings": "Настройки",
    "nav.settingsDesc": "Язык и оформление",
    "shell.subtitle": "Питание · Дерматология · CRM",
    "shell.search": "Поиск пациентов...",
    "shell.mainNav": "Основная навигация",
    "shell.activePatients": "Активные пациенты",
    "shell.inCare": "под наблюдением",
    "shell.dogs": "собак",
    "shell.cats": "кошек",
    "shell.doctor": "Врач · Клиника",
    "shell.searchAction": "для поиска",
    "shell.footer": "Рабочее пространство ветеринарного диетолога и дерматолога",
    "shell.footerMobile": "Вет CRM",
    "shell.powered": "Структурированные приёмы · Единая история пациента",
    "theme.toggle": "Переключить тему",
    "theme.light": "Светлая",
    "theme.dark": "Тёмная",
    "settings.eyebrow": "Настройки приложения",
    "settings.title": "Настройки",
    "settings.description": "Выберите язык интерфейса и оформление. Настройки сохраняются на этом устройстве.",
    "settings.languageTitle": "Язык интерфейса",
    "settings.languageDescription": "Переключайтесь между русским и английским, не покидая текущую страницу.",
    "settings.appearanceTitle": "Оформление",
    "settings.appearanceDescription": "Выберите светлую или тёмную цветовую схему.",
    "settings.current": "Выбрано",
    "dashboard.eyebrow": "Клинический обзор",
    "dashboard.title": "С возвращением, доктор",
    "dashboard.description": "Краткий обзор клиники: начните приём или посмотрите недавнюю активность.",
    "dashboard.start": "Начать приём",
    "dashboard.backup": "Резервная копия",
    "dashboard.recent": "Недавние приёмы",
    "dashboard.recentDesc": "Последние записи по всем пациентам",
    "dashboard.viewAll": "Показать все",
    "dashboard.noConsultations": "Приёмов пока нет.",
    "dashboard.patients": "Ваши пациенты",
    "dashboard.patientsDesc": "Открыть полную карточку пациента",
    "dashboard.activePatients": "Активные пациенты",
    "dashboard.needWeight": "нужен контроль веса",
    "dashboard.avgPruritus": "Средний зуд (VAS)",
    "dashboard.latestVisits": "из 10 · последние визиты",
    "dashboard.overweight": "Лишний вес / ожирение",
    "dashboard.ofCaseload": "от всех пациентов",
    "dashboard.totalVisits": "Всего визитов",
    "dashboard.entriesLogged": "записей о приёмах",
    "dashboard.visitTitle": "Рабочее место врача",
    "dashboard.visitDesc": "Откройте карточку пациента, оформите структурированный приём и просмотрите клиническую историю.",
    "dashboard.openPatients": "Открыть пациентов",
    "dashboard.calculatorsTitle": "Расчёты питания",
    "dashboard.calculatorsDesc": "RER/MER, пересчёт на сухое вещество и конструктор домашних и BARF-рационов.",
    "dashboard.openTools": "Открыть инструменты",
    "dashboard.reportTitle": "PDF-отчёт в один клик",
    "dashboard.reportDesc": "Объедините заметки, рацион, графики и памятки в фирменный отчёт для владельца.",
    "dashboard.buildReport": "Создать отчёт",
    "patients.title": "Пациенты",
    "patients.count": "под наблюдением",
    "patients.new": "Создать",
    "patients.search": "Имя, порода или владелец...",
    "patients.empty": "Пациенты не найдены.",
    "patients.addFirst": "Добавить первого пациента",
    "patients.select": "Выберите пациента",
    "patients.selectDescription": "Выберите пациента в списке, чтобы открыть полную карточку, или создайте нового.",
    "patients.newPatient": "Новый пациент",
    "patients.edit": "Изменить",
    "patients.delete": "Удалить",
    "patients.share": "Поделиться",
    "patients.report": "Отчёт",
    "patients.profile": "Профиль",
    "patients.timeline": "История",
    "patients.gallery": "Галерея",
    "patients.diet": "Рацион",
    "patients.comms": "Связь",
    "nutrition.eyebrow": "Ассистент диетолога",
    "nutrition.title": "Диетологический ассистент",
    "nutrition.description": "Единый процесс: выберите пациента, рассчитайте потребность в энергии, сравните корма по сухому веществу и соберите рацион из каталога.",
    "nutrition.catalog": "Каталог",
    "nutrition.dryMatter": "Сухое вещество",
    "nutrition.dietBuilder": "Конструктор рациона",
    "knowledge.eyebrow": "База знаний и ассистент дерматолога",
    "knowledge.title": "Клинические материалы",
    "knowledge.description": "Протоколы, справочник перекрёстных аллергенов и инструменты для памяток владельцу во время приёма.",
    "knowledge.protocol": "Элиминационный протокол",
    "knowledge.wizard": "Подбор рациона",
    "knowledge.allergens": "Справочник аллергенов",
    "knowledge.handouts": "Памятки",
    "command.placeholder": "Найдите пациента, раздел или команду...",
    "command.empty": "Ничего не найдено.",
    "command.navigate": "Навигация",
    "command.actions": "Действия",
    "command.patients": "Пациенты",
    "command.goHome": "Перейти на главную",
    "command.goPatients": "Перейти к пациентам",
    "command.goNutrition": "Перейти к питанию",
    "command.goKnowledge": "Перейти в базу знаний",
    "command.goSettings": "Перейти в настройки",
  },
} as const;

export type MessageKey = keyof typeof messages.en;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);
const STORAGE_KEY = "vetdietderm-locale";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>("en");

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const nextLocale: Locale =
      stored === "ru" || stored === "en"
        ? stored
        : window.navigator.language.toLowerCase().startsWith("ru")
          ? "ru"
          : "en";
    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
  }, []);

  const setLocale = React.useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
  }, []);

  const value = React.useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => messages[locale][key],
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
