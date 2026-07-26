"use client";

import * as React from "react";
import { useState } from "react";
import {
  BookOpen, ClipboardCheck, ShieldAlert, FlaskConical, Pill, ArrowRightLeft,
  NotebookPen, Search, Loader2, FileText, Download, Check, ChevronRight,
  Leaf, Wind, Apple, AlertTriangle, Lightbulb, Wand2, Plus, Pencil,
  Trash2, Save, X, BookMarked, User, Sparkles, FilePlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ALLERGENS, ELIMINATION_PROTOCOL_STEPS, HANDOUT_TEMPLATES, NOVEL_PROTEINS } from "@/lib/clinical-data";
import type { Allergen } from "@/lib/types";
import { EliminationWizard } from "@/components/knowledge/elimination-wizard";
import {
  useCustomHandouts, useCreateCustomHandout, useUpdateCustomHandout, useDeleteCustomHandout,
  type CustomHandoutInfo,
} from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

const CATEGORY_META: Record<Allergen["category"], { label: string; icon: React.ElementType; color: string }> = {
  environmental: { label: "Environmental", icon: Wind, color: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  food: { label: "Food", icon: Apple, color: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  cross_reactive: { label: "Cross-Reactive", icon: AlertTriangle, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

const HANDOUT_ICONS: Record<string, React.ElementType> = {
  ClipboardCheck, ArrowRightLeft, NotebookPen, Pill, ShieldAlert, FlaskConical,
};

export function KnowledgeModule() {
  const { t } = useI18n();
  return (
    <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary mb-1">
          <BookOpen className="h-3.5 w-3.5" />
          {t("knowledge.eyebrow")}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("knowledge.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          {t("knowledge.description")}
        </p>
      </div>

      <Tabs defaultValue="elimination">
        <div className="w-full min-w-0 overflow-x-auto scrollbar-thin">
        <TabsList className="flex h-10 w-max min-w-full max-w-3xl [&>*]:shrink-0 lg:grid lg:w-full lg:grid-cols-4">
          <TabsTrigger value="elimination" className="text-xs sm:text-sm gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" /> {t("knowledge.protocol")}
          </TabsTrigger>
          <TabsTrigger value="wizard" className="text-xs sm:text-sm gap-1.5">
            <Wand2 className="h-3.5 w-3.5" /> {t("knowledge.wizard")}
          </TabsTrigger>
          <TabsTrigger value="allergens" className="text-xs sm:text-sm gap-1.5">
            <Leaf className="h-3.5 w-3.5" /> {t("knowledge.allergens")}
          </TabsTrigger>
          <TabsTrigger value="handouts" className="text-xs sm:text-sm gap-1.5">
            <FileText className="h-3.5 w-3.5" /> {t("knowledge.handouts")}
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="elimination" className="mt-4">
          <EliminationProtocol />
        </TabsContent>
        <TabsContent value="wizard" className="mt-4">
          <EliminationWizard />
        </TabsContent>
        <TabsContent value="allergens" className="mt-4">
          <AllergenDirectory />
        </TabsContent>
        <TabsContent value="handouts" className="mt-4">
          <HandoutBuilder />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Elimination Diet Protocol ───────────────────────────────────
function EliminationProtocol() {
  const [completed, setCompleted] = useState<Set<string>>(new Set(["step-1"]));

  function toggle(id: string) {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const progress = Math.round((completed.size / ELIMINATION_PROTOCOL_STEPS.length) * 100);

  // Group by phase
  const phases = ELIMINATION_PROTOCOL_STEPS.reduce((acc, step) => {
    if (!acc[step.phase]) acc[step.phase] = [];
    acc[step.phase].push(step);
    return acc;
  }, {} as Record<string, typeof ELIMINATION_PROTOCOL_STEPS>);

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" /> Food Allergy Elimination Trial
              </CardTitle>
              <CardDescription className="text-xs">Interactive 7-step protocol with checklist & timeline logging</CardDescription>
            </div>
            <Badge variant="secondary" className="tabular-nums">{completed.size}/{ELIMINATION_PROTOCOL_STEPS.length}</Badge>
          </div>
          <Progress value={progress} className="h-1.5 mt-2" />
        </CardHeader>
        <CardContent className="space-y-5">
          {Object.entries(phases).map(([phase, steps]) => (
            <div key={phase}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3" /> {phase} Phase
              </div>
              <div className="space-y-2">
                {steps.map((step) => {
                  const done = completed.has(step.id);
                  return (
                    <div
                      key={step.id}
                      className={`rounded-xl border p-3 transition-all ${done ? "border-emerald-500/30 bg-emerald-500/5" : "bg-card"}`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={done}
                          onCheckedChange={() => toggle(step.id)}
                          className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className={`font-semibold text-sm ${done ? "line-through text-muted-foreground" : ""}`}>
                              {step.title}
                            </h4>
                            <Badge variant="outline" className="text-[10px]">{step.duration}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sidebar: quick log + novel proteins */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" /> Quick Dietary Indiscretion Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QuickIndiscretionLog />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Safe Novel Proteins</CardTitle>
            <CardDescription className="text-xs">For elimination diet selection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {NOVEL_PROTEINS.map((p) => (
              <div key={p.protein} className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold">{p.protein}</span>
                  <p className="text-[10px] text-muted-foreground leading-tight">{p.notes}</p>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  {p.species.map((s) => (
                    <Badge key={s} variant="outline" className="text-[9px] capitalize px-1 py-0">{s[0]}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickIndiscretionLog() {
  const [entries, setEntries] = useState<{ date: string; item: string }[]>([]);
  const [item, setItem] = useState("");

  function add() {
    if (!item.trim()) return;
    setEntries((e) => [{ date: new Date().toLocaleDateString(), item: item.trim() }, ...e]);
    setItem("");
    toast.success("Indiscretion logged");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Input
          value={item}
          onChange={(e) => setItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="e.g. ate cat food"
          className="h-8 text-xs"
        />
        <Button size="sm" className="h-8 px-2" onClick={add}>Log</Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No indiscretions logged. Good compliance!</p>
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-amber-500/5 rounded px-2 py-1">
              <span>{e.item}</span>
              <span className="text-[10px] text-muted-foreground">{e.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Allergen Directory ──────────────────────────────────────────
function AllergenDirectory() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Allergen["category"]>("all");

  const filtered = ALLERGENS.filter((a) => {
    const q = search.toLowerCase();
    const matchesSearch =
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.crossReactive.some((c) => c.toLowerCase().includes(q)) ||
      a.safeAlternatives.some((s) => s.toLowerCase().includes(q));
    const matchesFilter = filter === "all" || a.category === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search allergens, cross-reactants, safe alternatives..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "environmental", "food", "cross_reactive"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  className="text-xs capitalize"
                  onClick={() => setFilter(f)}
                >
                  {f === "cross_reactive" ? "Cross-reactive" : f}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((a) => {
          const meta = CATEGORY_META[a.category];
          return (
            <Card key={a.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${meta.color}`}>
                    <meta.icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{a.name}</h3>
                      <Badge variant="outline" className="text-[9px]">{meta.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{a.description}</p>

                    {a.crossReactive.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-2.5 w-2.5" /> Cross-reacts with
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {a.crossReactive.map((c, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {a.safeAlternatives.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check className="h-2.5 w-2.5" /> Safe alternatives
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {a.safeAlternatives.map((s, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">No allergens match your search.</div>
      )}
    </div>
  );
}

// ─── Client Handout Builder ──────────────────────────────────────
const HANDOUT_CATEGORY_OPTIONS = ["general", "dermatology", "nutrition", "wellness", "behavioral"] as const;
const HANDOUT_CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  dermatology: "Dermatology",
  nutrition: "Nutrition",
  wellness: "Wellness",
  behavioral: "Behavioral",
};

function HandoutBuilder() {
  const [selected, setSelected] = useState<string | null>("elimination-rules");
  const [selectedIsCustom, setSelectedIsCustom] = useState(false);
  const [content, setContent] = useState<{ title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [petName, setPetName] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingHandout, setEditingHandout] = useState<CustomHandoutInfo | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: customHandouts } = useCustomHandouts();
  const createMut = useCreateCustomHandout();
  const updateMut = useUpdateCustomHandout();
  const deleteMut = useDeleteCustomHandout();

  async function generate(templateId: string, isCustom: boolean) {
    setSelected(templateId);
    setSelectedIsCustom(isCustom);
    setContent(null);
    setLoading(true);
    try {
      // For custom handouts, use the custom prompt as the templateId context
      const customHandout = isCustom ? customHandouts?.find((h) => h.id === templateId) : null;
      const res = await fetch("/api/ai/handout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: isCustom ? "custom" : templateId,
          petName: petName || "your pet",
          species: "dog",
          context: "",
          customPrompt: customHandout?.prompt,
          customTitle: customHandout?.title,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setContent(data);
      toast.success("Handout generated");
    } catch {
      toast.error("Failed to generate handout");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!content) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${content.title}</title>
    <style>
      body { font-family: Georgia, serif; max-width: 720px; margin: 2rem auto; padding: 1rem; line-height: 1.6; color: #1e293b; }
      h1 { color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 0.5rem; }
      h2 { color: #0f766e; margin-top: 1.5rem; }
      h3 { color: #115e59; }
      table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
      th, td { border: 1px solid #cbd5e1; padding: 0.4rem 0.7rem; text-align: left; font-size: 0.9rem; }
      th { background: #f1f5f9; }
      ul, ol { padding-left: 1.5rem; }
      .footer { margin-top: 2rem; padding-top: 0.5rem; border-top: 1px solid #cbd5e1; font-size: 0.75rem; color: #64748b; }
    </style></head><body>
    <h1>${content.title}</h1>
    ${renderMarkdown(content.content)}
    <div class="footer">Generated by VetDietDerm · ${new Date().toLocaleDateString()} · For owner reference only. Consult your veterinarian with questions.</div>
    </body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${content.title.replace(/\s+/g, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Handout downloaded");
  }

  function handleDelete(id: string) {
    deleteMut.mutate(id, {
      onSuccess: () => {
        toast.success("Custom handout deleted");
        setDeleteId(null);
        if (selected === id) {
          setSelected(null);
          setContent(null);
        }
      },
      onError: () => toast.error("Failed to delete"),
    });
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Template selection */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Choose a Handout</CardTitle>
            <CardDescription className="text-xs">2-click generation — AI personalizes each one</CardDescription>
          </div>
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => { setEditingHandout(null); setShowEditor(true); }}
          >
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            placeholder="Pet name (optional, for personalization)"
            value={petName}
            onChange={(e) => setPetName(e.target.value)}
            className="h-8 text-xs mb-2"
          />

          {/* Built-in templates */}
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 px-1">
            <BookOpen className="h-3 w-3" /> Built-in ({HANDOUT_TEMPLATES.length})
          </div>
          {HANDOUT_TEMPLATES.map((h) => {
            const Icon = HANDOUT_ICONS[h.icon] ?? FileText;
            const isActive = selected === h.id && !selectedIsCustom;
            return (
              <button
                key={h.id}
                onClick={() => generate(h.id, false)}
                className={cn(
                  "w-full text-left rounded-xl border p-3 transition-all",
                  isActive ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{h.title}</div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{h.description}</p>
                  </div>
                  {isActive && !loading && <Check className="h-4 w-4 text-primary shrink-0 mt-1" />}
                  {isActive && loading && <Loader2 className="h-4 w-4 text-primary shrink-0 mt-1 animate-spin" />}
                </div>
              </button>
            );
          })}

          {/* Custom templates */}
          {customHandouts && customHandouts.length > 0 && (
            <>
              <div className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 px-1 pt-2">
                <BookMarked className="h-3 w-3" /> Custom ({customHandouts.length})
              </div>
              {customHandouts.map((h) => {
                const Icon = HANDOUT_ICONS[h.icon] ?? FileText;
                const isActive = selected === h.id && selectedIsCustom;
                return (
                  <div
                    key={h.id}
                    className={cn(
                      "group rounded-xl border p-3 transition-all",
                      isActive ? "border-primary bg-primary/5" : "hover:bg-muted/50 border-primary/30",
                    )}
                  >
                    <button
                      onClick={() => generate(h.id, true)}
                      className="w-full text-left flex items-start gap-2.5"
                    >
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                        isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm">{h.title}</span>
                          <Badge variant="outline" className="text-[9px] gap-0.5 border-primary/40 text-primary bg-primary/5">
                            <User className="h-2.5 w-2.5" /> Custom
                          </Badge>
                        </div>
                        {h.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{h.description}</p>
                        )}
                      </div>
                      {isActive && !loading && <Check className="h-4 w-4 text-primary shrink-0 mt-1" />}
                      {isActive && loading && <Loader2 className="h-4 w-4 text-primary shrink-0 mt-1 animate-spin" />}
                    </button>
                    <div className="flex justify-end gap-1 mt-2 pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => { setEditingHandout(h); setShowEditor(true); }}
                      >
                        <Pencil className="h-2.5 w-2.5" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(h.id)}
                      >
                        <Trash2 className="h-2.5 w-2.5" /> Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {(!customHandouts || customHandouts.length === 0) && (
            <div className="rounded-lg border border-dashed p-3 text-center">
              <FilePlus className="h-5 w-5 mx-auto text-muted-foreground/50 mb-1" />
              <p className="text-[11px] text-muted-foreground">
                No custom handouts yet. Click <span className="font-semibold">New</span> to create your own.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription className="text-xs">Print-ready · personalized for {petName || "your pet"}</CardDescription>
          </div>
          {content && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
                <FileText className="h-3.5 w-3.5" /> Print
              </Button>
              <Button size="sm" className="gap-1.5" onClick={download}>
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!selected ? (
            <div className="text-center py-16">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Select a handout template to generate a personalized client instruction sheet.</p>
            </div>
          ) : loading ? (
            <div className="text-center py-16">
              <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">AI is writing your personalized handout...</p>
            </div>
          ) : content ? (
            <div className="prose prose-sm max-w-none bg-white rounded-lg p-6 border">
              <h2 className="text-lg font-bold text-teal-700 border-b border-teal-200 pb-2 mb-3">{content.title}</h2>
              <div
                className="text-sm text-slate-700 leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-teal-800 [&_h2]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-teal-700 [&_h3]:mt-2 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:text-slate-900 [&_table]:my-2 [&_table]:text-xs [&_th]:bg-slate-100 [&_th]:p-1.5 [&_th]:font-semibold [&_th]:border [&_th]:border-slate-300 [&_td]:p-1.5 [&_td]:border [&_td]:border-slate-300"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content.content) }}
              />
              <Separator className="my-3" />
              <p className="text-[10px] text-muted-foreground">
                Generated by VetDietDerm · {new Date().toLocaleDateString()} · This handout is for the pet owner's reference. Always consult your veterinarian.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <HandoutEditor
        open={showEditor}
        onOpenChange={setShowEditor}
        editing={editingHandout}
        onSave={async (data) => {
          try {
            if (editingHandout) {
              await updateMut.mutateAsync({ id: editingHandout.id, data });
              toast.success("Handout updated");
            } else {
              await createMut.mutateAsync(data);
              toast.success("Custom handout created");
            }
            setShowEditor(false);
            setEditingHandout(null);
          } catch {
            toast.error("Failed to save handout");
          }
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete custom handout?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this handout template. Built-in handouts cannot be deleted.
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
    </div>
  );
}

// --- Handout Editor (Create/Edit) ---
interface HandoutEditorProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CustomHandoutInfo | null;
  onSave: (data: Record<string, unknown>) => void;
}

function HandoutEditor({ open, onOpenChange, editing, onSave }: HandoutEditorProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [icon, setIcon] = useState("FileText");

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setPrompt(editing.prompt);
      setCategory(editing.category);
      setIcon(editing.icon);
    } else {
      setTitle("");
      setDescription("");
      setPrompt("");
      setCategory("general");
      setIcon("FileText");
    }
  }, [open, editing]);

  function handleSave() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!prompt.trim()) {
      toast.error("AI prompt is required");
      return;
    }
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      prompt: prompt.trim(),
      category,
      icon,
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <BookMarked className="h-4 w-4 text-primary" />
            {editing ? "Edit Custom Handout" : "New Custom Handout"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            Create a reusable AI-generated handout template. Use <code className="text-[10px] bg-muted px-1 rounded">{`{{petName}}`}</code> and <code className="text-[10px] bg-muted px-1 rounded">{`{{species}}`}</code> placeholders for personalization.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-3 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Post-Dental Care Instructions" className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HANDOUT_CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{HANDOUT_CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Description (short summary)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description shown in the template list" className="h-9 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Icon</Label>
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(HANDOUT_ICONS).map((i) => {
                      const I = HANDOUT_ICONS[i] ?? FileText;
                      return (
                        <SelectItem key={i} value={i}>
                          <span className="flex items-center gap-1.5"><I className="h-3.5 w-3.5" /> {i}</span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="text-[10px] text-muted-foreground leading-tight">
                  The icon appears next to the handout title in the selection list.
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">AI Prompt <span className="text-destructive">*</span></Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={"Write a client handout about post-dental care for {{petName}} (a {{species}}). Include:\n- Feeding schedule for first 24 hours\n- Soft food recommendations\n- Medication administration tips\n- When to call the vet\n- Follow-up appointment reminder\n\nUse clear, friendly language. Format with markdown headings and bullet points."}
                rows={10}
                className="text-xs font-mono leading-relaxed"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                <Sparkles className="h-2.5 w-2.5 inline mr-1 text-primary" />
                The AI will use this prompt to generate a personalized handout. Placeholders are auto-replaced at generation time.
              </p>
            </div>
          </div>
        </ScrollArea>

        <AlertDialogFooter className="gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="gap-1.5">
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> {editing ? "Save Changes" : "Create Handout"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Minimal markdown renderer (shared with report-view)
function renderMarkdown(md: string): string {
  let html = md;
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/^\|(.+)\|\n\|([-:\s|]+)\|\n((?:\|.+\|\n?)+)/gm, (_m, header, _sep, body) => {
    const heads = header.split("|").map((s: string) => s.trim()).filter(Boolean);
    const rows = body.trim().split("\n").map((r: string) => r.split("|").map((c: string) => c.trim()).filter(Boolean));
    return `<table><thead><tr>${heads.map((h: string) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r: string[]) => `<tr>${r.map((c: string) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  });
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^[\s]*[-*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  html = html.split(/\n\n+/).map((block) => {
    if (/^\s*<(h2|h3|ul|ol|table|li)/.test(block)) return block;
    return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");
  return html;
}
