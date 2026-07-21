"use client";

import * as React from "react";
import {
  Flame, Ear, Utensils, ShieldAlert, TrendingDown, ArrowRightLeft, Beef,
  HeartPulse, Syringe, AlertTriangle, Shield, Apple, Plus, Search, Clock,
  Sparkles, Stethoscope, Pencil, Trash2, Save, X, BookMarked, User,
  Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { TREATMENT_TEMPLATES, TEMPLATE_CATEGORY_META, type TreatmentTemplate } from "@/lib/treatment-templates";
import type { ConsultationType, CustomTemplate } from "@/lib/types";
import {
  useCustomTemplates, useCreateCustomTemplate, useUpdateCustomTemplate, useDeleteCustomTemplate,
} from "@/lib/hooks";
import { toast } from "sonner";

const ICON_MAP: Record<string, React.ElementType> = {
  Flame, Ear, Utensils, ShieldAlert, TrendingDown, ArrowRightLeft, Beef,
  HeartPulse, Syringe, AlertTriangle, Shield, Apple, Stethoscope,
};

const ICON_OPTIONS = ["Stethoscope", "Flame", "Ear", "Utensils", "ShieldAlert", "TrendingDown", "ArrowRightLeft", "Beef", "HeartPulse", "Syringe", "AlertTriangle", "Shield", "Apple"];
const CATEGORY_OPTIONS: Array<TreatmentTemplate["category"] | "custom"> = ["dermatology", "nutrition", "wellness", "emergency", "custom"];
const TYPE_OPTIONS: ConsultationType[] = ["appointment", "note", "diagnostic", "treatment"];

interface TreatmentTemplateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (template: TreatmentTemplate) => void;
}

export function TreatmentTemplateDialog({ open, onOpenChange, onApply }: TreatmentTemplateDialogProps) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<TreatmentTemplate["category"] | "all" | "custom">("all");
  const [showEditor, setShowEditor] = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState<CustomTemplate | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const { data: customTemplates, isLoading: loadingCustom } = useCustomTemplates();
  const createMut = useCreateCustomTemplate();
  const updateMut = useUpdateCustomTemplate();
  const deleteMut = useDeleteCustomTemplate();

  // Convert custom templates to the unified TreatmentTemplate shape
  const customAsUnified: TreatmentTemplate[] = React.useMemo(() => {
    return (customTemplates ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category as TreatmentTemplate["category"],
      description: c.description ?? "",
      icon: c.icon,
      type: c.type as ConsultationType,
      chiefComplaint: c.chiefComplaint ?? "",
      notes: c.notes,
      suggestedVas: c.suggestedVas ?? undefined,
      duration: c.duration ?? undefined,
      version: c.version,
      templateKey: c.templateKey ?? c.id,
      sections: c.sections ?? undefined,
    }));
  }, [customTemplates]);

  const allTemplates = React.useMemo(() => [...TREATMENT_TEMPLATES, ...customAsUnified], [customAsUnified]);

  const filtered = allTemplates.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.chiefComplaint.toLowerCase().includes(q) ||
      t.notes.toLowerCase().includes(q);
    const matchesFilter = filter === "all" || t.category === filter;
    return matchesSearch && matchesFilter;
  });

  // Group by category, with built-ins first then customs
  const grouped = filtered.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, TreatmentTemplate[]>);

  // Identify which templates are custom (for edit/delete actions)
  const customIds = new Set(customAsUnified.map((t) => t.id));

  function handleApply(template: TreatmentTemplate) {
    onApply(template);
    onOpenChange(false);
  }

  function handleEdit(custom: CustomTemplate) {
    setEditingTemplate(custom);
    setShowEditor(true);
  }

  function handleDelete(id: string) {
    deleteMut.mutate(id, {
      onSuccess: () => {
        toast.success("Template deleted");
        setDeleteId(null);
      },
      onError: () => toast.error("Failed to delete template"),
    });
  }

  function handleNew() {
    setEditingTemplate(null);
    setShowEditor(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-gradient-to-br from-primary/5 to-emerald-500/5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              Treatment Plan Templates
              {customAsUnified.length > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <BookMarked className="h-2.5 w-2.5" /> {customAsUnified.length} custom
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Apply a clinical protocol — fills type, complaint, full SOAP notes, and suggested VAS. Build your own custom templates for repeat cases.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Search + filter + create */}
        <div className="px-5 py-3 border-b space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates by name, complaint, or content..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={handleNew}>
              <Plus className="h-3.5 w-3.5" /> New Template
            </Button>
          </div>
          <div className="flex gap-1 flex-wrap">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
              All ({allTemplates.length})
            </FilterButton>
            {CATEGORY_OPTIONS.map((cat) => {
              const count = allTemplates.filter((t) => t.category === cat).length;
              if (count === 0 && cat === "custom") return null;
              const meta = TEMPLATE_CATEGORY_META[cat as TreatmentTemplate["category"]] ?? {
                label: "Custom",
                color: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
              };
              return (
                <FilterButton key={cat} active={filter === cat} onClick={() => setFilter(cat)} color={meta.color}>
                  {meta.label} ({count})
                </FilterButton>
              );
            })}
          </div>
        </div>

        {/* Template list */}
        <ScrollArea className="flex-1 max-h-[55vh] scrollbar-thin">
          <div className="p-4 space-y-4">
            {loadingCustom && (
              <div className="flex items-center justify-center py-4 gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading custom templates...
              </div>
            )}
            {Object.entries(grouped).length === 0 && !loadingCustom ? (
              <div className="text-center py-12">
                <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No templates match your search.</p>
              </div>
            ) : (
              Object.entries(grouped).map(([cat, templates]) => {
                const meta = TEMPLATE_CATEGORY_META[cat as TreatmentTemplate["category"]] ?? {
                  label: "Custom",
                  color: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
                };
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className={cn("text-[10px] font-semibold", meta.color)}>
                        {meta.label}
                      </Badge>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="space-y-2">
                      {templates.map((t) => {
                        const Icon = ICON_MAP[t.icon] ?? Sparkles;
                        const isCustom = customIds.has(t.id);
                        const customTemplate = customTemplates?.find((c) => c.id === t.id);
                        return (
                          <TemplateCard
                            key={t.id}
                            template={t}
                            Icon={Icon}
                            isCustom={isCustom}
                            onApply={() => handleApply(t)}
                            onEdit={customTemplate ? () => handleEdit(customTemplate) : undefined}
                            onDelete={isCustom ? () => setDeleteId(t.id) : undefined}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>

      <TemplateEditor
        open={showEditor}
        onOpenChange={setShowEditor}
        editing={editingTemplate}
        onSave={async (data) => {
          try {
            if (editingTemplate) {
              await updateMut.mutateAsync({ id: editingTemplate.id, data });
              toast.success("Template updated");
            } else {
              await createMut.mutateAsync(data);
              toast.success("Custom template created");
            }
            setShowEditor(false);
            setEditingTemplate(null);
          } catch {
            toast.error("Failed to save template");
          }
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete custom template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this template from your library. Built-in templates cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function TemplateCard({
  template, Icon, onApply, onEdit, onDelete, isCustom,
}: {
  template: TreatmentTemplate;
  Icon: React.ElementType;
  onApply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isCustom?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className={cn(
      "rounded-xl border bg-card hover:shadow-sm transition-shadow overflow-hidden group",
      isCustom && "border-primary/30",
    )}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 p-3 text-left"
      >
        <div className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
          isCustom ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary",
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{template.name}</span>
            {isCustom && (
              <Badge variant="outline" className="text-[9px] gap-0.5 border-primary/40 text-primary bg-primary/5">
                <User className="h-2.5 w-2.5" /> Custom
              </Badge>
            )}
            {template.suggestedVas != null && (
              <Badge variant="outline" className="text-[9px]">VAS {template.suggestedVas}</Badge>
            )}
            {template.duration && (
              <Badge variant="outline" className="text-[9px] gap-0.5">
                <Clock className="h-2.5 w-2.5" /> {template.duration}
              </Badge>
            )}
            <Badge variant="outline" className="text-[9px]">v{template.version ?? 1}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{template.description}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[9px] capitalize">{template.type}</Badge>
            <span className="text-[10px] text-muted-foreground truncate">{template.chiefComplaint}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/30">
          <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1 mt-2">SOAP Notes Preview</div>
          <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto scrollbar-thin">
            {template.notes}
          </pre>
          <div className="flex justify-end gap-1.5 mt-2">
            {isCustom && onEdit && (
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={onEdit}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            )}
            {isCustom && onDelete && (
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            )}
            <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={onApply}>
              <Plus className="h-3 w-3" /> Apply Template
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Template Editor (Create/Edit) ---
interface TemplateEditorProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CustomTemplate | null;
  onSave: (data: Record<string, unknown>) => void;
}

function TemplateEditor({ open, onOpenChange, editing, onSave }: TemplateEditorProps) {
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState<string>("custom");
  const [description, setDescription] = React.useState("");
  const [icon, setIcon] = React.useState("Stethoscope");
  const [type, setType] = React.useState<ConsultationType>("treatment");
  const [chiefComplaint, setChiefComplaint] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [suggestedVas, setSuggestedVas] = React.useState<string>("");
  const [duration, setDuration] = React.useState("");

  // Reset / prefill form when editing target changes
  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setCategory(editing.category);
      setDescription(editing.description ?? "");
      setIcon(editing.icon);
      setType(editing.type as ConsultationType);
      setChiefComplaint(editing.chiefComplaint ?? "");
      setNotes(editing.notes);
      setSuggestedVas(editing.suggestedVas != null ? String(editing.suggestedVas) : "");
      setDuration(editing.duration ?? "");
    } else {
      setName("");
      setCategory("custom");
      setDescription("");
      setIcon("Stethoscope");
      setType("treatment");
      setChiefComplaint("");
      setNotes("");
      setSuggestedVas("");
      setDuration("");
    }
  }, [open, editing]);

  function handleSave() {
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (!notes.trim()) {
      toast.error("SOAP notes are required");
      return;
    }
    onSave({
      name: name.trim(),
      category,
      description: description.trim() || null,
      icon,
      type,
      chiefComplaint: chiefComplaint.trim() || null,
      notes: notes.trim(),
      suggestedVas: suggestedVas ? Number(suggestedVas) : null,
      duration: duration.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookMarked className="h-4 w-4 text-primary" />
            {editing ? "Edit Custom Template" : "New Custom Template"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Build a reusable SOAP-format template for repeat cases. Apply it to any patient from the template library.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-3 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Template name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Post-Surgical Recheck" className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Description (short summary)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of when to use this template" className="h-9 text-sm" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as ConsultationType)}>
                  <SelectTrigger className="h-9 text-sm capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Icon</Label>
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((i) => {
                      const I = ICON_MAP[i] ?? Stethoscope;
                      return (
                        <SelectItem key={i} value={i}>
                          <span className="flex items-center gap-1.5"><I className="h-3.5 w-3.5" /> {i}</span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Suggested VAS (1-10)</Label>
                <Input type="number" min={1} max={10} value={suggestedVas} onChange={(e) => setSuggestedVas(e.target.value)} placeholder="optional" className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Chief complaint</Label>
                <Input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} placeholder="e.g. Post-op incision check" className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Duration / timeframe</Label>
                <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 30 min · 14 days" className="h-9 text-sm" />
              </div>
            </div>

            <div>
              <Label className="text-xs">SOAP Notes <span className="text-destructive">*</span></Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={"S: (subjective — owner's report)\nO: (objective — exam findings)\nA: (assessment — diagnosis)\nP: (plan — treatment, medications, recheck)"}
                rows={8}
                className="text-xs font-mono leading-relaxed"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Tip: Use S: / O: / A: / P: prefixes for clean SOAP structure.</p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="gap-1.5">
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> {editing ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterButton({
  active, onClick, children, color,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : color ?? "bg-muted/60 text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

// Helper to convert a TreatmentTemplate to consultation form data
export function templateToConsultationData(template: TreatmentTemplate) {
  return {
    type: template.type as ConsultationType,
    chiefComplaint: template.chiefComplaint,
    notes: template.notes,
    vasScore: template.suggestedVas ?? null,
  };
}
