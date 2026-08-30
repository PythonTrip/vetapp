"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAnamnesisFields, type AnamnesisFieldDef } from "@/lib/anamnesis-schema";
import type { AnamnesisData, EncounterSpecialty } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Props = {
  specialty: EncounterSpecialty;
  value: AnamnesisData;
  disabled?: boolean;
  onChange: (next: AnamnesisData) => void;
};

function ChipField({
  field,
  selected,
  disabled,
  onToggle,
}: {
  field: AnamnesisFieldDef;
  selected: string[];
  disabled?: boolean;
  onToggle: (option: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {(field.options ?? []).map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(option)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AnamnesisForm({ specialty, value, disabled, onChange }: Props) {
  const fields = getAnamnesisFields(specialty);

  function setAnswer(id: string, next: string | string[]) {
    onChange({
      ...value,
      specialty,
      answers: { ...value.answers, [id]: next },
    });
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const current = value.answers[field.id];
        if (field.type === "select") {
          const selected = typeof current === "string" && current ? current : "none";
          return (
            <div key={field.id} className="space-y-2">
              <Label>{field.label}</Label>
              <Select
                value={selected}
                onValueChange={(next) => setAnswer(field.id, next === "none" ? "" : next)}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Не указано" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не указано</SelectItem>
                  {(field.options ?? []).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        if (field.type === "chips") {
          const selected = Array.isArray(current) ? current : [];
          return (
            <ChipField
              key={field.id}
              field={field}
              selected={selected}
              disabled={disabled}
              onToggle={(option) => {
                const next = selected.includes(option)
                  ? selected.filter((item) => item !== option)
                  : [...selected, option];
                setAnswer(field.id, next);
              }}
            />
          );
        }
        if (field.type === "toggle") {
          const on = current === "yes";
          return (
            <label key={field.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{field.label}</span>
              <Switch
                checked={on}
                disabled={disabled}
                onCheckedChange={(checked) => setAnswer(field.id, checked ? "yes" : "no")}
              />
            </label>
          );
        }
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={`anamnesis-${field.id}`}>{field.label}</Label>
            <Input
              id={`anamnesis-${field.id}`}
              value={typeof current === "string" ? current : ""}
              placeholder={field.placeholder}
              disabled={disabled}
              onChange={(event) => setAnswer(field.id, event.target.value)}
            />
          </div>
        );
      })}
      <div className="space-y-2">
        <Label htmlFor="anamnesis-free">Свободный текст</Label>
        <Textarea
          id="anamnesis-free"
          value={value.free_text ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, specialty, free_text: event.target.value })}
        />
      </div>
      <Badge variant="outline">Сводка сохранится в текстовый анамнез</Badge>
    </div>
  );
}
