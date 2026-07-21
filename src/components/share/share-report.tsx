"use client";

import {
  PawPrint, Stethoscope, Calendar, Scale, Activity, Beef, Droplet, Wheat,
  ClipboardCheck, ShieldCheck, Eye, Clock, AlertCircle, Printer, Download,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { PetWithRelations } from "@/lib/types";
import { calculateAge, bcsDescription, vasDescription, calculateRERMER } from "@/lib/nutrition";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ShareTokenMeta {
  id: string;
  expiresAt: string;
  viewCount: number;
  viewedAt: string | null;
  label: string | null;
}

interface ShareReportProps {
  pet: PetWithRelations;
  tokenMeta: ShareTokenMeta;
}

export function ShareReport({ pet, tokenMeta }: ShareReportProps) {
  const age = calculateAge(pet.birthDate);
  const bcsInfo = bcsDescription(pet.bcs);
  const calc = calculateRERMER(pet.currentWeight, pet.species, pet.lifeStage, pet.activityLevel, pet.neutered, pet.bcs, pet.targetWeight);
  const latestDiet = pet.dietPlans[0];
  const macros = latestDiet ? JSON.parse(latestDiet.macros || "{}") : {};
  const latestConsult = pet.consultations.at(-1);

  const weightTrend = pet.consultations
    .filter((c) => c.weight != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((c) => ({
      date: new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weight: c.weight,
    }));

  const vasTrend = [
    ...pet.consultations.filter((c) => c.vasScore != null),
    ...pet.photos.filter((p) => p.vasScore != null),
  ]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((x) => ({
      date: new Date(x.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      vas: x.vasScore,
    }));

  const expiresDate = new Date(tokenMeta.expiresAt);
  const daysLeft = Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-emerald-50/30 to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
      {/* Top banner — owner-facing notice */}
      <div className="bg-teal-600 text-white no-print">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Secure owner portal — shared by your veterinarian</span>
          </div>
          <div className="flex items-center gap-3 text-teal-50">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {daysLeft}d left
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" /> {tokenMeta.viewCount} view{tokenMeta.viewCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {/* Action toolbar (no-print) */}
      <div className="no-print bg-white dark:bg-slate-900 border-b">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => {
              toast.success("Opening print dialog...", { description: "Choose 'Save as PDF' as the destination." });
              setTimeout(() => window.print(), 300);
            }}
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => {
              toast.success("Opening print dialog for PDF...", { description: "Choose 'Save as PDF' as the destination." });
              setTimeout(() => window.print(), 300);
            }}
          >
            <Download className="h-3.5 w-3.5" /> Download PDF
          </Button>
        </div>
      </div>

      <div className="share-print-area max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header / brand */}
        <div className="flex items-start justify-between border-b-2 border-teal-600 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
              <PawPrint className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">VetDietDerm Clinic</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Veterinary Nutrition & Dermatology Consultation</p>
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
            <div className="font-semibold text-slate-700 dark:text-slate-300">Owner Report</div>
            <div>{new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</div>
          </div>
        </div>

        {/* Patient summary */}
        <section className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700 dark:text-teal-400 mb-2 flex items-center gap-1.5">
            <Stethoscope className="h-4 w-4" /> Patient Profile
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
            <Field label="Patient" value={pet.name} />
            <Field label="Owner" value={pet.ownerName || "—"} />
            <Field label="Species / Breed" value={`${pet.species === "dog" ? "Canine" : "Feline"} · ${pet.breed}`} />
            <Field label="Age" value={age.label} />
            <Field label="Sex / Neutered" value={`${pet.sex === "male" ? "Male" : "Female"} · ${pet.neutered ? "Neutered" : "Intact"}`} />
            <Field label="Body Weight" value={`${pet.currentWeight} kg`} />
            <Field label="BCS (1-9)" value={`${pet.bcs}/9 · ${bcsInfo.label}`} />
            <Field label="Life Stage" value={pet.lifeStage.replace("_", "/")} />
          </div>
        </section>

        {/* Clinical summary */}
        {latestConsult && (
          <section className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700 dark:text-teal-400 mb-2 flex items-center gap-1.5">
              <Activity className="h-4 w-4" /> Latest Clinical Summary
            </h2>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-sm">
              {latestConsult.chiefComplaint && (
                <p className="mb-2"><span className="font-semibold">Chief complaint: </span>{latestConsult.chiefComplaint}</p>
              )}
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{latestConsult.notes}</p>
              {latestConsult.vasScore != null && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Pruritus VAS at last visit: <span className="font-semibold">{latestConsult.vasScore}/10</span> ({vasDescription(latestConsult.vasScore).label})
                </p>
              )}
            </div>
          </section>
        )}

        {/* Progress charts */}
        {(weightTrend.length >= 2 || vasTrend.length >= 2) && (
          <section className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700 dark:text-teal-400 mb-2 flex items-center gap-1.5">
              <Calendar className="h-4 w-4" /> Progress Tracking
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {weightTrend.length >= 2 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Weight (kg)</div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weightTrend} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="oklch(0.6 0.02 175)" />
                        <YAxis tick={{ fontSize: 9 }} stroke="oklch(0.6 0.02 175)" domain={["dataMin - 1", "dataMax + 1"]} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                        <Line type="monotone" dataKey="weight" stroke="oklch(0.55 0.12 175)" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {vasTrend.length >= 2 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Pruritus VAS (1-10)</div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={vasTrend} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="oklch(0.6 0.02 175)" />
                        <YAxis tick={{ fontSize: 9 }} stroke="oklch(0.6 0.02 175)" domain={[0, 10]} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                        <Line type="monotone" dataKey="vas" stroke="oklch(0.6 0.22 16)" strokeWidth={2} dot={{ r: 3 }} />
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
            <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700 dark:text-teal-400 mb-2 flex items-center gap-1.5">
              <Scale className="h-4 w-4" /> Nutrition Plan
            </h2>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">{latestDiet.name}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">{latestDiet.type.replace("_", " ")}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <div><span className="text-slate-500 dark:text-slate-400">RER:</span> <span className="font-semibold">{Math.round(latestDiet.rer)} kcal/day</span></div>
                <div><span className="text-slate-500 dark:text-slate-400">MER (target):</span> <span className="font-semibold">{Math.round(latestDiet.mer)} kcal/day</span></div>
              </div>
              {macros.protein != null && (
                <div className="flex gap-4 mt-2 text-xs flex-wrap">
                  <span className="flex items-center gap-1"><Beef className="h-3 w-3 text-teal-600" /> Protein {macros.protein}% DM</span>
                  <span className="flex items-center gap-1"><Droplet className="h-3 w-3 text-amber-600" /> Fat {macros.fat}% DM</span>
                  <span className="flex items-center gap-1"><Wheat className="h-3 w-3 text-emerald-600" /> Carbs {macros.carbs}% DM</span>
                </div>
              )}
              {latestDiet.notes && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{latestDiet.notes}</p>}
              {calc.recommendations[0] && (
                <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">Calculated using {calc.weightStatus} MER factor. {calc.recommendations[0]}</div>
              )}
            </div>
          </section>
        )}

        {/* Consultation history (condensed) */}
        {pet.consultations.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700 dark:text-teal-400 mb-2 flex items-center gap-1.5">
              <Calendar className="h-4 w-4" /> Consultation History
            </h2>
            <div className="space-y-2">
              {[...pet.consultations].reverse().slice(0, 6).map((c) => (
                <div key={c.id} className="text-xs border-l-2 border-teal-300 pl-3 py-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">{c.type}</span>
                    <span className="text-slate-400 dark:text-slate-500">{new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                    {c.vasScore != null && <span className="text-slate-500 dark:text-slate-400">· VAS {c.vasScore}</span>}
                    {c.weight != null && <span className="text-slate-500 dark:text-slate-400">· {c.weight} kg</span>}
                  </div>
                  {c.chiefComplaint && <div className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">{c.chiefComplaint}</div>}
                  <p className="text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{c.notes}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="border-t-2 border-teal-600 pt-3 mt-8 text-[10px] text-slate-400 dark:text-slate-500">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span>Generated by VetDietDerm · {new Date().toLocaleString()}</span>
            <span className="flex items-center gap-1">
              <ClipboardCheck className="h-3 w-3" />
              This report is for the pet owner's reference. Always consult your veterinarian with concerns.
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-amber-700 dark:text-amber-500">
            <AlertCircle className="h-3 w-3" />
            <span>This secure link expires on {expiresDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} ({daysLeft} day{daysLeft === 1 ? "" : "s"} remaining). Do not share without the owner's consent.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">{label}</div>
      <div className="font-semibold text-slate-800 dark:text-slate-200 capitalize">{value}</div>
    </div>
  );
}
