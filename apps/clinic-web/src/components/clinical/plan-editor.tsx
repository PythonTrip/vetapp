"use client";

import { Label } from "@/components/ui/label";
import { ClinicalTextarea } from "@/components/clinical/clinical-textarea";

type PlanEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function PlanEditor({ value, onChange }: PlanEditorProps) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <Label htmlFor="encounter-plan" className="text-base font-semibold">План</Label>
      <p className="mt-1 text-xs text-muted-foreground">
        Диагностика, назначения, рекомендации владельцу и контроль.
      </p>
      <ClinicalTextarea
        id="encounter-plan"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Сформируйте план диагностики и лечения…"
        className="mt-3 min-h-40 text-[15px] leading-7"
      />
    </section>
  );
}
