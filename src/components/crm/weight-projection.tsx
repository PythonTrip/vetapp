"use client";

import * as React from "react";
import {
  Target, TrendingDown, Flag, Scale, Info,
} from "lucide-react";
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Area, ComposedChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { PetWithRelations } from "@/lib/types";

interface WeightProjectionProps {
  pet: PetWithRelations;
}

/**
 * Weight Goal Projection
 * - Uses historical weight data points from consultations
 * - Calculates average weekly loss rate
 * - Projects linearly to target weight
 * - Shows confidence band based on consistency
 */
export function WeightProjection({ pet }: WeightProjectionProps) {
  const target = pet.targetWeight;
  const current = pet.currentWeight;

  // Build history from consultations with weight recorded
  const history = pet.consultations
    .filter((c) => c.weight != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((c) => ({
      date: new Date(c.date),
      weight: c.weight!,
    }));

  // Add current state as the latest data point
  const now = new Date();
  history.push({ date: now, weight: current });

  // If no target or already at target, show simple status
  if (!target || Math.abs(current - target) < 0.1) {
    return null;
  }

  const isWeightLoss = current > target;
  const totalToGo = Math.abs(current - target);
  const totalToLose = Math.abs((history[0]?.weight ?? current) - target);
  const progressPct = totalToLose > 0 ? Math.min(100, Math.round(((totalToLose - totalToGo) / totalToLose) * 100)) : 0;

  // Calculate weekly rate from history (if we have >= 2 points spanning > 7 days)
  let weeklyRate = 0;
  let rateConfidence: "high" | "medium" | "low" = "low";
  if (history.length >= 2) {
    const first = history[0];
    const last = history[history.length - 1];
    const weeksElapsed = (last.date.getTime() - first.date.getTime()) / (1000 * 60 * 60 * 24 * 7);
    if (weeksElapsed >= 1) {
      weeklyRate = (first.weight - last.weight) / weeksElapsed; // positive = losing
      rateConfidence = weeksElapsed >= 4 ? "high" : weeksElapsed >= 2 ? "medium" : "low";
    }
  }

  // Default recommended rate: 1-2% of body weight per week
  const recommendedRateMin = current * 0.01;
  const recommendedRateMax = current * 0.02;
  const usingDefault = weeklyRate === 0;
  const effectiveRate = usingDefault ? (isWeightLoss ? recommendedRateMin : -recommendedRateMin) : weeklyRate;

  // Project weeks to target
  const weeksToTarget = effectiveRate !== 0 ? Math.ceil(totalToGo / Math.abs(effectiveRate)) : null;
  const targetDate = weeksToTarget != null
    ? new Date(now.getTime() + weeksToTarget * 7 * 24 * 60 * 60 * 1000)
    : null;

  // Build chart data: history + projection
  const chartData: { date: string; weight: number | null; projected: number | null }[] = [];

  // Historical points
  history.forEach((h) => {
    chartData.push({
      date: h.date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weight: h.weight,
      projected: null,
    });
  });

  // Projection points (every 2 weeks until target)
  if (effectiveRate !== 0 && weeksToTarget != null) {
    const projWeeks = Math.min(weeksToTarget, 24); // cap at 24 weeks for chart readability
    for (let w = 2; w <= projWeeks; w += 2) {
      const projDate = new Date(now.getTime() + w * 7 * 24 * 60 * 60 * 1000);
      const projWeight = current - effectiveRate * w;
      chartData.push({
        date: projDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        weight: null,
        projected: Math.round(projWeight * 10) / 10,
      });
    }
    // Final target point
    if (targetDate) {
      chartData.push({
        date: targetDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        weight: null,
        projected: target,
      });
    }
  }

  const onTrack = !usingDefault && effectiveRate >= recommendedRateMin;
  const tooFast = !usingDefault && effectiveRate > recommendedRateMax * 1.5;
  const tooSlow = !usingDefault && effectiveRate < recommendedRateMin * 0.5;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Weight Goal Projection
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {isWeightLoss ? "Loss" : "Gain"} trajectory to target {target} kg
            </CardDescription>
          </div>
          {targetDate && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Flag className="h-2.5 w-2.5 text-primary" />
              {weeksToTarget} wk to target
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Progress to goal</span>
            <span className="font-semibold tabular-nums">{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-2" />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
            <span>Start: {history[0]?.weight ?? current} kg</span>
            <span className="font-semibold text-foreground">{current} kg (now)</span>
            <span>Target: {target} kg</span>
          </div>
        </div>

        {/* Chart */}
        {chartData.length >= 2 && (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -25 }}>
                <defs>
                  <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.55 0.12 175)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="oklch(0.55 0.12 175)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="oklch(0.6 0.02 175)" />
                <YAxis
                  domain={[Math.min(target, current) - 1, Math.max(target, history[0]?.weight ?? current) + 1]}
                  tick={{ fontSize: 10 }}
                  stroke="oklch(0.6 0.02 175)"
                  tickFormatter={(v) => `${v}kg`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }}
                  formatter={(v: number, name: string) => [`${v} kg`, name === "weight" ? "Actual" : "Projected"]}
                />
                <ReferenceLine
                  y={target}
                  stroke="oklch(0.65 0.15 145)"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${target}kg`, fontSize: 9, fill: "oklch(0.5 0.15 145)", position: "right" }}
                />
                <Area
                  type="monotone"
                  dataKey="projected"
                  stroke="oklch(0.55 0.12 175)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="url(#projGrad)"
                  dot={{ fill: "oklch(0.55 0.12 175)", r: 3 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="oklch(0.55 0.12 175)"
                  strokeWidth={2.5}
                  dot={{ fill: "oklch(0.55 0.12 175)", r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-muted-foreground">Weekly Rate</div>
            <div className={`text-sm font-bold tabular-nums mt-0.5 ${isWeightLoss ? "text-emerald-600" : "text-amber-600"}`}>
              {usingDefault ? "—" : `${effectiveRate.toFixed(2)} kg`}
            </div>
            <div className="text-[9px] text-muted-foreground">{usingDefault ? "no data yet" : isWeightLoss ? "loss/wk" : "gain/wk"}</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-muted-foreground">Recommended</div>
            <div className="text-sm font-bold tabular-nums mt-0.5">
              {recommendedRateMin.toFixed(2)}–{recommendedRateMax.toFixed(2)}
            </div>
            <div className="text-[9px] text-muted-foreground">kg/wk (1-2% BW)</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-muted-foreground">ETA</div>
            <div className="text-sm font-bold tabular-nums mt-0.5">
              {targetDate ? targetDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
            </div>
            <div className="text-[9px] text-muted-foreground">{weeksToTarget ? `${weeksToTarget} weeks` : "—"}</div>
          </div>
        </div>

        {/* Status banner */}
        {targetDate && (
          <div className={`rounded-lg p-2.5 text-xs flex items-start gap-2 ${
            tooFast ? "bg-red-500/10 text-red-700 dark:text-red-400"
            : onTrack ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : tooSlow ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "bg-primary/5 text-primary"
          }`}>
            {tooFast ? <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            : onTrack ? <TrendingDown className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            : tooSlow ? <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            : <Scale className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
            <div>
              {tooFast && pet.species === "cat" && (
                <span className="font-semibold">⚠️ Too fast for a cat!</span>
              )}
              {tooFast && pet.species !== "cat" && (
                <span className="font-semibold">⚠️ Losing faster than recommended.</span>
              )}
              {onTrack && (
                <span className="font-semibold">On track — great progress!</span>
              )}
              {tooSlow && (
                <span className="font-semibold">Progress slower than ideal.</span>
              )}
              {!tooFast && !onTrack && !tooSlow && (
                <span className="font-semibold">Projection based on current rate.</span>
              )}
              {" "} At this rate, {pet.name} will reach {target} kg around{" "}
              {targetDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
              {tooFast && pet.species === "cat" && " Cats risk hepatic lipidosis — slow down to ≤2% BW/week."}
              {tooSlow && " Consider tightening caloric intake or increasing activity."}
              {rateConfidence === "low" && " (Low confidence — needs ≥4 weeks of data.)"}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
