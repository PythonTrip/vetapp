"use client";

import * as React from "react";
import { CalendarCheck, ChevronRight, FilePlus2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EncounterTemplateRecord, EncounterTemplateScope } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const SCOPE_LABELS: Record<EncounterTemplateScope, string> = {
  standard: "Стандарт",
  clinic: "Клиника",
  doctor: "Врач",
};

type PlanEditorProps = {
  value: string;
  templates: EncounterTemplateRecord[];
  pending?: boolean;
  onChange: (value: string) => void;
  onCreate: (body: string) => void;
  onEdit: (template: EncounterTemplateRecord) => void;
  onDelete: (template: EncounterTemplateRecord) => void;
};

export function PlanEditor({
  value,
  templates,
  pending,
  onChange,
  onCreate,
  onEdit,
  onDelete,
}: PlanEditorProps) {
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<EncounterTemplateScope | "all">("all");
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const filtered = templates.filter((template) => {
    if (scope !== "all" && template.scope !== scope) return false;
    if (!normalizedQuery) return true;
    return `${template.title} ${template.body}`.toLocaleLowerCase("ru").includes(normalizedQuery);
  });

  function applyTemplate(template: EncounterTemplateRecord) {
    onChange(value.trim() ? `${value.trim()}\n\n${template.body}` : template.body);
    toast.success(`Шаблон «${template.title}» добавлен`);
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-[0_12px_34px_-26px_oklch(0.25_0.04_175/0.38)]">
      <div className="flex flex-col gap-2 border-b bg-muted/35 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarCheck className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="font-semibold tracking-tight">План</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Диагностика, назначения, рекомендации владельцу и контроль.</p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit font-normal">
          {value.trim().length} знаков
        </Badge>
      </div>

      <div className="grid min-h-[390px] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-h-[390px] flex-col p-3 sm:p-5 xl:border-r">
          <Label htmlFor="encounter-plan" className="sr-only">
            План
          </Label>
          <Textarea
            id="encounter-plan"
            value={value}
            disabled={pending}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Сформируйте план диагностики и лечения…"
            className="min-h-[340px] flex-1 resize-y border-0 bg-transparent p-2 text-[15px] leading-7 shadow-none focus-visible:ring-0 sm:min-h-[360px]"
          />
        </div>

        <aside className="flex min-h-[390px] flex-col bg-muted/20">
          <div className="space-y-3 border-b p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Шаблоны плана</h3>
                <p className="text-xs text-muted-foreground">Нажмите, чтобы добавить в текст</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => onCreate(value)}>
                <Plus className="h-3.5 w-3.5" />
                Создать
              </Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск шаблона"
                className="bg-background pl-9"
                aria-label={`Поиск шаблонов раздела $План`}
              />
            </div>
            <div className="flex flex-wrap gap-1" aria-label="Фильтр шаблонов">
              {(["all", "standard", "clinic", "doctor"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setScope(item)}
                  aria-pressed={scope === item}
                  className={cn(
                    "min-h-8 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    scope === item ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item === "all" ? "Все" : SCOPE_LABELS[item]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-2 p-3 sm:p-4">
            {filtered.map((template) => (
              <div
                key={template.uuid}
                className="group rounded-xl bg-background p-3 shadow-[0_5px_18px_-16px_oklch(0.25_0.04_175/0.45)] ring-1 ring-border/70 transition-shadow hover:shadow-[0_9px_24px_-17px_oklch(0.25_0.04_175/0.55)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => applyTemplate(template)}>
                    <span className="flex items-center gap-2">
                      <strong className="truncate text-xs font-semibold">{template.title}</strong>
                      <Badge variant="secondary" className="h-5 px-1.5 text-[9px] font-medium">
                        {SCOPE_LABELS[template.scope]}
                      </Badge>
                    </span>
                    <span className="mt-1.5 line-clamp-3 block text-xs leading-5 text-muted-foreground">
                      {template.body}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                      Использовать <ChevronRight className="h-3 w-3" />
                    </span>
                  </button>
                  {template.scope !== "standard" ? (
                    <div className="flex shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(template)} aria-label={`Изменить шаблон ${template.title}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(template)} aria-label={`Удалить шаблон ${template.title}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {!filtered.length ? (
              <div className="px-3 py-10 text-center">
                <FilePlus2 className="mx-auto h-6 w-6 text-muted-foreground/60" />
                <p className="mt-2 text-xs font-medium">Шаблоны не найдены</p>
                <p className="mt-1 text-xs text-muted-foreground">Измените поиск или создайте свой шаблон.</p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

