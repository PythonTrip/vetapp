"use client";

import * as React from "react";
import {
  PawPrint, TrendingDown, TrendingUp, Activity, Scale, Heart,
  Award, AlertTriangle, Target,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { usePets } from "@/lib/hooks";
import { bcsDescription } from "@/lib/nutrition";
import { speciesAvatarClass } from "@/lib/clinical-data";

const CHART_COLORS = {
  teal: "oklch(0.55 0.12 175)",
  emerald: "oklch(0.65 0.15 145)",
  amber: "oklch(0.7 0.14 85)",
  orange: "oklch(0.62 0.18 40)",
  violet: "oklch(0.7 0.12 305)",
  red: "oklch(0.6 0.2 16)",
  cyan: "oklch(0.6 0.1 200)",
};

export function AnalyticsPanel() {
  const { data: pets } = usePets();

  if (!pets || pets.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-muted-foreground">
        No patients yet. Add patients to see analytics.
      </div>
    );
  }

  // Species distribution
  const speciesData = [
    { name: "Dogs", value: pets.filter((p) => p.species === "dog").length, fill: CHART_COLORS.amber },
    { name: "Cats", value: pets.filter((p) => p.species === "cat").length, fill: CHART_COLORS.violet },
  ].filter((d) => d.value > 0);

  // BCS distribution
  const bcsBuckets = [
    { range: "Under (1-3)", count: 0, fill: CHART_COLORS.amber },
    { range: "Ideal (4-5)", count: 0, fill: CHART_COLORS.emerald },
    { range: "Over (6)", count: 0, fill: CHART_COLORS.orange },
    { range: "Obese (7-9)", count: 0, fill: CHART_COLORS.red },
  ];
  pets.forEach((p) => {
    if (p.bcs <= 3) bcsBuckets[0].count++;
    else if (p.bcs <= 5) bcsBuckets[1].count++;
    else if (p.bcs <= 6) bcsBuckets[2].count++;
    else bcsBuckets[3].count++;
  });

  // Life stage distribution
  const lifeStageData = [
    { stage: "Puppy/Kitten", count: pets.filter((p) => p.lifeStage === "puppy_kitten").length },
    { stage: "Adult", count: pets.filter((p) => p.lifeStage === "adult").length },
    { stage: "Senior", count: pets.filter((p) => p.lifeStage === "senior").length },
    { stage: "Gestation", count: pets.filter((p) => p.lifeStage === "gestation").length },
    { stage: "Lactation", count: pets.filter((p) => p.lifeStage === "lactation").length },
  ].filter((d) => d.count > 0);

  // VAS improvement over time (aggregate all pets' consultations)
  const allConsults = pets
    .flatMap((p) => p.consultations.filter((c) => c.vasScore != null).map((c) => ({ date: c.date, vas: c.vasScore! })))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Group by month
  const monthlyVas = allConsults.reduce((acc, c) => {
    const key = new Date(c.date).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    if (!acc[key]) acc[key] = [];
    acc[key].push(c.vas);
    return acc;
  }, {} as Record<string, number[]>);

  const vasTrendData = Object.entries(monthlyVas).map(([month, scores]) => ({
    month,
    avg: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    count: scores.length,
  }));

  // Weight management stats
  const overweight = pets.filter((p) => p.bcs >= 6);
  const withTarget = overweight.filter((p) => p.targetWeight);
  const avgWeightDiff = withTarget.length > 0
    ? Math.round((withTarget.reduce((s, p) => s + (p.currentWeight - (p.targetWeight ?? p.currentWeight)), 0) / withTarget.length) * 10) / 10
    : 0;

  // Consultation type breakdown
  const consultTypes = pets.flatMap((p) => p.consultations).reduce((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const consultTypeData = Object.entries(consultTypes).map(([type, count]) => ({
    type: type.charAt(0).toUpperCase() + type.slice(1),
    count,
    fill: type === "appointment" ? CHART_COLORS.teal : type === "diagnostic" ? CHART_COLORS.amber : type === "treatment" ? CHART_COLORS.emerald : CHART_COLORS.violet,
  }));

  // Overall practice health score (composite: based on avg BCS, avg VAS, weight compliance)
  const avgBcs = pets.reduce((s, p) => s + p.bcs, 0) / pets.length;
  const avgVas = allConsults.length > 0
    ? allConsults.reduce((s, c) => s + c.vas, 0) / allConsults.length
    : 0;
  const idealBcsPct = (pets.filter((p) => p.bcs >= 4 && p.bcs <= 5).length / pets.length) * 100;
  const practiceScore = Math.round(
    (100 - Math.abs(avgBcs - 5) * 10 - avgVas * 4) * 0.5 + idealBcsPct * 0.5
  );

  return (
    <div className="space-y-4">
      {/* Practice Health Score */}
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-emerald-500/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16">
                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="oklch(0.92 0.01 172)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.5" fill="none"
                    stroke="oklch(0.55 0.12 175)" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${practiceScore}, 100`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold tabular-nums">{practiceScore}</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  <Award className="h-3.5 w-3.5" /> Practice Health Score
                </div>
                <div className="text-sm font-semibold mt-0.5">
                  {practiceScore >= 75 ? "Excellent patient outcomes" : practiceScore >= 50 ? "Good — room to improve" : "Needs attention"}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Composite of BCS distribution, pruritus control & weight compliance
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <MiniMetric label="Avg BCS" value={avgBcs.toFixed(1)} sub="/ 9" />
              <MiniMetric label="Avg VAS" value={avgVas.toFixed(1)} sub="/ 10" />
              <MiniMetric label="Ideal BCS %" value={`${idealBcsPct.toFixed(0)}%`} sub="4-5/9" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Species distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PawPrint className="h-4 w-4 text-primary" /> Species Distribution
            </CardTitle>
            <CardDescription className="text-xs">Caseload mix</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={speciesData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={(e) => `${e.name}: ${e.value}`} labelLine={false}>
                    {speciesData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* BCS Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" /> Body Condition Score Distribution
            </CardTitle>
            <CardDescription className="text-xs">{overweight.length} of {pets.length} patients overweight or obese</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bcsBuckets} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                  <XAxis dataKey="range" tick={{ fontSize: 9 }} stroke="oklch(0.6 0.02 175)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {bcsBuckets.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* VAS trend over time */}
        {vasTrendData.length >= 2 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Pruritus (VAS) Trend
              </CardTitle>
              <CardDescription className="text-xs">Average VAS across all patients by month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={vasTrendData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                    <defs>
                      <linearGradient id="vasArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.red} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.red} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }} />
                    <Area type="monotone" dataKey="avg" name="Avg VAS" stroke={CHART_COLORS.red} strokeWidth={2.5} fill="url(#vasArea)" dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Consultation types */}
        {consultTypeData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" /> Consultation Types
              </CardTitle>
              <CardDescription className="text-xs">Breakdown of visit categories</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={consultTypeData} layout="vertical" margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" allowDecimals={false} />
                    <YAxis dataKey="type" type="category" tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" width={70} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {consultTypeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Weight management insights */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Weight Management Insights
          </CardTitle>
          <CardDescription className="text-xs">Patients requiring weight intervention</CardDescription>
        </CardHeader>
        <CardContent>
          {overweight.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 py-4">
              <TrendingDown className="h-4 w-4" /> All patients at ideal body weight. Excellent!
            </div>
          ) : (
            <div className="space-y-2">
              {overweight.map((p) => {
                const diff = p.currentWeight - (p.targetWeight ?? p.currentWeight);
                const pct = p.targetWeight ? Math.round((diff / p.currentWeight) * 100) : 0;
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${speciesAvatarClass(p.species)}`}>
                      <PawPrint className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{p.name}</span>
                        <Badge variant="secondary" className={`text-[9px] ${bcsDescription(p.bcs).color}`}>BCS {p.bcs}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {p.currentWeight} kg {p.targetWeight ? `→ target ${p.targetWeight} kg` : "(no target set)"}
                      </div>
                      {pct > 0 && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <Progress value={Math.min(100, pct * 5)} className="h-1.5 flex-1" />
                          <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 tabular-nums">{pct}% over</span>
                        </div>
                      )}
                    </div>
                    {pct > 15 ? (
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    ) : pct > 0 ? (
                      <TrendingUp className="h-4 w-4 text-orange-500 shrink-0" />
                    ) : null}
                  </div>
                );
              })}
              {withTarget.length > 0 && (
                <div className="text-xs text-muted-foreground pt-2 border-t flex items-center gap-2">
                  <Scale className="h-3.5 w-3.5" />
                  Average weight reduction needed: <span className="font-semibold text-foreground">{avgWeightDiff} kg</span> per patient
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Life stage radar */}
      {lifeStageData.length >= 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Life Stage Distribution
            </CardTitle>
            <CardDescription className="text-xs">Patients by physiological stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={lifeStageData}>
                  <PolarGrid stroke="oklch(0.9 0.01 172)" />
                  <PolarAngleAxis dataKey="stage" tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                  <PolarRadiusAxis tick={{ fontSize: 9 }} stroke="oklch(0.6 0.02 175)" allowDecimals={false} />
                  <Radar dataKey="count" stroke={CHART_COLORS.teal} fill={CHART_COLORS.teal} fillOpacity={0.4} strokeWidth={2} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MiniMetric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-background/60 p-2.5 border">
      <div className="text-[9px] uppercase font-semibold text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-0.5 justify-center">
        <span className="text-lg font-bold tabular-nums">{value}</span>
        <span className="text-[9px] text-muted-foreground">{sub}</span>
      </div>
    </div>
  );
}
