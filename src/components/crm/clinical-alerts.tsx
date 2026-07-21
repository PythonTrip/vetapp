"use client";

import * as React from "react";
import {
  AlertTriangle, AlertCircle, TrendingUp, TrendingDown, Scale, Dna,
  CalendarClock, ClipboardList, Info, Check, Stethoscope, ChevronDown,
  ChevronUp, Lightbulb, ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { generateClinicalAlerts, alertStats, type ClinicalAlert, type AlertSeverity } from "@/lib/clinical-alerts";
import type { PetWithRelations } from "@/lib/types";

const SEVERITY_STYLES: Record<AlertSeverity, { bg: string; border: string; iconBg: string; iconColor: string; titleColor: string; label: string }> = {
  critical: {
    bg: "bg-rose-50/60 dark:bg-rose-950/30",
    border: "border-rose-300/60 dark:border-rose-800/60",
    iconBg: "bg-rose-100 dark:bg-rose-950/70",
    iconColor: "text-rose-600 dark:text-rose-400",
    titleColor: "text-rose-900 dark:text-rose-200",
    label: "Critical",
  },
  warning: {
    bg: "bg-amber-50/60 dark:bg-amber-950/30",
    border: "border-amber-300/60 dark:border-amber-800/60",
    iconBg: "bg-amber-100 dark:bg-amber-950/70",
    iconColor: "text-amber-600 dark:text-amber-400",
    titleColor: "text-amber-900 dark:text-amber-200",
    label: "Warning",
  },
  info: {
    bg: "bg-teal-50/60 dark:bg-teal-950/30",
    border: "border-teal-300/60 dark:border-teal-800/60",
    iconBg: "bg-teal-100 dark:bg-teal-950/70",
    iconColor: "text-teal-600 dark:text-teal-400",
    titleColor: "text-teal-900 dark:text-teal-200",
    label: "Info",
  },
  success: {
    bg: "bg-emerald-50/60 dark:bg-emerald-950/30",
    border: "border-emerald-300/60 dark:border-emerald-800/60",
    iconBg: "bg-emerald-100 dark:bg-emerald-950/70",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    titleColor: "text-emerald-900 dark:text-emerald-200",
    label: "On track",
  },
};

const ICONS: Record<string, React.ElementType> = {
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Scale,
  Dna,
  CalendarClock,
  ClipboardList,
  Info,
  Check,
  Stethoscope,
  ShieldAlert,
};

export function ClinicalAlerts({ pet }: { pet: PetWithRelations }) {
  const alerts = React.useMemo(() => generateClinicalAlerts(pet), [pet]);
  const stats = React.useMemo(() => alertStats(alerts), [alerts]);
  const [open, setOpen] = React.useState(true);

  if (alerts.length === 0) {
    return (
      <Card className="border-emerald-200/60 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400">
            <Check className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">All clear</div>
            <div className="text-xs text-muted-foreground">No clinical alerts for {pet.name} at this time.</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn(
        "border overflow-hidden transition-all animate-fade-in-up",
        stats.critical > 0
          ? "border-rose-200 dark:border-rose-900/60 shadow-sm"
          : stats.warning > 0
          ? "border-amber-200 dark:border-amber-900/60"
          : "border-teal-200 dark:border-teal-900/60",
      )}>
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                stats.critical > 0
                  ? "bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400"
                  : stats.warning > 0
                  ? "bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400"
                  : "bg-teal-100 dark:bg-teal-950/70 text-teal-600 dark:text-teal-400",
              )}>
                {stats.critical > 0 ? <ShieldAlert className="h-5 w-5" /> : stats.warning > 0 ? <AlertCircle className="h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}
              </div>
              <div className="text-left min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold">Clinical Decision Support</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    AI insights · {alerts.length} alert{alerts.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex gap-1.5 mt-0.5 flex-wrap">
                  {stats.critical > 0 && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50">
                      {stats.critical} critical
                    </Badge>
                  )}
                  {stats.warning > 0 && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50">
                      {stats.warning} warning{stats.warning === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {stats.info > 0 && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-teal-300 text-teal-700 dark:border-teal-800 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50">
                      {stats.info} info
                    </Badge>
                  )}
                  {stats.success > 0 && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50">
                      {stats.success} on track
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 space-y-2 border-t bg-muted/10">
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
            <div className="text-[10px] text-muted-foreground italic pt-1 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Decision support is informational only and does not replace clinical judgment.
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function AlertCard({ alert }: { alert: ClinicalAlert }) {
  const s = SEVERITY_STYLES[alert.severity];
  const Icon = ICONS[alert.icon ?? "Info"] ?? Info;

  return (
    <div className={cn(
      "rounded-lg border p-3 transition-all animate-fade-in-up hover:shadow-sm",
      s.bg, s.border,
    )}>
      <div className="flex items-start gap-3">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md shrink-0", s.iconBg, s.iconColor)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-sm font-semibold", s.titleColor)}>{alert.title}</span>
            <Badge variant="outline" className={cn("text-[9px] h-4 px-1 capitalize", s.iconColor, "border-current/30")}>
              {s.label}
            </Badge>
            <Badge variant="secondary" className="text-[9px] h-4 px-1 capitalize text-muted-foreground">
              {alert.category}
            </Badge>
          </div>
          <p className="text-xs text-foreground/80 mt-1 leading-relaxed">{alert.message}</p>
          {alert.recommendation && (
            <div className="mt-1.5 text-xs flex items-start gap-1.5 text-foreground/90">
              <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
              <span><span className="font-semibold">Action: </span>{alert.recommendation}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
