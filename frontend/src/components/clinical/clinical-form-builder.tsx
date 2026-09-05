"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  ClipboardPlus,
  CopyPlus,
  GripVertical,
  Library,
  ListPlus,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClinicalTextarea } from "@/components/clinical/clinical-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  EncounterSpecialty,
} from "@/lib/api-client";
import {
  catalogFromRecords,
  generateClinicalText,
  isEmptyClinicalValue,
  sectionCompletion,
  type ClinicalBuilderCatalog,
  type ClinicalDocument,
  type ClinicalDocumentKind,
  type ClinicalField,
  type ClinicalFieldType,
  type ClinicalItemScope,
  type ClinicalSection,
  type VisitTemplate,
} from "@/lib/clinical-builder";
import {
  useCreateClinicalCatalogItem,
  useCreateEncounterTemplate,
  useDeleteClinicalCatalogItem,
  useDeleteEncounterTemplate,
} from "@/lib/hooks";
import { apiErrorMessage } from "@/lib/patient-form";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

type Props = {
  kind: ClinicalDocumentKind;
  specialty: EncounterSpecialty;
  value: ClinicalDocument;
  catalog: ClinicalBuilderCatalog;
  doctorName: string;
  disabled?: boolean;
  saveState?: SaveState;
  onChange: (next: ClinicalDocument) => void;
};

const FIELD_TYPE_LABELS: Record<ClinicalFieldType, string> = {
  binary: "Да / нет",
  single_select: "Один вариант",
  multi_select: "Несколько вариантов",
  number: "Число",
  text: "Текст",
  date: "Дата",
};

const SCOPE_LABELS: Record<ClinicalItemScope, string> = {
  standard: "Системные",
  clinic: "Клиника",
  doctor: "Мои",
};

function SaveIndicator({ state = "idle" }: { state?: SaveState }) {
  const content = {
    idle: { label: "Автосохранение", tone: "bg-muted-foreground/45", className: "text-muted-foreground" },
    dirty: { label: "Есть изменения", tone: "bg-amber-500", className: "text-amber-700" },
    saving: { label: "Сохраняем", tone: "bg-primary", className: "text-primary" },
    saved: { label: "Сохранено", tone: "bg-emerald-600", className: "text-emerald-700" },
    error: { label: "Не сохранено", tone: "bg-destructive", className: "text-destructive" },
  }[state];
  return (
    <span role="status" aria-live="polite" aria-atomic="true" className={cn("inline-flex min-w-28 items-center justify-end gap-1.5 text-xs font-medium", content.className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", content.tone)} aria-hidden="true" />
      {content.label}
    </span>
  );
}

function SegmentedChoice({
  field,
  value,
  disabled,
  multiple,
  onChange,
}: {
  field: ClinicalField;
  value: unknown;
  disabled?: boolean;
  multiple?: boolean;
  onChange: (value: unknown) => void;
}) {
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const options = field.options ?? [];
  const selected = multiple ? (Array.isArray(value) ? value : []) : [value];
  return (
    <div className="flex flex-wrap gap-1.5" role={multiple ? "group" : "radiogroup"} aria-label={field.label}>
      {options.map((item, index) => {
        const active = selected.includes(item.value);
        return (
          <button
            key={item.value}
            ref={(node) => { buttonRefs.current[index] = node; }}
            type="button"
            role={multiple ? undefined : "radio"}
            aria-checked={multiple ? undefined : active}
            aria-pressed={multiple ? active : undefined}
            tabIndex={multiple || active || (isEmptyClinicalValue(value) && index === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => {
              if (!multiple) return onChange(active ? "" : item.value);
              const current = Array.isArray(value) ? value : [];
              if (active) return onChange(current.filter((entry) => entry !== item.value));
              const normalValues = (field.options ?? []).filter((entry) => entry.normal).map((entry) => entry.value);
              onChange(item.normal ? [item.value] : [...current.filter((entry) => !normalValues.includes(String(entry))), item.value]);
            }}
            onKeyDown={(event) => {
              if (multiple || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
              event.preventDefault();
              const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
              const nextIndex = (index + step + options.length) % options.length;
              const next = options[nextIndex];
              if (!next) return;
              onChange(next.value);
              buttonRefs.current[nextIndex]?.focus();
            }}
            className={cn(
              "min-h-9 rounded-lg border px-2.5 py-1 text-xs font-medium transition-[background-color,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-[0_3px_10px_-7px_oklch(0.25_0.04_175/0.55)]"
                : "border-border/80 bg-background text-muted-foreground hover:border-primary/35 hover:bg-primary/5 hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: ClinicalField;
  value: unknown;
  disabled?: boolean;
  onChange: (next: unknown) => void;
}) {
  if (field.type === "binary" || field.type === "single_select") {
    return <SegmentedChoice field={field} value={value} disabled={disabled} onChange={onChange} />;
  }
  if (field.type === "multi_select") {
    return <SegmentedChoice field={field} value={value} disabled={disabled} multiple onChange={onChange} />;
  }
  if (field.type === "number") {
    return (
      <div className="flex max-w-56 items-center">
        <Input
          type="number"
          inputMode="decimal"
          value={typeof value === "number" || typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
          className={cn("h-8", field.unit && "rounded-r-none")}
          aria-label={field.label}
        />
        {field.unit ? <span className="flex h-8 items-center rounded-r-lg border border-l-0 bg-muted/45 px-2.5 text-xs text-muted-foreground">{field.unit}</span> : null}
      </div>
    );
  }
  return (
    <Input
      type={field.type === "date" ? "date" : "text"}
      value={typeof value === "string" ? value : ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      className="h-8 max-w-xl"
      aria-label={field.label}
    />
  );
}

function FieldRow({
  field,
  value,
  note,
  disabled,
  canMoveUp,
  canMoveDown,
  onValueChange,
  onNoteChange,
  onMove,
  onRemove,
}: {
  field: ClinicalField;
  value: unknown;
  note?: string;
  disabled?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onValueChange: (value: unknown) => void;
  onNoteChange: (note: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const clarificationVisible = field.clarification
    && (Array.isArray(value)
      ? value.some((entry) => field.clarification?.when.includes(String(entry)))
      : field.clarification.when.includes(String(value)));

  return (
    <div className="group grid gap-2 border-t border-border/55 px-3 py-2.5 first:border-t-0 sm:grid-cols-[minmax(9.5rem,0.42fr)_minmax(0,1fr)_8.75rem] sm:items-start sm:px-4">
      <div className="flex min-w-0 items-center gap-1.5 pt-1">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/35" aria-hidden="true" />
        <span className="text-xs font-semibold leading-5 text-foreground/85">{field.label}</span>
      </div>
      <div className="min-w-0 space-y-2">
        <FieldControl field={field} value={value} disabled={disabled} onChange={onValueChange} />
        {clarificationVisible ? (
          <Input
            value={note ?? ""}
            disabled={disabled}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={field.clarification?.placeholder}
            aria-label={`${field.label}: ${field.clarification?.label ?? "уточнение"}`}
            className="h-8 border-dashed bg-muted/15 text-xs"
          />
        ) : null}
      </div>
      <div className="flex justify-end gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={!canMoveUp || disabled} onClick={() => onMove(-1)} aria-label={`Переместить «${field.label}» выше`}><ArrowUp className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={!canMoveDown || disabled} onClick={() => onMove(1)} aria-label={`Переместить «${field.label}» ниже`}><ArrowDown className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive" disabled={disabled} onClick={onRemove} aria-label={`Убрать «${field.label}» из приёма`}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

function ClinicalSectionBlock({
  section,
  fields,
  document,
  disabled,
  open,
  canMoveUp,
  canMoveDown,
  onOpenChange,
  onFieldValue,
  onFieldNote,
  onMoveSection,
  onMoveField,
  onRemoveSection,
  onRemoveField,
}: {
  section: ClinicalSection;
  fields: ClinicalField[];
  document: ClinicalDocument;
  disabled?: boolean;
  open: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpenChange: (open: boolean) => void;
  onFieldValue: (field: ClinicalField, value: unknown) => void;
  onFieldNote: (field: ClinicalField, note: string) => void;
  onMoveSection: (direction: -1 | 1) => void;
  onMoveField: (fieldId: string, direction: -1 | 1) => void;
  onRemoveSection: () => void;
  onRemoveField: (fieldId: string) => void;
}) {
  const completion = sectionCompletion(document, section);
  const statusField = fields.find((field) => field.id === section.statusFieldId);
  const statusValue = document.values.find((item) => item.fieldId === section.statusFieldId)?.value;
  const compactNormal = section.disclosure === "system" && statusValue === "normal";
  const revealChanges = section.disclosure !== "system" || statusValue === "changes";
  const visibleFields = fields.filter((field) => field.id !== section.statusFieldId);

  return (
    <div className={cn("border-b border-border/70 last:border-b-0", open && "bg-card")}>
      <div className="flex min-h-12 items-center gap-2 px-3 py-2 sm:px-4">
        <button type="button" onClick={() => onOpenChange(!open)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45" aria-expanded={open}>
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="truncate text-sm font-semibold">{section.label}</span>
          {completion.filled === completion.total && completion.total > 0 ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : null}
        </button>
        <span className={cn("shrink-0 text-xs tabular-nums", completion.filled ? "font-medium text-foreground" : "text-muted-foreground")}>
          {completion.filled ? `${completion.filled}/${completion.total}` : "—"}
        </span>
        <div className="flex shrink-0 gap-0.5">
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={!canMoveUp || disabled} onClick={() => onMoveSection(-1)} aria-label={`Переместить раздел «${section.label}» выше`}><ArrowUp className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={!canMoveDown || disabled} onClick={() => onMoveSection(1)} aria-label={`Переместить раздел «${section.label}» ниже`}><ArrowDown className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive" disabled={disabled} onClick={onRemoveSection} aria-label={`Убрать раздел «${section.label}» из приёма`}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {section.disclosure === "system" && statusField ? (
        <div className={cn("px-4 pb-3 pl-9", compactNormal && !open && "pb-2.5")}>
          <SegmentedChoice field={statusField} value={statusValue} disabled={disabled} onChange={(value) => onFieldValue(statusField, value)} />
        </div>
      ) : null}

      {open && revealChanges ? (
        <div className="border-t border-border/55 bg-muted/[0.12]">
          {visibleFields.map((field, index) => {
            const fieldValue = document.values.find((item) => item.fieldId === field.id);
            return (
              <FieldRow
                key={field.id}
                field={field}
                value={fieldValue?.value}
                note={fieldValue?.note}
                disabled={disabled}
                canMoveUp={index > 0}
                canMoveDown={index < visibleFields.length - 1}
                onValueChange={(value) => onFieldValue(field, value)}
                onNoteChange={(note) => onFieldNote(field, note)}
                onMove={(direction) => onMoveField(field.id, direction)}
                onRemove={() => onRemoveField(field.id)}
              />
            );
          })}
          {!visibleFields.length ? <p className="px-9 py-4 text-xs text-muted-foreground">В этом разделе пока нет пунктов.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function ClinicalFormBuilder({
  kind,
  specialty,
  value,
  catalog,
  doctorName,
  disabled,
  saveState,
  onChange,
}: Props) {
  const [mode, setMode] = React.useState<"structured" | "text">("structured");
  const [libraryTab, setLibraryTab] = React.useState<"templates" | "fields">("templates");
  const [scope, setScope] = React.useState<ClinicalItemScope | "all">("all");
  const [query, setQuery] = React.useState("");
  const [openSections, setOpenSections] = React.useState<Set<string>>(() => new Set(value.sectionIds.slice(0, 1)));
  const [itemDialog, setItemDialog] = React.useState<"field" | "section" | null>(null);
  const [itemScope, setItemScope] = React.useState<"clinic" | "doctor">(doctorName.trim() ? "doctor" : "clinic");
  const [itemLabel, setItemLabel] = React.useState("");
  const [fieldType, setFieldType] = React.useState<ClinicalFieldType>("single_select");
  const [fieldOptions, setFieldOptions] = React.useState("");
  const [fieldUnit, setFieldUnit] = React.useState("");
  const [fieldSectionId, setFieldSectionId] = React.useState(value.sectionIds[0] ?? "");
  const [templateDialog, setTemplateDialog] = React.useState(false);
  const [templateTitle, setTemplateTitle] = React.useState("");
  const [templateScope, setTemplateScope] = React.useState<"clinic" | "doctor">(doctorName.trim() ? "doctor" : "clinic");
  const [templateDefinition, setTemplateDefinition] = React.useState<VisitTemplate["definition"] | null>(null);
  const createCatalogItem = useCreateClinicalCatalogItem();
  const createTemplate = useCreateEncounterTemplate();
  const deleteCatalogItem = useDeleteClinicalCatalogItem();
  const deleteTemplate = useDeleteEncounterTemplate();

  const activeSections = value.sectionIds.flatMap((id) => {
    const section = catalog.sections.find((item) => item.id === id);
    return section ? [section] : [];
  });
  const completedCount = value.values.filter((item) => !isEmptyClinicalValue(item.value)).length;
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const availableTemplates = catalog.templates.filter((template) => {
    if (template.documentKind !== kind) return false;
    if (template.specialty !== specialty && template.specialty !== "general") return false;
    if (scope !== "all" && template.scope !== scope) return false;
    return !normalizedQuery || template.title.toLocaleLowerCase("ru").includes(normalizedQuery);
  });
  const availableFields = catalog.fields.filter((field) => {
    if (catalog.sections.find((section) => section.id === field.sectionId)?.kind !== kind) return false;
    if (scope !== "all" && (field.scope ?? "standard") !== scope) return false;
    return !normalizedQuery || `${field.label} ${field.key}`.toLocaleLowerCase("ru").includes(normalizedQuery);
  });
  const frequentFields = availableFields.filter((field) => field.frequent);

  function commit(next: ClinicalDocument, forceRegenerate = false) {
    const shouldGenerate = forceRegenerate || !next.textEdited;
    onChange({ ...next, finalText: shouldGenerate ? generateClinicalText(next, catalog) : next.finalText });
  }

  function updateField(field: ClinicalField, fieldValue: unknown) {
    const section = catalog.sections.find((item) => item.id === field.sectionId);
    let values = value.values.filter((item) => item.fieldId !== field.id);
    const previous = value.values.find((item) => item.fieldId === field.id);
    const clarificationActive = field.clarification
      && (Array.isArray(fieldValue)
        ? fieldValue.some((item) => field.clarification?.when.includes(String(item)))
        : field.clarification.when.includes(String(fieldValue)));
    if (section?.statusFieldId === field.id && fieldValue === "normal") {
      const dependentIds = new Set((value.sectionFieldIds[section.id] ?? section.fieldIds).filter((id) => id !== field.id));
      values = values.filter((item) => !dependentIds.has(item.fieldId));
    }
    if (!isEmptyClinicalValue(fieldValue)) values.push({ fieldId: field.id, type: field.type, value: fieldValue, note: clarificationActive ? previous?.note : undefined });
    const next = { ...value, values };
    commit(next);
    if (field.id.endsWith("_status") && fieldValue === "changes") {
      setOpenSections((current) => new Set(current).add(field.sectionId));
    }
  }

  function updateNote(field: ClinicalField, note: string) {
    const values = value.values.map((item) => item.fieldId === field.id ? { ...item, note } : item);
    commit({ ...value, values });
  }

  function applyTemplate(template: VisitTemplate) {
    const sectionFieldIds = Object.fromEntries(template.definition.sectionIds.map((sectionId) => [
      sectionId,
      template.definition.sectionFieldIds?.[sectionId]
        ?? catalog.sections.find((section) => section.id === sectionId)?.fieldIds
        ?? [],
    ]));
    const next = {
      ...value,
      templateId: template.id,
      sectionIds: [...template.definition.sectionIds],
      sectionFieldIds,
    };
    setOpenSections(new Set(next.sectionIds.slice(0, 1)));
    commit(next, !value.textEdited);
    toast.success(`Шаблон «${template.title}» применён`);
  }

  function addField(field: ClinicalField) {
    const section = catalog.sections.find((item) => item.id === field.sectionId);
    if (!section) return;
    const sectionIds = value.sectionIds.includes(section.id) ? value.sectionIds : [...value.sectionIds, section.id];
    const currentFieldIds = value.sectionFieldIds[section.id] ?? section.fieldIds;
    const sectionFieldIds = {
      ...value.sectionFieldIds,
      [section.id]: currentFieldIds.includes(field.id) ? currentFieldIds : [...currentFieldIds, field.id],
    };
    commit({ ...value, sectionIds, sectionFieldIds });
    setOpenSections((current) => new Set(current).add(section.id));
    toast.success(`Пункт «${field.label}» добавлен`);
  }

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.sectionIds.length) return;
    const sectionIds = [...value.sectionIds];
    [sectionIds[index], sectionIds[target]] = [sectionIds[target], sectionIds[index]];
    commit({ ...value, sectionIds });
  }

  function moveField(section: ClinicalSection, fieldId: string, direction: -1 | 1) {
    const fieldIds = [...(value.sectionFieldIds[section.id] ?? section.fieldIds)];
    const index = fieldIds.indexOf(fieldId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= fieldIds.length) return;
    [fieldIds[index], fieldIds[target]] = [fieldIds[target], fieldIds[index]];
    commit({ ...value, sectionFieldIds: { ...value.sectionFieldIds, [section.id]: fieldIds } });
  }

  function removeField(section: ClinicalSection, fieldId: string, skipConfirm = false, silent = false) {
    const fieldValue = value.values.find((item) => item.fieldId === fieldId);
    const fieldLabel = catalog.fields.find((item) => item.id === fieldId)?.label ?? "этот пункт";
    if (!skipConfirm && fieldValue && !isEmptyClinicalValue(fieldValue.value) && !window.confirm(`Убрать заполненный пункт «${fieldLabel}» из приёма? Введённое значение будет удалено.`)) return;
    const fieldIds = (value.sectionFieldIds[section.id] ?? section.fieldIds).filter((id) => id !== fieldId);
    commit({
      ...value,
      sectionFieldIds: { ...value.sectionFieldIds, [section.id]: fieldIds },
      values: value.values.filter((item) => item.fieldId !== fieldId),
    });
    if (!silent) toast.success(`Пункт «${fieldLabel}» убран из приёма`);
  }

  function removeSection(section: ClinicalSection) {
    const removedFieldIds = new Set(value.sectionFieldIds[section.id] ?? section.fieldIds);
    const hasValues = value.values.some((item) => removedFieldIds.has(item.fieldId) && !isEmptyClinicalValue(item.value));
    if (hasValues && !window.confirm(`Убрать заполненный раздел «${section.label}» из приёма? Все введённые в нём значения будут удалены.`)) return;
    const sectionFieldIds = { ...value.sectionFieldIds };
    delete sectionFieldIds[section.id];
    commit({
      ...value,
      sectionIds: value.sectionIds.filter((id) => id !== section.id),
      sectionFieldIds,
      values: value.values.filter((item) => !removedFieldIds.has(item.fieldId)),
    });
    setOpenSections((current) => {
      const next = new Set(current);
      next.delete(section.id);
      return next;
    });
    toast.success(`Раздел «${section.label}» убран из приёма`);
  }

  async function deleteCustomCatalogItem(id: string, label: string) {
    const hasCurrentValue = value.values.some((item) => item.fieldId === id && !isEmptyClinicalValue(item.value));
    const consequence = hasCurrentValue ? " Пункт и его введённое значение также будут удалены из текущего приёма." : "";
    if (!window.confirm(`Удалить «${label}» из библиотеки?${consequence}`)) return;
    try {
      await deleteCatalogItem.mutateAsync(id);
      const field = catalog.fields.find((item) => item.id === id);
      if (field) removeField(catalog.sections.find((item) => item.id === field.sectionId) ?? { id: field.sectionId, key: "", label: "", kind, fieldIds: [] }, id, true, true);
      toast.success(`«${label}» удалено из библиотеки`);
    } catch (cause) {
      toast.error(apiErrorMessage(cause));
    }
  }

  async function deleteCustomTemplate(template: VisitTemplate) {
    if (!window.confirm(`Удалить шаблон «${template.title}»?`)) return;
    try {
      await deleteTemplate.mutateAsync(template.id);
      toast.success(`Шаблон «${template.title}» удалён`);
    } catch (cause) {
      toast.error(apiErrorMessage(cause));
    }
  }

  function openItemDialog(kindValue: "field" | "section") {
    setItemDialog(kindValue);
    setItemLabel("");
    setFieldOptions("");
    setFieldUnit("");
    setFieldType("single_select");
    setFieldSectionId(value.sectionIds[0] ?? catalog.sections.find((item) => item.kind === kind)?.id ?? "");
    setItemScope(doctorName.trim() ? "doctor" : "clinic");
  }

  async function saveCatalogItem() {
    if (!itemDialog || !itemLabel.trim()) return;
    if (itemScope === "doctor" && !doctorName.trim()) {
      toast.error("Укажите имя врача в шапке приёма");
      return;
    }
    try {
      if (itemDialog === "field") {
        if (!fieldSectionId) return;
        const parsedOptions = fieldOptions.split(",").map((entry) => entry.trim()).filter(Boolean);
        if ((fieldType === "single_select" || fieldType === "multi_select") && parsedOptions.length === 0) {
          toast.error("Добавьте хотя бы один вариант ответа");
          return;
        }
        const record = await createCatalogItem.mutateAsync({
          kind: "field",
          scope: itemScope,
          specialty,
          key: `custom_${Date.now()}`,
          label: itemLabel.trim(),
          definition: {
            type: fieldType,
            sectionId: fieldSectionId,
            unit: fieldUnit.trim() || undefined,
            options: ["binary", "single_select", "multi_select"].includes(fieldType)
              ? (fieldType === "binary" && !fieldOptions.trim()
                ? [{ value: "no", label: "Нет", normal: true }, { value: "yes", label: "Да" }]
                : parsedOptions.map((label, index) => ({ value: `option_${index + 1}`, label })))
              : undefined,
          },
          doctor_name: itemScope === "doctor" ? doctorName.trim() : null,
        });
        const field = catalogFromRecords([record]).fields[0];
        if (field) addField(field);
      } else {
        const record = await createCatalogItem.mutateAsync({
          kind: "section",
          scope: itemScope,
          specialty,
          key: `custom_${Date.now()}`,
          label: itemLabel.trim(),
          definition: { kind, fieldIds: [], disclosure: "standard" },
          doctor_name: itemScope === "doctor" ? doctorName.trim() : null,
        });
        onChange({
          ...value,
          sectionIds: [...value.sectionIds, record.uuid],
          sectionFieldIds: { ...value.sectionFieldIds, [record.uuid]: [] },
        });
        setOpenSections((current) => new Set(current).add(record.uuid));
      }
      setItemDialog(null);
      toast.success(itemDialog === "field" ? "Пункт создан" : "Раздел создан");
    } catch (cause) {
      toast.error(apiErrorMessage(cause));
    }
  }

  async function saveAsTemplate() {
    if (!templateTitle.trim()) return;
    if (templateScope === "doctor" && !doctorName.trim()) {
      toast.error("Укажите имя врача в шапке приёма");
      return;
    }
    try {
      await createTemplate.mutateAsync({
        scope: templateScope,
        section: kind,
        specialty,
        title: templateTitle.trim(),
        body: value.finalText.trim() || "Структурированный клинический шаблон",
        definition: templateDefinition
          ? { ...templateDefinition }
          : { kind: "structured", sectionIds: value.sectionIds, sectionFieldIds: value.sectionFieldIds },
        doctor_name: templateScope === "doctor" ? doctorName.trim() : null,
      });
      setTemplateDialog(false);
      setTemplateTitle("");
      setTemplateDefinition(null);
      toast.success("Шаблон сохранён");
    } catch (cause) {
      toast.error(apiErrorMessage(cause));
    }
  }

  const title = kind === "anamnesis" ? "Анамнез" : "Осмотр";
  const description = kind === "anamnesis"
    ? "Клиническая история по готовым пунктам — текст формируется автоматически."
    : "Норму отмечайте одним кликом; подробности открываются только при изменениях.";

  return (
    <section className="overflow-hidden rounded-2xl bg-card shadow-[0_12px_34px_-26px_oklch(0.25_0.04_175/0.38)] ring-1 ring-border">
      <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {kind === "anamnesis" ? <ClipboardPlus className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </span>
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            <Badge variant="outline" className="h-5 bg-background px-1.5 text-[10px] font-medium">{completedCount} заполнено</Badge>
          </div>
          <p className="mt-1 pl-10 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 self-end sm:self-auto">
          <SaveIndicator state={saveState} />
          <div className="inline-flex rounded-lg bg-muted p-0.5" aria-label={`Режим раздела ${title}`}>
            <button type="button" aria-pressed={mode === "structured"} onClick={() => setMode("structured")} className={cn("min-h-8 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45", mode === "structured" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Структурировано</button>
            <button type="button" aria-pressed={mode === "text"} onClick={() => setMode("text")} className={cn("min-h-8 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45", mode === "text" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Итоговый текст</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-h-[360px] min-w-0 xl:border-r">
          {mode === "structured" ? (
            <div>
              {activeSections.map((section, index) => {
                const fieldIds = value.sectionFieldIds[section.id] ?? section.fieldIds;
                const sectionFields = fieldIds.flatMap((id) => {
                  const field = catalog.fields.find((item) => item.id === id);
                  return field ? [field] : [];
                });
                return (
                  <ClinicalSectionBlock
                    key={section.id}
                    section={section}
                    fields={sectionFields}
                    document={value}
                    disabled={disabled}
                    open={openSections.has(section.id)}
                    canMoveUp={index > 0}
                    canMoveDown={index < activeSections.length - 1}
                    onOpenChange={(open) => setOpenSections((current) => {
                      const next = new Set(current);
                      if (open) next.add(section.id); else next.delete(section.id);
                      return next;
                    })}
                    onFieldValue={updateField}
                    onFieldNote={updateNote}
                    onMoveSection={(direction) => moveSection(index, direction)}
                    onMoveField={(fieldId, direction) => moveField(section, fieldId, direction)}
                    onRemoveSection={() => removeSection(section)}
                    onRemoveField={(fieldId) => removeField(section, fieldId)}
                  />
                );
              })}
              {!activeSections.length ? (
                <div className="flex min-h-72 flex-col items-center justify-center px-5 text-center">
                  <Library className="h-7 w-7 text-muted-foreground/55" />
                  <p className="mt-3 text-sm font-semibold">Начните с шаблона или пункта</p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Выберите готовую структуру справа — её можно изменить и сохранить как собственную.</p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 border-t bg-muted/15 px-4 py-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setLibraryTab("fields"); setQuery(""); }}><Plus className="h-3.5 w-3.5" />Добавить пункт</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => openItemDialog("section")}><ListPlus className="h-3.5 w-3.5" />Новый раздел</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setTemplateDefinition(null); setTemplateTitle(""); setTemplateDialog(true); }}><CopyPlus className="h-3.5 w-3.5" />Сохранить как шаблон</Button>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <Label htmlFor={`clinical-final-${kind}`}>Медицинская запись</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, finalText: generateClinicalText(value, catalog), textEdited: false })} disabled={disabled}><RotateCcw className="h-3.5 w-3.5" />Собрать заново</Button>
              </div>
              <ClinicalTextarea
                id={`clinical-final-${kind}`}
                value={value.finalText}
                disabled={disabled}
                onChange={(event) => onChange({ ...value, finalText: event.target.value, textEdited: true })}
                placeholder="Текст появится после заполнения структурированных пунктов. Его можно дополнить вручную."
                className="min-h-[330px] bg-background text-[15px] leading-7"
              />
              {value.textEdited ? <p className="mt-2 text-xs text-muted-foreground">Текст изменён вручную. Структурированные данные сохраняются отдельно.</p> : null}
            </div>
          )}
        </div>

        <aside className="min-h-[360px] bg-muted/15">
          <Tabs value={libraryTab} onValueChange={(next) => setLibraryTab(next as "templates" | "fields")}>
            <div className="border-b p-3">
              <TabsList className="grid h-8 w-full grid-cols-2 bg-muted/70">
                <TabsTrigger value="templates" className="text-xs">Шаблоны</TabsTrigger>
                <TabsTrigger value="fields" className="text-xs">Пункты</TabsTrigger>
              </TabsList>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={libraryTab === "templates" ? "Найти шаблон" : "Например, вакцинация"} className="h-8 bg-background pl-8 text-xs" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(["all", "standard", "clinic", "doctor"] as const).map((item) => (
                  <button key={item} type="button" onClick={() => setScope(item)} aria-pressed={scope === item} className={cn("min-h-8 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45", scope === item ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}>{item === "all" ? "Все" : SCOPE_LABELS[item]}</button>
                ))}
              </div>
            </div>

            <TabsContent value="templates" className="m-0 p-2.5">
              <div className="space-y-1">
                {availableTemplates.map((template) => (
                  <div key={template.id} className="group flex items-center gap-1 rounded-lg px-2 py-2 hover:bg-background focus-within:bg-background">
                    <button type="button" onClick={() => applyTemplate(template)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45">
                      <span className="block truncate text-xs font-semibold">{template.title}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{SCOPE_LABELS[template.scope]} · {template.definition.sectionIds.length} разделов</span>
                    </button>
                    {template.scope === "standard" ? <Button type="button" variant="ghost" size="icon" className="h-9 w-9 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" onClick={() => { setTemplateDefinition(template.definition); setTemplateTitle(`${template.title} — копия`); setTemplateDialog(true); }} aria-label={`Сохранить «${template.title}» как собственный`}><CopyPlus className="h-3.5 w-3.5" /></Button> : null}
                    {template.scope !== "standard" ? <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" onClick={() => void deleteCustomTemplate(template)} aria-label={`Удалить шаблон «${template.title}»`}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/55" />
                  </div>
                ))}
                {!availableTemplates.length ? <p className="px-3 py-8 text-center text-xs text-muted-foreground">Структурированные шаблоны не найдены.</p> : null}
              </div>

            </TabsContent>

            <TabsContent value="fields" className="m-0 p-2.5">
              {!normalizedQuery && frequentFields.length ? (
                <div className="mb-3">
                  <p className="px-2 pb-1.5 text-[10px] font-semibold text-muted-foreground">Часто используемые</p>
                  {frequentFields.map((field) => <FieldLibraryRow key={field.id} field={field} onAdd={() => addField(field)} onDelete={field.scope && field.scope !== "standard" ? () => void deleteCustomCatalogItem(field.id, field.label) : undefined} />)}
                </div>
              ) : null}
              <div>
                <p className="px-2 pb-1.5 text-[10px] font-semibold text-muted-foreground">{normalizedQuery ? "Результаты" : "Все пункты"}</p>
                {availableFields.map((field) => <FieldLibraryRow key={field.id} field={field} onAdd={() => addField(field)} onDelete={field.scope && field.scope !== "standard" ? () => void deleteCustomCatalogItem(field.id, field.label) : undefined} />)}
                {!availableFields.length ? <p className="px-3 py-8 text-center text-xs text-muted-foreground">Пункты не найдены.</p> : null}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => openItemDialog("field")}><CirclePlus className="h-3.5 w-3.5" />Создать свой пункт</Button>
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <Dialog open={itemDialog !== null} onOpenChange={(open) => !open && setItemDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{itemDialog === "field" ? "Новый клинический пункт" : "Новый раздел"}</DialogTitle>
            <DialogDescription>{itemDialog === "field" ? "Пункт появится в библиотеке и сразу добавится в текущий приём." : "Раздел добавится в текущий приём; затем наполните его пунктами."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <ScopeChooser value={itemScope} doctorName={doctorName} onChange={setItemScope} />
            <div className="space-y-2"><Label htmlFor="clinical-item-label">Название</Label><Input id="clinical-item-label" value={itemLabel} onChange={(event) => setItemLabel(event.target.value)} autoFocus /></div>
            {itemDialog === "field" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Тип</Label><Select value={fieldType} onValueChange={(next) => setFieldType(next as ClinicalFieldType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(FIELD_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Раздел</Label><Select value={fieldSectionId} onValueChange={setFieldSectionId}><SelectTrigger><SelectValue placeholder="Выберите раздел" /></SelectTrigger><SelectContent>{catalog.sections.filter((section) => section.kind === kind).map((section) => <SelectItem key={section.id} value={section.id}>{section.label}</SelectItem>)}</SelectContent></Select></div>
                </div>
                {["binary", "single_select", "multi_select"].includes(fieldType) ? <div className="space-y-2"><Label htmlFor="clinical-field-options">Варианты через запятую</Label><Input id="clinical-field-options" value={fieldOptions} onChange={(event) => setFieldOptions(event.target.value)} placeholder={fieldType === "binary" ? "Нет, Да" : "Вариант 1, Вариант 2"} /></div> : null}
                {fieldType === "number" ? <div className="space-y-2"><Label htmlFor="clinical-field-unit">Единица измерения</Label><Input id="clinical-field-unit" value={fieldUnit} onChange={(event) => setFieldUnit(event.target.value)} placeholder="°C, кг, уд/мин" /></div> : null}
              </>
            ) : null}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setItemDialog(null)}>Отмена</Button><Button type="button" onClick={() => void saveCatalogItem()} disabled={!itemLabel.trim() || createCatalogItem.isPending}>{createCatalogItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Создать</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templateDialog} onOpenChange={(open) => { setTemplateDialog(open); if (!open) setTemplateDefinition(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Сохранить структуру как шаблон</DialogTitle><DialogDescription>Шаблон сохранит ссылки и порядок разделов и пунктов. Системный оригинал останется неизменным.</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <ScopeChooser value={templateScope} doctorName={doctorName} onChange={setTemplateScope} />
            <div className="space-y-2"><Label htmlFor="structured-template-title">Название</Label><Input id="structured-template-title" value={templateTitle} onChange={(event) => setTemplateTitle(event.target.value)} autoFocus /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => { setTemplateDialog(false); setTemplateDefinition(null); }}>Отмена</Button><Button type="button" onClick={() => void saveAsTemplate()} disabled={!templateTitle.trim() || createTemplate.isPending}>{createTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Сохранить</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function FieldLibraryRow({ field, onAdd, onDelete }: { field: ClinicalField; onAdd: () => void; onDelete?: () => void }) {
  return (
    <div className="group flex items-center rounded-lg transition-colors hover:bg-background focus-within:bg-background">
      <button type="button" onClick={onAdd} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45">
        <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{field.label}</span>
        <span className="text-[9px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{FIELD_TYPE_LABELS[field.type]}</span>
      </button>
      {onDelete ? <Button type="button" variant="ghost" size="icon" className="mr-1 h-9 w-9 text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" onClick={onDelete} aria-label={`Удалить «${field.label}» из библиотеки`}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
    </div>
  );
}

function ScopeChooser({
  value,
  doctorName,
  onChange,
}: {
  value: "clinic" | "doctor";
  doctorName: string;
  onChange: (value: "clinic" | "doctor") => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Доступ</Label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChange("clinic")} aria-pressed={value === "clinic"} className={cn("rounded-xl border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45", value === "clinic" ? "border-primary bg-primary/8" : "hover:bg-muted")}><span className="font-semibold">Клиника</span><span className="mt-1 block text-xs text-muted-foreground">Доступно всем врачам</span></button>
        <button type="button" onClick={() => onChange("doctor")} aria-pressed={value === "doctor"} className={cn("rounded-xl border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45", value === "doctor" ? "border-primary bg-primary/8" : "hover:bg-muted")}><span className="font-semibold">Моё</span><span className="mt-1 block truncate text-xs text-muted-foreground">{doctorName.trim() || "Укажите имя врача"}</span></button>
      </div>
    </div>
  );
}
