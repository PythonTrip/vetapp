"use client";

import * as React from "react";
import {
  PawPrint, TrendingDown, TrendingUp, Minus, Scale, Activity, Award,
  GitCompare, ArrowUpDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { usePets } from "@/lib/hooks";
import { useAppNavigation } from "@/lib/navigation";
import { calculateAge, bcsDescription, vasDescription } from "@/lib/nutrition";
import { speciesLabelEn } from "@/lib/clinical-data";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "oklch(0.55 0.12 175)", // teal
  "oklch(0.65 0.15 145)", // emerald
  "oklch(0.7 0.14 85)",   // amber
  "oklch(0.62 0.18 40)",  // orange
  "oklch(0.7 0.12 305)",  // violet
  "oklch(0.6 0.1 200)",   // cyan
];

export function ComparisonPanel() {
  const { data: pets } = usePets();
  const { openProject } = useAppNavigation();
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  // Default: select all (max 4)
  React.useEffect(() => {
    if (pets && selectedIds.length === 0) {
      setSelectedIds(pets.slice(0, Math.min(4, pets.length)).map((p) => p.id));
    }
  }, [pets, selectedIds.length]);

  if (!pets || pets.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-muted-foreground">
        No patients to compare. Add patients first.
      </div>
    );
  }

  const selectedPets = pets.filter((p) => selectedIds.includes(p.id));

  function togglePet(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev; // max 4
      return [...prev, id];
    });
  }

  // Comparison metrics
  const metrics = selectedPets.map((p) => {
    const age = calculateAge(p.birthDate);
    const lastConsult = p.consultations.at(-1);
    const lastVas = lastConsult?.vasScore;
    const weightHistory = p.consultations.filter((c) => c.weight != null).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const weightDelta = weightHistory.length >= 2
      ? Math.round((weightHistory[weightHistory.length - 1].weight! - weightHistory[0].weight!) * 10) / 10
      : 0;
    const vasHistory = p.consultations.filter((c) => c.vasScore != null).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const vasDelta = vasHistory.length >= 2
      ? (vasHistory[vasHistory.length - 1].vasScore! - vasHistory[0].vasScore!)
      : 0;
    const bcsInfo = bcsDescription(p.bcs);
    const weightStatus = p.bcs >= 7 ? "obese" : p.bcs >= 6 ? "over" : p.bcs <= 3 ? "under" : "ideal";

    return {
      pet: p,
      age,
      lastVas,
      vasDelta,
      weightDelta,
      bcsInfo,
      weightStatus,
      consultCount: p.consultations.length,
      photoCount: p.photos.length,
      dietPlanCount: p.dietPlans.length,
      apptCount: p.appointments?.filter((a) => a.status === "scheduled").length ?? 0,
    };
  });

  // Chart data: weight comparison
  const weightData = metrics.map((m, i) => ({
    name: m.pet.name,
    current: m.pet.currentWeight,
    target: m.pet.targetWeight ?? m.pet.currentWeight,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  // VAS comparison
  const vasData = metrics.map((m) => ({
    name: m.pet.name,
    current: m.lastVas ?? 0,
    fill: m.lastVas != null ? (m.lastVas <= 3 ? "oklch(0.65 0.15 145)" : m.lastVas <= 6 ? "oklch(0.7 0.14 85)" : "oklch(0.6 0.2 16)") : "oklch(0.7 0.02 172)",
  }));

  // BCS comparison (radar)
  const bcsData = [
    { metric: "BCS", ...Object.fromEntries(metrics.map((m) => [m.pet.name, m.pet.bcs])) },
    { metric: "VAS", ...Object.fromEntries(metrics.map((m) => [m.pet.name, m.lastVas ?? 0])) },
    { metric: "Visits", ...Object.fromEntries(metrics.map((m) => [m.pet.name, Math.min(10, m.consultCount)])) },
    { metric: "Photos", ...Object.fromEntries(metrics.map((m) => [m.pet.name, Math.min(10, m.photoCount)])) },
    { metric: "Diets", ...Object.fromEntries(metrics.map((m) => [m.pet.name, Math.min(5, m.dietPlanCount)])) },
  ];

  // VAS trend over time for selected pets
  const allDates = new Set<string>();
  selectedPets.forEach((p) => {
    p.consultations.filter((c) => c.vasScore != null).forEach((c) => {
      allDates.add(new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    });
  });
  const sortedDates = Array.from(allDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const vasTrendData = sortedDates.map((date) => {
    const entry: Record<string, string | number> = { date };
    selectedPets.forEach((p) => {
      const consult = p.consultations.find((c) => c.vasScore != null && new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) === date);
      entry[p.name] = consult?.vasScore ?? "";
    });
    return entry;
  });

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Pet selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-primary" />
                Select Patients to Compare
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">Choose up to 4 patients ({selectedIds.length}/4 selected)</CardDescription>
            </div>
            {selectedIds.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedIds([])}>
                Clear all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {pets.map((p) => {
              const isSelected = selectedIds.includes(p.id);
              const disabled = !isSelected && selectedIds.length >= 4;
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border p-2.5 cursor-pointer transition-all",
                    isSelected ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/50",
                    disabled && "opacity-40 cursor-not-allowed"
                  )}
                  style={isSelected ? { borderColor: CHART_COLORS[selectedIds.indexOf(p.id) % CHART_COLORS.length] } : undefined}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={disabled}
                    onCheckedChange={() => togglePet(p.id)}
                  />
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ background: isSelected ? `${CHART_COLORS[selectedIds.indexOf(p.id) % CHART_COLORS.length]}20` : undefined }}>
                    <PawPrint className="h-4 w-4" style={isSelected ? { color: CHART_COLORS[selectedIds.indexOf(p.id) % CHART_COLORS.length] } : undefined} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{p.breed}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedPets.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <GitCompare className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">Select patients above to compare</p>
            <p className="text-xs text-muted-foreground mt-1">Compare weight, VAS, BCS, and treatment progress side-by-side</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Comparison Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-primary" />
                Side-by-Side Comparison
              </CardTitle>
              <CardDescription className="text-xs">Key metrics at a glance</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 text-[10px] font-semibold uppercase text-muted-foreground">Metric</th>
                    {metrics.map((m, i) => (
                      <th key={m.pet.id} className="text-left py-2 px-2 min-w-[120px]">
                        <button
                          onClick={() => openProject(m.pet.id)}
                          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                        >
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="font-semibold text-sm">{m.pet.name}</span>
                        </button>
                        <div className="text-[10px] text-muted-foreground font-normal">{m.pet.breed}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <CompareRow label="Species" values={metrics.map((m) => ({ text: speciesLabelEn(m.pet.species), badge: "secondary" }))} />
                  <CompareRow label="Age" values={metrics.map((m) => ({ text: m.age.label }))} />
                  <CompareRow label="Weight (kg)" values={metrics.map((m) => ({ text: String(m.pet.currentWeight), sub: m.pet.targetWeight ? `→ ${m.pet.targetWeight}` : "" }))} />
                  <CompareRow label="Weight Δ" values={metrics.map((m) => ({
                    text: m.weightDelta === 0 ? "—" : `${m.weightDelta > 0 ? "+" : ""}${m.weightDelta} kg`,
                    tone: m.weightDelta < 0 && m.pet.targetWeight && m.pet.currentWeight > m.pet.targetWeight ? "good" : m.weightDelta > 0 && m.pet.targetWeight && m.pet.currentWeight < m.pet.targetWeight ? "good" : m.weightDelta !== 0 ? "warn" : "neutral",
                  }))} />
                  <CompareRow label="BCS (1-9)" values={metrics.map((m) => ({ text: `${m.pet.bcs}/9`, sub: m.bcsInfo.label, tone: m.weightStatus === "ideal" ? "good" : m.weightStatus === "obese" ? "bad" : "warn" }))} />
                  <CompareRow label="Latest VAS" values={metrics.map((m) => ({
                    text: m.lastVas != null ? `${m.lastVas}/10` : "—",
                    sub: m.lastVas != null ? vasDescription(m.lastVas).label : "",
                    tone: m.lastVas == null ? "neutral" : m.lastVas <= 3 ? "good" : m.lastVas <= 6 ? "warn" : "bad",
                  }))} />
                  <CompareRow label="VAS Δ" values={metrics.map((m) => ({
                    text: m.vasDelta === 0 ? "—" : `${m.vasDelta > 0 ? "+" : ""}${m.vasDelta}`,
                    tone: m.vasDelta < 0 ? "good" : m.vasDelta > 0 ? "bad" : "neutral",
                    icon: m.vasDelta < 0 ? TrendingDown : m.vasDelta > 0 ? TrendingUp : Minus,
                  }))} />
                  <CompareRow label="Visits" values={metrics.map((m) => ({ text: String(m.consultCount) }))} />
                  <CompareRow label="Photos" values={metrics.map((m) => ({ text: String(m.photoCount) }))} />
                  <CompareRow label="Diet Plans" values={metrics.map((m) => ({ text: String(m.dietPlanCount) }))} />
                  <CompareRow label="Upcoming Appts" values={metrics.map((m) => ({ text: String(m.apptCount) }))} />
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Charts row */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Weight comparison */}
            {weightData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Scale className="h-4 w-4 text-primary" /> Weight vs Target
                  </CardTitle>
                  <CardDescription className="text-xs">Current weight and target side-by-side</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weightData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                        <YAxis tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" unit="kg" />
                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }} formatter={(v: number) => `${v} kg`} />
                        <Bar dataKey="current" name="Current" radius={[3, 3, 0, 0]}>
                          {weightData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Bar>
                        <Bar dataKey="target" name="Target" radius={[3, 3, 0, 0]} fill="oklch(0.75 0.02 172)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground mt-2">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-teal-500" /> Current</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted-foreground/40" /> Target</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* VAS comparison */}
            {vasData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" /> Latest Pruritus (VAS)
                  </CardTitle>
                  <CardDescription className="text-xs">Current itch score (1-10 scale)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={vasData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }} formatter={(v: number) => `${v}/10`} />
                        <Bar dataKey="current" name="VAS" radius={[3, 3, 0, 0]}>
                          {vasData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground mt-2">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> Mild (1-3)</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500" /> Moderate (4-6)</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500" /> Severe (7-10)</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Multi-metric radar */}
            {metrics.length >= 2 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Award className="h-4 w-4 text-primary" /> Multi-Metric Profile
                  </CardTitle>
                  <CardDescription className="text-xs">Normalized comparison across key metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={bcsData}>
                        <PolarGrid stroke="oklch(0.9 0.01 172)" />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                        <PolarRadiusAxis tick={{ fontSize: 9 }} stroke="oklch(0.6 0.02 175)" />
                        {metrics.map((m, i) => (
                          <Radar
                            key={m.pet.id}
                            name={m.pet.name}
                            dataKey={m.pet.name}
                            stroke={CHART_COLORS[i % CHART_COLORS.length]}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                            fillOpacity={0.15}
                            strokeWidth={2}
                          />
                        ))}
                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* VAS trend over time */}
            {vasTrendData.length >= 2 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-primary" /> VAS Trend Over Time
                  </CardTitle>
                  <CardDescription className="text-xs">Pruritus progression across patients</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={vasTrendData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="oklch(0.6 0.02 175)" />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {metrics.map((m, i) => (
                          <Line
                            key={m.pet.id}
                            type="monotone"
                            dataKey={m.pet.name}
                            stroke={CHART_COLORS[i % CHART_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CompareRow({
  label,
  values,
}: {
  label: string;
  values: { text: string; sub?: string; tone?: "good" | "warn" | "bad" | "neutral"; icon?: React.ElementType; badge?: string }[];
}) {
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="py-2 px-2 text-[11px] font-semibold uppercase text-muted-foreground whitespace-nowrap">{label}</td>
      {values.map((v, i) => {
        const Icon = v.icon;
        const toneClass = v.tone === "good" ? "text-emerald-600 dark:text-emerald-400"
          : v.tone === "warn" ? "text-amber-600 dark:text-amber-400"
          : v.tone === "bad" ? "text-red-600 dark:text-red-400"
          : "text-foreground";
        return (
          <td key={i} className="py-2 px-2">
            <div className="flex items-center gap-1">
              {Icon && <Icon className={cn("h-3 w-3", toneClass)} />}
              <span className={cn("font-semibold tabular-nums", toneClass)}>{v.text}</span>
              {v.sub && <span className="text-[10px] text-muted-foreground">{v.sub}</span>}
            </div>
          </td>
        );
      })}
    </tr>
  );
}
