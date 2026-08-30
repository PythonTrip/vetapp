"use client";

import * as React from "react";
import { Check, ChevronsUpDown, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import type { PatientRecord } from "@/lib/api-client";
import { useDebouncedValue, usePatientsQuery } from "@/lib/hooks";
import { apiErrorMessage } from "@/lib/patient-form";
import { cn } from "@/lib/utils";

export const MANUAL_PATIENT_LABEL = "Без пациента · ручной профиль";
const MANUAL_VALUE = "__manual__";

export function patientOptionLabel(patient: { name: string; client: { name: string } }): string {
  return `${patient.name} · ${patient.client.name}`;
}

type PatientPickerProps = {
  value: string;
  selected: PatientRecord | null;
  selectedPending?: boolean;
  disabled?: boolean;
  id?: string;
  onChange: (patientId: string) => void;
};

export function PatientPicker({
  value,
  selected,
  selectedPending = false,
  disabled = false,
  id,
  onChange,
}: PatientPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const patients = usePatientsQuery(debouncedQuery, open);
  const matches = patients.data ?? [];
  const selectedLabel = value && selected
    ? patientOptionLabel(selected)
    : value
      ? "Пациент не найден"
      : MANUAL_PATIENT_LABEL;

  function choose(nextId: string) {
    onChange(nextId);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
      modal
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Пациент"
          disabled={disabled}
          className="h-9 w-full justify-between border-input bg-background px-3 font-normal shadow-xs hover:bg-accent"
        >
          <span className="flex min-w-0 items-center gap-2">
            <PawPrint className="size-4 shrink-0 text-muted-foreground" />
            {selectedPending && value ? (
              <Skeleton className="h-4 w-48" />
            ) : (
              <span className={cn("truncate", !value && "text-muted-foreground")}>{selectedLabel}</span>
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] p-0 shadow-[0_12px_34px_-26px_oklch(0.25_0.04_175_/_0.38)]"
      >
        <Command shouldFilter={false} className="rounded-[10px]">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Кличка или имя владельца"
            aria-label="Поиск пациента"
          />
          <CommandList>
            <CommandGroup>
              <CommandItem
                value={MANUAL_VALUE}
                onSelect={() => choose("")}
                className="rounded-[8px] aria-selected:bg-accent"
              >
                <Check className={cn("size-4", value ? "opacity-0" : "opacity-100 text-primary")} />
                <span className="text-muted-foreground">{MANUAL_PATIENT_LABEL}</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Пациенты">
              {patients.isPending ? (
                <div className="space-y-2 px-2 py-3" aria-busy="true">
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-5/6" />
                  <Skeleton className="h-7 w-4/5" />
                </div>
              ) : patients.isError ? (
                <p className="px-2 py-4 text-sm text-destructive" role="alert">
                  {apiErrorMessage(patients.error)}
                </p>
              ) : (
                <>
                  {matches.map((patient) => {
                    const active = patient.uuid === value;
                    return (
                      <CommandItem
                        key={patient.uuid}
                        value={patient.uuid}
                        onSelect={() => choose(patient.uuid)}
                        className="rounded-[8px] aria-selected:bg-accent"
                      >
                        <Check className={cn("size-4", active ? "opacity-100 text-primary" : "opacity-0")} />
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{patient.name}</span>
                          <span className="text-muted-foreground"> · {patient.client.name}</span>
                        </span>
                      </CommandItem>
                    );
                  })}
                  {!matches.length ? (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                      Пациенты не найдены
                    </p>
                  ) : null}
                </>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
