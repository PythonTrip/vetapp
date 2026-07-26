"use client";

import * as React from "react";
import {
  AlertTriangle, TrendingDown, Heart, Activity, Scale,
  PawPrint, ChevronRight, Clock, Sparkles, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePets } from "@/lib/hooks";
import { useAppNavigation } from "@/lib/navigation";
import { speciesAvatarClass } from "@/lib/clinical-data";
import { cn } from "@/lib/utils";
import type { PetWithRelations } from "@/lib/types";

interface AtRiskPatient {
  pet: PetWithRelations;
  reasons: { label: string; severity: "high" | "medium" | "low" }[];
  lastVisitDays: number;
}

export function ClinicalInsights() {
  const { data: pets, isLoading } = usePets();
  const { goToSection, openProject } = useAppNavigation();

  // Identify at-risk patients
  const atRisk: AtRiskPatient[] = React.useMemo(() => {
    if (!pets) return [];
    return pets
      .map((pet) => {
        const reasons: AtRiskPatient["reasons"] = [];
        const lastVisit = pet.consultations.at(-1);
        const lastVas = lastVisit?.vasScore;
        const prevVas = pet.consultations.at(-2)?.vasScore;

        // Severe pruritus
        if (lastVas != null && lastVas >= 7) {
          reasons.push({ label: `Severe pruritus (VAS ${lastVas}/10)`, severity: "high" });
        } else if (lastVas != null && lastVas >= 5) {
          reasons.push({ label: `Moderate pruritus (VAS ${lastVas}/10)`, severity: "medium" });
        }

        // Worsening VAS
        if (lastVas != null && prevVas != null && lastVas - prevVas >= 2) {
          reasons.push({ label: `VAS worsening (+${lastVas - prevVas})`, severity: "high" });
        }

        // Obese
        if (pet.bcs >= 8) {
          reasons.push({ label: `Obese (BCS ${pet.bcs}/9)`, severity: "high" });
        } else if (pet.bcs === 7) {
          reasons.push({ label: `Overweight (BCS ${pet.bcs}/9)`, severity: "medium" });
        }

        // Underweight
        if (pet.bcs <= 3) {
          reasons.push({ label: `Underweight (BCS ${pet.bcs}/9)`, severity: "medium" });
        }

        // Recheck overdue
        if (lastVisit && lastVas != null && lastVas >= 4) {
          const daysSince = Math.floor((Date.now() - new Date(lastVisit.date).getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince > 60) {
            reasons.push({ label: `Recheck overdue (${daysSince}d)`, severity: "medium" });
          }
        }

        // No recent visit (any pet)
        if (lastVisit) {
          const daysSince = Math.floor((Date.now() - new Date(lastVisit.date).getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince > 180) {
            reasons.push({ label: `No visit in ${daysSince}d`, severity: "low" });
          }
        }

        const lastVisitDays = lastVisit
          ? Math.floor((Date.now() - new Date(lastVisit.date).getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        return { pet, reasons, lastVisitDays };
      })
      .filter((x) => x.reasons.length > 0)
      .sort((a, b) => {
        const sevOrder = { high: 0, medium: 1, low: 2 };
        const aTop = Math.min(...a.reasons.map((r) => sevOrder[r.severity]));
        const bTop = Math.min(...b.reasons.map((r) => sevOrder[r.severity]));
        return aTop - bTop;
      });
  }, [pets]);

  // Calculate KPI trends (mocked from consultation history)
  const kpis = React.useMemo(() => {
    if (!pets || pets.length === 0) return null;

    const allConsults = pets.flatMap((p) => p.consultations).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (allConsults.length === 0) return null;

    // Group by month for the last 6 months
    const now = new Date();
    const months: { label: string; vas: number[]; weightChanges: number[] }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString(undefined, { month: "short" });
      months.push({ label, vas: [], weightChanges: [] });
    }

    for (const c of allConsults) {
      const cd = new Date(c.date);
      const monthDiff = (now.getFullYear() - cd.getFullYear()) * 12 + (now.getMonth() - cd.getMonth());
      if (monthDiff >= 0 && monthDiff < 6 && c.vasScore != null) {
        months[5 - monthDiff].vas.push(c.vasScore);
      }
    }

    const avgVasTrend = months.map((m) => ({
      label: m.label,
      value: m.vas.length > 0 ? Number((m.vas.reduce((a, b) => a + b, 0) / m.vas.length).toFixed(1)) : null,
    }));

    // Active cases (VAS >= 4 or BCS >= 7)
    const activeCases = pets.filter((p) => {
      const v = p.consultations.at(-1)?.vasScore;
      return (v != null && v >= 4) || p.bcs >= 7;
    }).length;

    // Improving cases (VAS decreasing)
    const improving = pets.filter((p) => {
      const last = p.consultations.at(-1)?.vasScore;
      const prev = p.consultations.at(-2)?.vasScore;
      return last != null && prev != null && last < prev;
    }).length;

    // Stable cases
    const stable = pets.length - activeCases;

    // Weight management progress
    const onTrack = pets.filter((p) => {
      if (!p.targetWeight || p.currentWeight <= p.targetWeight) return false;
      const lastWeight = p.consultations.filter((c) => c.weight != null).at(-1)?.weight;
      const firstWeight = p.consultations.filter((c) => c.weight != null)[0]?.weight;
      if (!lastWeight || !firstWeight) return false;
      return lastWeight < firstWeight;
    }).length;

    return {
      avgVasTrend,
      activeCases,
      improving,
      stable,
      onTrack,
      totalPets: pets.length,
    };
  }, [pets]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Loading clinical insights...</div>
        </CardContent>
      </Card>
    );
  }

  if (!pets || pets.length === 0 || !kpis) {
    return null;
  }

  function openPet(id: string) {
    openProject(id);
  }

  return (
    <div className="space-y-4">
      {/* KPI trends row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Activity}
          label="Active Cases"
          value={String(kpis.activeCases)}
          sub={`of ${kpis.totalPets} patients`}
          tint="amber"
          progress={kpis.totalPets > 0 ? (kpis.activeCases / kpis.totalPets) * 100 : 0}
        />
        <KpiCard
          icon={TrendingDown}
          label="Improving"
          value={String(kpis.improving)}
          sub="VAS trending down"
          tint="emerald"
          progress={kpis.totalPets > 0 ? (kpis.improving / kpis.totalPets) * 100 : 0}
        />
        <KpiCard
          icon={Heart}
          label="Stable"
          value={String(kpis.stable)}
          sub="No active issues"
          tint="teal"
          progress={kpis.totalPets > 0 ? (kpis.stable / kpis.totalPets) * 100 : 0}
        />
        <KpiCard
          icon={Scale}
          label="Weight On-Track"
          value={String(kpis.onTrack)}
          sub="losing weight as planned"
          tint="violet"
          progress={kpis.totalPets > 0 ? (kpis.onTrack / kpis.totalPets) * 100 : 0}
        />
      </div>

      {/* At-risk patients + VAS trend */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* At-risk patients */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                At-Risk Patients
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {atRisk.length} patient{atRisk.length === 1 ? "" : "s"} need attention
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => goToSection("projects")}>
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {atRisk.length === 0 ? (
              <div className="text-center py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mx-auto mb-2">
                  <Heart className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium">All patients stable</p>
                <p className="text-xs text-muted-foreground mt-1">No patients currently flagged as at-risk.</p>
              </div>
            ) : (
              <ScrollArea className="max-h-72 scrollbar-thin pr-2">
                <div className="space-y-2">
                  {atRisk.map(({ pet, reasons, lastVisitDays }) => {
                    const topSeverity = reasons.reduce((acc, r) => {
                      const order = { high: 0, medium: 1, low: 2 };
                      return order[r.severity] < order[acc] ? r.severity : acc;
                    }, "low" as "high" | "medium" | "low");
                    return (
                      <button
                        key={pet.id}
                        onClick={() => openPet(pet.id)}
                        className={cn(
                          "w-full text-left rounded-xl border p-3 transition-all hover:shadow-sm",
                          topSeverity === "high" && "border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20",
                          topSeverity === "medium" && "border-amber-300 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20",
                          topSeverity === "low" && "border-border",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
                            speciesAvatarClass(pet.species),
                          )}>
                            <PawPrint className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{pet.name}</span>
                              <span className="text-[10px] text-muted-foreground">{pet.breed}</span>
                              <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {reasons.map((r, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className={cn(
                                    "text-[9px]",
                                    r.severity === "high" && "border-rose-400 text-rose-700 dark:border-rose-800 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50",
                                    r.severity === "medium" && "border-amber-400 text-amber-700 dark:border-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50",
                                    r.severity === "low" && "border-muted-foreground/30 text-muted-foreground",
                                  )}
                                >
                                  {r.severity === "high" && <AlertTriangle className="h-2 w-2 mr-0.5" />}
                                  {r.label}
                                </Badge>
                              ))}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {lastVisitDays === 999 ? "No visits" : `${lastVisitDays}d since last`}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* VAS trend mini-chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              VAS Trend (6mo)
            </CardTitle>
            <CardDescription className="text-xs">Average pruritus by month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {kpis.avgVasTrend.map((m, i) => {
                const max = 10;
                const pct = m.value != null ? (m.value / max) * 100 : 0;
                const color = m.value == null ? "bg-muted" : m.value <= 3 ? "bg-emerald-500" : m.value <= 6 ? "bg-amber-500" : "bg-rose-500";
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-8 shrink-0">{m.label}</span>
                    <div className="flex-1 h-4 rounded-full bg-muted/40 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", color)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold tabular-nums w-8 text-right">
                      {m.value != null ? m.value.toFixed(1) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t text-[10px] text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-3 w-3 text-emerald-500" />
              <span>Lower is better — target ≤ 3 for well-controlled cases</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, sub, tint, progress,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  tint: "amber" | "emerald" | "teal" | "violet";
  progress: number;
}) {
  const tints: Record<string, { bg: string; text: string; bar: string }> = {
    amber: { bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
    emerald: { bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
    teal: { bg: "bg-teal-100 dark:bg-teal-950/40", text: "text-teal-600 dark:text-teal-400", bar: "bg-teal-500" },
    violet: { bg: "bg-violet-100 dark:bg-violet-950/40", text: "text-violet-600 dark:text-violet-400", bar: "bg-violet-500" },
  };
  const t = tints[tint];
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-start gap-2.5">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", t.bg, t.text)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tabular-nums">{value}</span>
              <span className="text-[10px] text-muted-foreground">{sub}</span>
            </div>
            <Progress value={progress} className={cn("h-1 mt-1.5", t.bar)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
