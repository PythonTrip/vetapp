"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, FileText, FolderOpen, Plus } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

import type { PatientRecord } from "@/features/patients/api";
import { useDietPlansQuery } from "@/features/nutrition/hooks";

import { apiErrorMessage } from "@/shared/api/error-message";

export function PatientNutrition({ patient }: { patient: PatientRecord }) {
  const plansQuery = useDietPlansQuery(patient.uuid);

  return (
    <section aria-labelledby="patient-nutrition-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h2 id="patient-nutrition-title" className="text-base font-semibold">Планы питания</h2>
          <p className="mt-1 text-sm text-muted-foreground">Сохранённые рационы пациента без автоматического пересчёта.</p>
        </div>
        <Button asChild size="sm">
          <Link href={`/nutrition?patientId=${patient.uuid}`}>
            <Plus className="h-4 w-4" />
            Новый план
          </Link>
        </Button>
      </div>

      {plansQuery.isPending ? (
        <div className="space-y-2 py-5" aria-busy="true"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : plansQuery.isError ? (
        <p className="py-5 text-sm text-destructive" role="alert">{apiErrorMessage(plansQuery.error)}</p>
      ) : plansQuery.data?.length ? (
        <ul className="divide-y">
          {plansQuery.data.map((plan) => (
            <li key={plan.uuid}>
              <Link href={`/nutrition?planId=${plan.uuid}&patientId=${patient.uuid}`} className="group flex items-center justify-between gap-4 py-4 text-sm hover:text-primary">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground group-hover:text-primary">{plan.name}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" /> FEDIAF {plan.edition_code}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-10 text-center">
          <FolderOpen className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Для пациента ещё нет сохранённых планов.</p>
        </div>
      )}
    </section>
  );
}
