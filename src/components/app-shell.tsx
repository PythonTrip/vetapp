"use client";

import * as React from "react";
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
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAppStore, type ModuleId } from "@/lib/store";
import { usePets } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardModule } from "@/components/modules/dashboard";
import { CrmModule } from "@/components/modules/crm";
import { NutritionModule } from "@/components/modules/nutrition";
import { KnowledgeModule } from "@/components/modules/knowledge";
import { CommandPalette } from "@/components/command-palette";
import { AppointmentReminders } from "@/components/appointment-reminders";

const NAV_ITEMS: { id: ModuleId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "Overview & activity" },
  { id: "crm", label: "Patients CRM", icon: Users, desc: "Pet records & voice scribe" },
  { id: "nutrition", label: "Nutritionist Assistant", icon: Calculator, desc: "Calculators & diet builder" },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen, desc: "Protocols & allergens" },
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
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function AppShell() {
  const { activeModule, setActiveModule } = useAppStore();
  const { data: pets } = usePets();
  const [cmdOpen, setCmdOpen] = React.useState(false);

  // Cmd+K / Ctrl+K keyboard shortcut
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="grid h-dvh grid-rows-[1fr_auto] overflow-hidden bg-background md:grid-cols-[16rem_1fr]">
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />

      {/* Sidebar — first row only, so it never overlaps the full-width footer */}
      <aside className="hidden md:flex h-full min-h-0 w-64 shrink-0 flex-col overflow-y-auto border-r bg-sidebar row-start-1 col-start-1">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-sm">
            <PawPrint className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-bold text-[15px] tracking-tight">VetDietDerm</span>
            <span className="text-[10px] text-muted-foreground font-medium">Nutrition · Dermatology CRM</span>
          </div>
        </div>

        {/* Search trigger */}
        <div className="p-3">
          <button
            onClick={() => setCmdOpen(true)}
            className="w-full flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-xs text-muted-foreground hover:bg-background transition-colors group"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search patients...</span>
            <kbd className="ml-auto flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[9px] font-mono font-semibold">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto scrollbar-thin">
          {NAV_ITEMS.map((item) => {
            const active = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveModule(item.id)}
                className={cn(
                  "w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all group relative",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-sidebar-accent text-sidebar-foreground"
                )}
              >
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary-foreground/80" />}
                <item.icon className={cn("h-4.5 w-4.5 mt-0.5 shrink-0", active ? "" : "text-muted-foreground group-hover:text-foreground")} style={{ width: 18, height: 18 }} />
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-semibold leading-tight">{item.label}</span>
                  <span className={cn("text-[11px] leading-tight mt-0.5", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {item.desc}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Stats footer in sidebar */}
        <div className="p-3 border-t space-y-3">
          <div className="rounded-xl bg-gradient-to-br from-sidebar-accent/80 to-sidebar-accent/40 p-3 border border-border/50">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              <HeartPulse className="h-3.5 w-3.5 text-primary" />
              Active Patients
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular-nums">{pets?.length ?? 0}</span>
              <span className="text-xs text-muted-foreground">in care</span>
            </div>
            <div className="flex gap-1 mt-2">
              <Badge variant="secondary" className="text-[10px] gap-1">
                <PawPrint className="h-2.5 w-2.5" />
                {pets?.filter((p) => p.species === "dog").length ?? 0} dogs
              </Badge>
              <Badge variant="secondary" className="text-[10px] gap-1">
                {pets?.filter((p) => p.species === "cat").length ?? 0} cats
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Stethoscope className="h-3.5 w-3.5" />
              <span>Dr. Vet · Clinic</span>
            </div>
            <div className="flex items-center gap-1">
              <AppointmentReminders />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden row-start-1 md:col-start-2">
        <header className="md:hidden flex items-center justify-between px-4 h-14 shrink-0 border-b bg-sidebar z-30">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground">
              <PawPrint className="h-4 w-4" />
            </div>
            <span className="font-bold text-sm">VetDietDerm</span>
          </div>
          <div className="flex items-center gap-1">
            <AppointmentReminders />
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setCmdOpen(true)} aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {/* Mobile nav */}
        <div className="md:hidden flex shrink-0 gap-1 px-2 py-2 border-b overflow-x-auto scrollbar-thin">
          {NAV_ITEMS.map((item) => {
            const active = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveModule(item.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground"
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Main content */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {activeModule === "dashboard" && <DashboardModule />}
          {activeModule === "crm" && <CrmModule />}
          {activeModule === "nutrition" && <NutritionModule />}
          {activeModule === "knowledge" && <KnowledgeModule />}
        </main>
      </div>

      {/* Full-width footer pinned below sidebar + content */}
      <footer className="col-span-full row-start-2 shrink-0 border-t bg-sidebar/50 backdrop-blur px-6 py-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <PawPrint className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium text-foreground/80">VetDietDerm</span>
          <span className="hidden sm:inline">· Lightweight clinical workspace for veterinary nutrition & dermatology</span>
          <span className="sm:hidden">· Vet CRM</span>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Command className="h-3 w-3" />
            <kbd className="font-mono font-semibold">K</kbd>
            <span>to search</span>
          </button>
          <span className="text-foreground/40">·</span>
          <span>AI-powered · Hands-free consultations</span>
          <span className="text-foreground/40">·</span>
          <span className="version-badge">v1.4</span>
        </div>
      </footer>
    </div>
  );
}
