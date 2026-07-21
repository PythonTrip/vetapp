"use client";

import * as React from "react";
import {
  Bell, Calendar, Clock, ChevronRight, X, AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAppointments } from "@/lib/hooks";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { AppointmentWithPet } from "@/lib/types";

const TYPE_META: Record<string, { label: string; color: string; dot: string }> = {
  consultation: { label: "Consultation", color: "text-teal-700 dark:text-teal-400", dot: "bg-teal-500" },
  recheck: { label: "Recheck", color: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  procedure: { label: "Procedure", color: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  telemedicine: { label: "Telemedicine", color: "text-violet-700 dark:text-violet-400", dot: "bg-violet-500" },
};

function getRelativeLabel(apptDate: string): { label: string; urgency: "now" | "today" | "tomorrow" | "soon" | "later"; daysAway: number } {
  const now = new Date();
  const date = new Date(apptDate);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const apptDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((apptDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

  const hoursAway = (date.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffDays < 0) return { label: "Overdue", urgency: "now", daysAway: diffDays };
  if (diffDays === 0) {
    if (hoursAway < 0) return { label: "Overdue", urgency: "now", daysAway: 0 };
    if (hoursAway < 2) return { label: "In <2 hours", urgency: "now", daysAway: 0 };
    return { label: "Today", urgency: "today", daysAway: 0 };
  }
  if (diffDays === 1) return { label: "Tomorrow", urgency: "tomorrow", daysAway: 1 };
  if (diffDays <= 7) return { label: `In ${diffDays} days`, urgency: "soon", daysAway: diffDays };
  return { label: `In ${diffDays} days`, urgency: "later", daysAway: diffDays };
}

const URGENCY_STYLES: Record<string, string> = {
  now: "bg-rose-500 text-white border-rose-600",
  today: "bg-amber-500 text-white border-amber-600",
  tomorrow: "bg-teal-500 text-white border-teal-600",
  soon: "bg-muted-foreground/80 text-white border-muted-foreground",
  later: "bg-muted text-muted-foreground border-border",
};

export function AppointmentReminders() {
  const { data: appointments, isLoading } = useAppointments();
  const { setActiveModule, setActivePetId } = useAppStore();
  const [open, setOpen] = React.useState(false);
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  // Filter scheduled (not completed/cancelled) and within next 7 days OR overdue
  const upcoming = React.useMemo(() => {
    if (!appointments) return [];
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return appointments
      .filter((a) => a.status === "scheduled")
      .filter((a) => {
        const t = new Date(a.date).getTime();
        return t >= now - 24 * 60 * 60 * 1000 && t <= now + sevenDaysMs; // includes yesterday (overdue) up to 7 days ahead
      })
      .filter((a) => !dismissed.has(a.id))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [appointments, dismissed]);

  const urgentCount = upcoming.filter((a) => {
    const u = getRelativeLabel(a.date).urgency;
    return u === "now" || u === "today";
  }).length;

  function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
  }

  function handleClick(appt: AppointmentWithPet) {
    setActiveModule("crm");
    setActivePetId(appt.petId);
    setOpen(false);
  }

  if (isLoading || upcoming.length === 0) {
    // Still render the bell so users can open it to see "all clear"
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-sidebar-accent transition-colors"
            aria-label="Appointment reminders"
          >
            <Bell className="h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="p-3 border-b flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Reminders</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">All clear</Badge>
          </div>
          <div className="p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mx-auto mb-2">
              <Calendar className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">No upcoming appointments</p>
            <p className="text-xs text-muted-foreground mt-1">Next 7 days are clear.</p>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-sidebar-accent transition-colors"
          aria-label="Appointment reminders"
        >
          <Bell className="h-4 w-4 text-muted-foreground" />
          {urgentCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white pulse-ring">
              {urgentCount}
            </span>
          )}
          {urgentCount === 0 && upcoming.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
              {upcoming.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b flex items-center gap-2 bg-gradient-to-r from-primary/5 to-transparent">
          <Bell className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Upcoming Appointments</span>
          <Badge variant="secondary" className="ml-auto text-[10px] tabular-nums">{upcoming.length}</Badge>
        </div>
        <ScrollArea className="max-h-80 scrollbar-thin">
          <div className="p-2 space-y-1">
            {upcoming.map((appt) => {
              const rel = getRelativeLabel(appt.date);
              const meta = TYPE_META[appt.type] ?? TYPE_META.consultation;
              const apptTime = new Date(appt.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
              return (
                <div
                  key={appt.id}
                  className={cn(
                    "group rounded-lg border p-2.5 transition-all hover:shadow-sm cursor-pointer",
                    rel.urgency === "now" && "border-rose-300 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20",
                    rel.urgency === "today" && "border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20",
                    (rel.urgency === "tomorrow" || rel.urgency === "soon") && "border-border",
                  )}
                  onClick={() => handleClick(appt)}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-md shrink-0", meta.dot, "bg-opacity-15")} style={{ backgroundColor: "currentColor" }}>
                      <Calendar className={cn("h-3.5 w-3.5", meta.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs truncate">{appt.pet.name}</span>
                        <span className={cn("text-[9px] font-bold uppercase rounded px-1 py-0 border", URGENCY_STYLES[rel.urgency])}>
                          {rel.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{appt.reason}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span className={cn("font-semibold", meta.color)}>{meta.label}</span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" /> {apptTime}
                        </span>
                        <span>· {appt.duration}min</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); dismiss(appt.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground shrink-0"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <Separator />
        <div className="p-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-500" /> Click to open patient
          </span>
          <button
            onClick={() => setActiveModule("dashboard")}
            className="flex items-center gap-0.5 hover:text-foreground transition-colors font-medium"
          >
            View all <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
