"use client";

import Link from "next/link";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { EncounterRecord, PatientRecord } from "@/lib/api-client";
import {
  ENCOUNTER_STATUS_LABELS,
  ENCOUNTER_TYPE_LABELS,
  SPECIALTY_LABELS,
  formatDateTime,
} from "@/lib/clinical-labels";
import { useDeleteEncounter, useEncountersQuery } from "@/lib/hooks";
import { apiErrorMessage } from "@/lib/patient-form";

export function EncounterPanel({ patient }: { patient: PatientRecord }) {
  const query = useEncountersQuery(patient.uuid);
  const deleteEncounter = useDeleteEncounter(patient.uuid);

  async function onDelete(encounter: EncounterRecord) {
    if (!window.confirm("Удалить приём? Фото останутся у пациента.")) return;
    try {
      await deleteEncounter.mutateAsync(encounter.uuid);
      toast.success("Приём удалён");
    } catch (cause) {
      toast.error(apiErrorMessage(cause));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Приёмы</CardTitle>
          <CardDescription>Анамнез, осмотр и план в отдельном рабочем месте.</CardDescription>
        </div>
        <Button asChild size="sm">
          <Link href={`/encounter?patientId=${patient.uuid}`}>
            <Plus className="h-4 w-4" />
            Новый приём
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {query.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {query.isError ? <p className="text-sm text-destructive" role="alert">{apiErrorMessage(query.error)}</p> : null}
        {query.data?.length ? query.data.map((encounter) => (
          <div key={encounter.uuid} className="flex items-start justify-between gap-3 rounded-xl border p-3">
            <Link href={`/encounter?patientId=${patient.uuid}&encounterId=${encounter.uuid}`} className="group min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{formatDateTime(encounter.occurred_at)}</strong>
                <Badge variant="secondary">{SPECIALTY_LABELS[encounter.specialty]}</Badge>
                <Badge variant="outline">{ENCOUNTER_STATUS_LABELS[encounter.status]}</Badge>
                {encounter.vas_score != null ? <Badge>VAS {encounter.vas_score}</Badge> : null}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {encounter.chief_complaint || encounter.anamnesis || ENCOUNTER_TYPE_LABELS[encounter.type]}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-80 group-hover:opacity-100">
                Открыть приём <ExternalLink className="h-3 w-3" />
              </span>
            </Link>
            <Button type="button" variant="ghost" size="icon" onClick={() => void onDelete(encounter)} aria-label="Удалить приём">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )) : query.data ? <p className="py-6 text-center text-sm text-muted-foreground">Приёмов ещё нет</p> : null}
      </CardContent>
    </Card>
  );
}
