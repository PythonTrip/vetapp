"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Stethoscope,
  Users,
  Calculator,
  BookOpen,
  LayoutDashboard,
  PawPrint,
  Moon,
  Sun,
  HeartPulse,
  Search,
  Command,
  Settings,
  Languages,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { usePets } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardModule } from "@/components/modules/dashboard";
import { CrmModule } from "@/components/modules/crm";
import { NutritionModule } from "@/components/modules/nutrition";
import { KnowledgeModule } from "@/components/modules/knowledge";
import { SettingsModule } from "@/components/modules/settings";
import { CommandPalette } from "@/components/command-palette";
import { AppointmentReminders } from "@/components/appointment-reminders";
import { useI18n, type MessageKey } from "@/lib/i18n";
import {
  projectIdFromPathname,
  sectionFromPathname,
  type AppSection,
} from "@/lib/navigation";

const NAV_ITEMS: {
  id: AppSection;
  href: string;
  label: MessageKey;
  icon: React.ElementType;
  desc: MessageKey;
}[] = [
  { id: "dashboard", href: "/", label: "nav.home", icon: LayoutDashboard, desc: "nav.homeDesc" },
  { id: "projects", href: "/projects", label: "nav.projects", icon: Users, desc: "nav.projectsDesc" },
  { id: "nutrition", href: "/nutrition", label: "nav.nutrition", icon: Calculator, desc: "nav.nutritionDesc" },
  { id: "knowledge", href: "/knowledge", label: "nav.knowledge", icon: BookOpen, desc: "nav.knowledgeDesc" },
  { id: "settings", href: "/settings", label: "nav.settings", icon: Settings, desc: "nav.settingsDesc" },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" />;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="h-9 w-9 rounded-full"
      aria-label={t("theme.toggle")}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const nextLocale = locale === "en" ? "ru" : "en";
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLocale(nextLocale)}
      className="h-9 gap-1 rounded-full px-2 text-[11px] font-semibold"
      aria-label={`${t("settings.languageTitle")}: ${t("language.name")}`}
    >
      <Languages className="h-4 w-4" />
      {t("language.short")}
    </Button>
  );
}

export function AppShell() {
  const pathname = usePathname();
  const activeSection = sectionFromPathname(pathname);
  const activeProjectId = projectIdFromPathname(pathname);
  const { data: pets } = usePets();
  const { t } = useI18n();
  const [cmdOpen, setCmdOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCmdOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="grid h-dvh grid-rows-[1fr_auto] overflow-hidden bg-background md:grid-cols-[16rem_1fr]">
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />

      <aside className="hidden h-full min-h-0 w-64 shrink-0 flex-col overflow-y-auto border-r bg-sidebar row-start-1 col-start-1 md:flex">
        <Link href="/" className="flex h-16 items-center gap-2.5 border-b px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-sm">
            <PawPrint className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-bold text-[15px] tracking-tight">VetDietDerm</span>
            <span className="text-[10px] font-medium text-muted-foreground">{t("shell.subtitle")}</span>
          </div>
        </Link>

        <div className="p-3">
          <button
            onClick={() => setCmdOpen(true)}
            className="group flex w-full items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-background"
          >
            <Search className="h-3.5 w-3.5" />
            <span>{t("shell.search")}</span>
            <kbd className="ml-auto flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[9px] font-mono font-semibold">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 scrollbar-thin" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const active = activeSection === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary-foreground/80" />
                )}
                <item.icon
                  className={cn(
                    "mt-0.5 shrink-0",
                    active ? "" : "text-muted-foreground group-hover:text-foreground",
                  )}
                  style={{ width: 18, height: 18 }}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-semibold leading-tight">{t(item.label)}</span>
                  <span
                    className={cn(
                      "mt-0.5 text-[11px] leading-tight",
                      active ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {t(item.desc)}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t p-3">
          <div className="rounded-xl border border-border/50 bg-gradient-to-br from-sidebar-accent/80 to-sidebar-accent/40 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <HeartPulse className="h-3.5 w-3.5 text-primary" />
              {t("shell.activeProjects")}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular-nums">{pets?.length ?? 0}</span>
              <span className="text-xs text-muted-foreground">{t("shell.inCare")}</span>
            </div>
            <div className="mt-2 flex gap-1">
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <PawPrint className="h-2.5 w-2.5" />
                {pets?.filter((pet) => pet.species === "dog").length ?? 0} {t("shell.dogs")}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {pets?.filter((pet) => pet.species === "cat").length ?? 0} {t("shell.cats")}
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Stethoscope className="h-3.5 w-3.5" />
              <span>{t("shell.doctor")}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <AppointmentReminders />
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden row-start-1 md:col-start-2">
        <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b bg-sidebar px-4 md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground">
              <PawPrint className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold">VetDietDerm</span>
          </Link>
          <div className="flex items-center gap-0.5">
            <AppointmentReminders />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setCmdOpen(true)}
              aria-label={t("shell.search")}
            >
              <Search className="h-4 w-4" />
            </Button>
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>

        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-2 scrollbar-thin md:hidden" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const active = activeSection === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground",
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {t(item.label)}
              </Link>
            );
          })}
        </nav>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {activeSection === "dashboard" && <DashboardModule />}
          {activeSection === "projects" && <CrmModule projectId={activeProjectId} />}
          {activeSection === "nutrition" && <NutritionModule />}
          {activeSection === "knowledge" && <KnowledgeModule />}
          {activeSection === "settings" && <SettingsModule />}
        </main>
      </div>

      <footer className="col-span-full row-start-2 flex shrink-0 items-center justify-between border-t bg-sidebar/50 px-6 py-3 text-[11px] text-muted-foreground backdrop-blur">
        <div className="flex items-center gap-1.5">
          <PawPrint className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium text-foreground/80">VetDietDerm</span>
          <span className="hidden sm:inline">· {t("shell.footer")}</span>
          <span className="sm:hidden">· {t("shell.footerMobile")}</span>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <Command className="h-3 w-3" />
            <kbd className="font-mono font-semibold">K</kbd>
            <span>{t("shell.searchAction")}</span>
          </button>
          <span className="text-foreground/40">·</span>
          <span>{t("shell.powered")}</span>
          <span className="text-foreground/40">·</span>
          <span className="version-badge">v1.5</span>
        </div>
      </footer>
    </div>
  );
}
