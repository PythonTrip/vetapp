"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calculator,
  CalendarDays,
  Moon,
  PawPrint,
  Settings,
  Stethoscope,
  Sun,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { sectionFromPathname, type AppSection } from "@/lib/navigation";

const NAV_ITEMS: {
  id: AppSection;
  href: string;
  label: string;
  desc: string;
  icon: React.ElementType;
}[] = [
  {
    id: "patients",
    href: "/patients",
    label: "Пациенты",
    desc: "Клиенты и животные",
    icon: Users,
  },
  {
    id: "schedule",
    href: "/schedule",
    label: "Расписание",
    desc: "Записи на приём",
    icon: CalendarDays,
  },
  {
    id: "encounter",
    href: "/encounter",
    label: "Приём",
    desc: "Рабочее место врача",
    icon: Stethoscope,
  },
  {
    id: "nutrition",
    href: "/nutrition",
    label: "Питание",
    desc: "Рацион и оценка FEDIAF",
    icon: Calculator,
  },
  {
    id: "settings",
    href: "/settings",
    label: "Настройки",
    desc: "Оформление интерфейса",
    icon: Settings,
  },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" />;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="h-9 w-9 rounded-full"
      aria-label="Переключить тему"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeSection = sectionFromPathname(pathname);

  return (
    <div className={cn("grid h-dvh grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-background md:grid-cols-[16rem_minmax(0,1fr)]", activeSection === "encounter" && "fixed inset-0")}>
        <aside className="hidden h-full min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r bg-sidebar row-start-1 col-start-1 md:flex">
          <Link href="/" className="flex h-16 items-center gap-2.5 border-b px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-sm">
              <PawPrint className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-bold text-[15px] tracking-tight">VetDietDerm</span>
              <span className="text-[10px] font-medium text-muted-foreground">
                Клиническое рабочее место
              </span>
            </div>
          </Link>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3 scrollbar-thin" aria-label="Основная навигация">
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
                    <span className="text-[13px] font-semibold leading-tight">{item.label}</span>
                    <span
                      className={cn(
                        "mt-0.5 text-[11px] leading-tight",
                        active ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {item.desc}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center justify-end border-t p-3">
            <ThemeToggle />
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
            <ThemeToggle />
          </header>

          <nav className="scrollbar-none flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-2 md:hidden" aria-label="Основная навигация">
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
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto has-[[data-catalog-workbench][data-state=active]]:overflow-hidden">
            {children}
          </main>
        </div>

        <footer className="col-span-full row-start-2 flex shrink-0 items-center justify-between border-t bg-sidebar/50 px-6 py-3 text-[11px] text-muted-foreground backdrop-blur">
          <div className="flex items-center gap-1.5">
            <PawPrint className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-foreground/80">VetDietDerm</span>
            <span className="hidden sm:inline">· Рабочее место ветеринарного специалиста</span>
          </div>
          <span>Расчёты носят информационный характер</span>
        </footer>
    </div>
  );
}
