"use client";

import * as React from "react";
import {
  Printer, FileText, X, PawPrint, Stethoscope, Calendar, Scale, Activity,
  Beef, Droplet, Wheat, ClipboardCheck,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HANDOUT_TEMPLATES, speciesLabelEn } from "@/lib/clinical-data";
import { calculateAge, bcsDescription, vasDescription, calculateRERMER } from "@/lib/nutrition";
import type { PetWithRelations } from "@/lib/types";
import { toast } from "sonner";

interface ReportViewProps {
  pet: PetWithRelations | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ReportView({ pet, open, onOpenChange }: ReportViewProps) {
  const [selectedHandouts, setSelectedHandouts] = React.useState<string[]>(["elimination-rules"]);
  const [handoutContents, setHandoutContents] = React.useState<Record<string, { title: string; content: string }>>({});
  const [loadingHandout, setLoadingHandout] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (pet && open) {
      // reset selection to defaults based on pet's conditions
      const defaults: string[] = [];
      if (pet.consultations.some((c) => c.notes.toLowerCase().includes("diet") || c.notes.toLowerCase().includes("allerg"))) {
        defaults.push("elimination-rules");
      }
      if (pet.bcs >= 6) defaults.push("food-transition");
      defaults.push("pruritus-diary");
      setSelectedHandouts(defaults.length > 0 ? Array.from(new Set(defaults)) : ["elimination-rules"]);
      setHandoutContents({});
    }
  }, [pet, open]);

  async function generateHandout(templateId: string) {
    if (!pet) return;
    if (handoutContents[templateId]) return;
    setLoadingHandout(templateId);
    try {
      const latestConsult = pet.consultations.at(-1);
      const res = await fetch("/api/ai/handout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          petName: pet.name,
          species: pet.species,
          context: latestConsult?.notes ?? pet.notes ?? "",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setHandoutContents((prev) => ({ ...prev, [templateId]: data }));
    } catch {
      toast.error("Failed to generate handout");
    } finally {
      setLoadingHandout(null);
    }
  }

  // Generate selected handouts sequentially (avoids API rate limits)
  React.useEffect(() => {
    if (!open || !pet) return;
    let cancelled = false;
    async function run() {
      for (const id of selectedHandouts) {
        if (cancelled) return;
        if (handoutContents[id]) continue;
        // small stagger to avoid 429
        await new Promise((r) => setTimeout(r, 600));
        if (!cancelled) await generateHandout(id);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [open, selectedHandouts.length]);

  if (!pet) return null;

  const age = calculateAge(pet.birthDate);
  const bcsInfo = bcsDescription(pet.bcs);
  const calc = calculateRERMER(pet.currentWeight, pet.species, pet.lifeStage, pet.activityLevel, pet.neutered, pet.bcs, pet.targetWeight);
  const latestDiet = pet.dietPlans[0];
  const macros = latestDiet ? JSON.parse(latestDiet.macros || "{}") : {};
  const latestConsult = pet.consultations.at(-1);

  // Weight trend
  const weightTrend = pet.consultations
    .filter((c) => c.weight != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((c) => ({
      date: new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weight: c.weight,
    }));

  // VAS trend
  const vasTrend = [
    ...pet.consultations.filter((c) => c.vasScore != null),
    ...pet.photos.filter((p) => p.vasScore != null),
  ]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((x) => ({
      date: new Date(x.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      vas: x.vasScore,
    }));

  const toggleHandout = (id: string) => {
    setSelectedHandouts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[92vh] p-0 gap-0 overflow-hidden">
        {/* Toolbar (no-print) */}
        <div className="no-print flex min-w-0 shrink-0 items-center justify-between gap-2 border-b bg-sidebar px-4 h-14">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold">Branded Consultation Report</span>
            <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">{pet.name}</Badge>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="gap-1">
              <X className="h-4 w-4" /> <span className="hidden sm:inline">Close</span>
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => {
              toast.success("Opening print dialog...", { description: "Choose 'Save as PDF' as the destination." });
              setTimeout(() => window.print(), 300);
            }}>
              <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Print / Save PDF</span><span className="sm:hidden">PDF</span>
            </Button>
          </div>
        </div>

        {/* Handout selector (no-print) */}
        <div className="no-print px-4 py-3 border-b bg-muted/30 shrink-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <ClipboardCheck className="h-3 w-3" /> Include Client Handouts (auto-generated)
          </div>
          <div className="flex flex-wrap gap-2">
            {HANDOUT_TEMPLATES.map((h) => (
              <label
                key={h.id}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 cursor-pointer text-xs transition-colors ${selectedHandouts.includes(h.id) ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
              >
                <Checkbox
                  checked={selectedHandouts.includes(h.id)}
                  onCheckedChange={() => toggleHandout(h.id)}
                />
                <span className="font-medium">{h.title}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Report print area */}
        <ScrollArea className="flex-1 scrollbar-thin">
          <div className="report-print-area bg-white text-slate-800 p-5 sm:p-8 lg:p-12 max-w-3xl mx-auto">
            {/* Header / brand */}
            <div className="flex flex-col gap-3 border-b-2 border-teal-600 pb-4 mb-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white">
                  <PawPrint className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">VetDietDerm Clinic</h1>
                  <p className="text-[11px] text-slate-500">Veterinary Nutrition & Dermatology Consultation</p>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 sm:text-right">
                <div className="font-semibold text-slate-700">Consultation Report</div>
                <div>{new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</div>
              </div>
            </div>

            {/* Patient summary */}
            <section className="mb-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700 mb-2 flex items-center gap-1.5">
                <Stethoscope className="h-4 w-4" /> Patient Profile
              </h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-slate-50 rounded-lg p-4">
                <ReportField label="Patient" value={pet.name} />
                <ReportField label="Owner" value={pet.ownerName || "—"} />
                <ReportField label="Species / Breed" value={`${speciesLabelEn(pet.species)} · ${pet.breed}`} />
                <ReportField label="Age" value={age.label} />
                <ReportField label="Sex / Neutered" value={`${pet.sex === "male" ? "Male" : "Female"} · ${pet.neutered ? "Neutered" : "Intact"}`} />
                <ReportField label="Body Weight" value={`${pet.currentWeight} kg`} />
                <ReportField label="BCS (1-9)" value={`${pet.bcs}/9 · ${bcsInfo.label}`} />
                <ReportField label="Life Stage" value={pet.lifeStage.replace("_", "/")} />
              </div>
            </section>

            {/* Clinical summary */}
            {latestConsult && (
              <section className="mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700 mb-2 flex items-center gap-1.5">
                  <Activity className="h-4 w-4" /> Latest Clinical Summary
                </h2>
                <div className="bg-slate-50 rounded-lg p-4 text-sm">
                  {latestConsult.chiefComplaint && (
                    <p className="mb-2"><span className="font-semibold">Chief complaint: </span>{latestConsult.chiefComplaint}</p>
                  )}
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{latestConsult.notes}</p>
                  {latestConsult.vasScore != null && (
                    <p className="mt-2 text-xs text-slate-500">
                      Pruritus VAS at last visit: <span className="font-semibold">{latestConsult.vasScore}/10</span> ({vasDescription(latestConsult.vasScore).label})
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Progress charts */}
            {(weightTrend.length >= 2 || vasTrend.length >= 2) && (
              <section className="mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700 mb-2 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" /> Progress Tracking
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  {weightTrend.length >= 2 && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-slate-600 mb-1">Weight (kg)</div>
                      <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={weightTrend} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                            <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" domain={["dataMin - 1", "dataMax + 1"]} />
                            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                            <Line type="monotone" dataKey="weight" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {vasTrend.length >= 2 && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-slate-600 mb-1">Pruritus VAS (1-10)</div>
                      <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={vasTrend} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                            <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" domain={[0, 10]} />
                            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                            <Line type="monotone" dataKey="vas" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Diet plan */}
            {latestDiet && (
              <section className="mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700 mb-2 flex items-center gap-1.5">
                  <Scale className="h-4 w-4" /> Nutrition Plan
                </h2>
                <div className="bg-slate-50 rounded-lg p-4 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">{latestDiet.name}</span>
                    <span className="text-xs text-slate-500 capitalize">{latestDiet.type.replace("_", " ")}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    <div><span className="text-slate-500">RER:</span> <span className="font-semibold">{Math.round(latestDiet.rer)} kcal/day</span></div>
                    <div><span className="text-slate-500">MER (target):</span> <span className="font-semibold">{Math.round(latestDiet.mer)} kcal/day</span></div>
                  </div>
                  {macros.protein != null && (
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="flex items-center gap-1"><Beef className="h-3 w-3 text-teal-600" /> Protein {macros.protein}% DM</span>
                      <span className="flex items-center gap-1"><Droplet className="h-3 w-3 text-amber-600" /> Fat {macros.fat}% DM</span>
                      <span className="flex items-center gap-1"><Wheat className="h-3 w-3 text-emerald-600" /> Carbs {macros.carbs}% DM</span>
                    </div>
                  )}
                  {latestDiet.notes && <p className="mt-2 text-xs text-slate-600 leading-relaxed">{latestDiet.notes}</p>}
                  <div className="mt-2 text-[10px] text-slate-400">Calculated using {calc.weightStatus} MER factor. {calc.recommendations[0]}</div>
                </div>
              </section>
            )}

            {/* Consultation history (condensed) */}
            {pet.consultations.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700 mb-2 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" /> Consultation History
                </h2>
                <div className="space-y-2">
                  {[...pet.consultations].reverse().slice(0, 6).map((c) => (
                    <div key={c.id} className="text-xs border-l-2 border-teal-300 pl-3 py-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700 capitalize">{c.type}</span>
                        <span className="text-slate-400">{new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                        {c.vasScore != null && <span className="text-slate-500">· VAS {c.vasScore}</span>}
                        {c.weight != null && <span className="text-slate-500">· {c.weight} kg</span>}
                      </div>
                      {c.chiefComplaint && <div className="font-medium text-slate-700 mt-0.5">{c.chiefComplaint}</div>}
                      <p className="text-slate-600 mt-0.5 line-clamp-2">{c.notes}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Handouts */}
            {selectedHandouts.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700 mb-2 flex items-center gap-1.5">
                  <ClipboardCheck className="h-4 w-4" /> Client Handouts
                </h2>
                <div className="space-y-4">
                  {selectedHandouts.map((id) => {
                    const tmpl = HANDOUT_TEMPLATES.find((h) => h.id === id);
                    const content = handoutContents[id];
                    return (
                      <div key={id} className="bg-slate-50 rounded-lg p-4 break-inside-avoid">
                        <h3 className="font-bold text-sm text-slate-800 border-b border-slate-200 pb-1 mb-2">
                          {tmpl?.title ?? id}
                        </h3>
                        {loadingHandout === id && !content ? (
                          <p className="text-xs text-slate-400 italic">Generating personalized handout...</p>
                        ) : content ? (
                          <div className="text-xs text-slate-700 leading-relaxed prose-sm max-w-none [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-2 [&_li]:ml-4 [&_li]:my-0.5 [&_strong]:text-slate-800 [&_table]:text-[10px] [&_th]:font-semibold [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_td]:border [&_td]:border-slate-200 [&_th]:border [&_th]:border-slate-200 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderMarkdown(content.content) }} />
                        ) : (
                          <p className="text-xs text-slate-400 italic">Content unavailable.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Footer */}
            <div className="border-t-2 border-teal-600 pt-3 mt-8 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Generated by VetDietDerm · {new Date().toLocaleString()}</span>
              <span>This report is for the pet owner's reference. Always consult your veterinarian with concerns.</span>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
      <div className="font-semibold text-slate-800 capitalize">{value}</div>
    </div>
  );
}

// Minimal markdown -> HTML (headings, bold, lists, tables, paragraphs)
function renderMarkdown(md: string): string {
  let html = md;
  // Escape HTML
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Tables
  html = html.replace(/^\|(.+)\|\n\|([-:\s|]+)\|\n((?:\|.+\|\n?)+)/gm, (_m, header, _sep, body) => {
    const heads = header.split("|").map((s: string) => s.trim()).filter(Boolean);
    const rows = body.trim().split("\n").map((r: string) =>
      r.split("|").map((c: string) => c.trim()).filter(Boolean)
    );
    return `<table><thead><tr>${heads.map((h: string) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r: string[]) => `<tr>${r.map((c: string) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  });
  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Bullet lists
  html = html.replace(/^[\s]*[-*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  // Paragraphs (lines not already wrapped)
  html = html.split(/\n\n+/).map((block) => {
    if (/^\s*<(h2|h3|ul|ol|table|li)/.test(block)) return block;
    return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");
  return html;
}
