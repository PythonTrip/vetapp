"use client";

import * as React from "react";
import { Activity, HeartPulse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HealthMetricSpark } from "@/components/crm/sparkline";
import type { PetWithRelations } from "@/lib/types";
import { bcsDescription, vasDescription } from "@/lib/nutrition";

export function HealthSummary({ pet }: { pet: PetWithRelations }) {
  // Build trend arrays from consultation history
  const weightHistory = pet.consultations
    .filter((c) => c.weight != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((c) => c.weight!);
  // Add current weight as latest point
  if (weightHistory.length === 0 || weightHistory[weightHistory.length - 1] !== pet.currentWeight) {
    weightHistory.push(pet.currentWeight);
  }

  const vasHistory = pet.consultations
    .filter((c) => c.vasScore != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((c) => c.vasScore!);

  const bcsHistory = pet.consultations
    .filter((c) => c.weight != null)
    .map(() => pet.bcs); // BCS doesn't change per-visit in our model, use current

  // Calculate trends
  const weightTrend = weightHistory.length >= 2
    ? weightHistory[weightHistory.length - 1] - weightHistory[0]
    : 0;
  const weightTrendDir: "up" | "down" | "stable" =
    Math.abs(weightTrend) < 0.05 ? "stable" : weightTrend > 0 ? "up" : "down";

  // For weight, "down" is good if overweight, "up" is good if underweight
  const isWeightLossGoal = pet.targetWeight != null && pet.currentWeight > pet.targetWeight;
  const weightTrendLabel = weightTrend !== 0
    ? `${Math.abs(Math.round(weightTrend * 10) / 10)}kg`
    : "stable";

  const vasTrend = vasHistory.length >= 2
    ? vasHistory[vasHistory.length - 1] - vasHistory[0]
    : 0;
  const vasTrendDir: "up" | "down" | "stable" =
    Math.abs(vasTrend) < 0.5 ? "stable" : vasTrend > 0 ? "up" : "down";

  const bcsInfo = bcsDescription(pet.bcs);
  const lastVas = vasHistory[vasHistory.length - 1];
  const vasInfo = lastVas != null ? vasDescription(lastVas) : null;

  const lastConsult = pet.consultations.at(-1);
  const daysSinceVisit = lastConsult
    ? Math.floor((Date.now() - new Date(lastConsult.date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-primary" />
              Health Summary
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Key vitals trends · {pet.consultations.length} data points
            </CardDescription>
          </div>
          {daysSinceVisit != null && (
            <Badge variant="outline" className="text-[10px]">
              {daysSinceVisit === 0 ? "Today" : daysSinceVisit === 1 ? "1 day ago" : `${daysSinceVisit} days ago`}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <HealthMetricSpark
            label="Weight"
            value={pet.currentWeight}
            unit="kg"
            data={weightHistory}
            color="oklch(0.55 0.12 175)"
            trend={isWeightLossGoal ? (weightTrendDir === "down" ? "down" : weightTrendDir === "up" ? "up" : "stable") : weightTrendDir}
            trendLabel={weightTrendLabel}
          />
          <HealthMetricSpark
            label="BCS"
            value={`${pet.bcs}/9`}
            data={bcsHistory.length >= 2 ? bcsHistory : [pet.bcs]}
            color="oklch(0.7 0.14 85)"
            trend="stable"
            trendLabel={bcsInfo.label}
          />
          <HealthMetricSpark
            label="Pruritus VAS"
            value={lastVas != null ? `${lastVas}/10` : "—"}
            data={vasHistory}
            color="oklch(0.6 0.2 16)"
            trend={vasTrendDir}
            trendLabel={vasTrend !== 0 ? `${Math.abs(vasTrend)} pts` : "stable"}
          />
          <HealthMetricSpark
            label="Visits"
            value={pet.consultations.length}
            data={[]}
            color="oklch(0.7 0.12 305)"
            trend="stable"
            trendLabel="logged"
          />
        </div>

        {/* Status banner */}
        {vasInfo && (
          <div className={`mt-3 rounded-lg p-2.5 text-xs flex items-center gap-2 ${
            lastVas! <= 3 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : lastVas! <= 6 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "bg-red-500/10 text-red-700 dark:text-red-400"
          }`}>
            <Activity className="h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-semibold">{vasInfo.label}</span>
              {vasTrend < 0 && " — improving"}
              {vasTrend > 0 && " — worsening"}
              {vasTrend === 0 && vasHistory.length >= 2 && " — stable"}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
