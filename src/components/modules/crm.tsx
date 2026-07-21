"use client";

import * as React from "react";
import {
  Plus, Search, PawPrint, Users, ArrowLeft, FileText, Pencil, Trash2,
  Calendar, Scale, Activity, Image as ImageIcon, ClipboardList, Stethoscope,
  Download, MessageSquare, Upload, Radio, Share2,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { usePets, useDeletePet } from "@/lib/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { exportConsultationsCSV } from "@/lib/export-utils";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { calculateAge, bcsDescription, vasDescription, calculateRERMER } from "@/lib/nutrition";
import { speciesLabel, speciesAvatarClass, splitOwnerContact } from "@/lib/clinical-data";
import type { PetWithRelations } from "@/lib/types";
import { PetForm } from "@/components/crm/pet-form";
import { VoiceScribe } from "@/components/crm/voice-scribe";
import { ConsultationTimeline } from "@/components/crm/consultation-timeline";
import { DermatologyGallery } from "@/components/crm/dermatology-gallery";
import { DietPlanPanel } from "@/components/crm/diet-plan-panel";
import { ReportView } from "@/components/crm/report-view";
import { WeightProjection } from "@/components/crm/weight-projection";
import { OwnerCommunicationLog } from "@/components/crm/owner-communication-log";
import { HealthSummary } from "@/components/crm/health-summary";
import { ClinicalAlerts } from "@/components/crm/clinical-alerts";
import { CsvImportDialog } from "@/components/crm/csv-import-dialog";
import { LiveConsultMode } from "@/components/crm/live-consult-mode";
import { DrugInteractionChecker } from "@/components/crm/drug-interaction-checker";
import { OwnerPortalDialog } from "@/components/crm/owner-portal-dialog";
import { ConsultationWorkspace } from "@/components/crm/consultation-workspace";
import { toast } from "sonner";

export function CrmModule() {
  const { data: pets, isLoading } = usePets();
  const deletePet = useDeletePet();
  const queryClient = useQueryClient();
  const { activePetId, setActivePetId } = useAppStore();
  const [search, setSearch] = React.useState("");
  const [showForm, setShowForm] = React.useState(false);
  const [editingPet, setEditingPet] = React.useState<PetWithRelations | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [showReport, setShowReport] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [showLiveConsult, setShowLiveConsult] = React.useState(false);
  const [showShare, setShowShare] = React.useState(false);

  const activePet = pets?.find((p) => p.id === activePetId) ?? null;

  const filtered = (pets ?? []).filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.breed.toLowerCase().includes(q) ||
      p.ownerName.toLowerCase().includes(q)
    );
  });

  function handleNew() {
    setEditingPet(null);
    setShowForm(true);
  }
  function handleEdit(p: PetWithRelations) {
    setEditingPet(p);
    setShowForm(true);
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Pet list panel */}
      <div className={`${activePet ? "hidden 2xl:flex" : "flex"} w-full lg:w-80 xl:w-96 min-h-0 flex-col border-r bg-sidebar/30`}>
        <div className="shrink-0 space-y-3 border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Patients
              </h2>
              <p className="text-xs text-muted-foreground">{pets?.length ?? 0} in your care</p>
            </div>
            <div className="flex items-center gap-1">
              {pets && pets.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => setShowImport(true)}
                    title="Import patients from CSV"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => exportConsultationsCSV(pets)}
                    title="Export consultations CSV"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button size="sm" className="gap-1.5" onClick={handleNew}>
                <Plus className="h-4 w-4" /> New
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, breed, owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-2 space-y-1.5">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <PawPrint className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No patients found.</p>
                <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={handleNew}>
                  <Plus className="h-4 w-4" /> Add first patient
                </Button>
              </div>
            ) : (
              filtered.map((p) => {
                const age = calculateAge(p.birthDate);
                const bcsInfo = bcsDescription(p.bcs);
                const lastVas = p.consultations.at(-1)?.vasScore;
                const isActive = p.id === activePetId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setActivePetId(p.id)}
                    className={`w-full text-left rounded-xl p-3 transition-all border ${isActive ? "border-primary bg-primary/5 shadow-sm" : "border-transparent hover:bg-muted/60"}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${speciesAvatarClass(p.species)}`}>
                        <PawPrint className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm truncate">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground">{age.label}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {p.breed} · {p.currentWeight} kg
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <Badge variant="secondary" className={`text-[9px] ${bcsInfo.color}`}>
                            BCS {p.bcs}
                          </Badge>
                          {lastVas != null && (
                            <Badge variant="outline" className={`text-[9px] ${vasDescription(lastVas).color}`}>
                              VAS {lastVas}
                            </Badge>
                          )}
                          {p.consultations.length > 0 && (
                            <Badge variant="outline" className="text-[9px]">{p.consultations.length} visits</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Pet detail panel */}
      {activePet ? (
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Detail header */}
          <div className="shrink-0 border-b bg-background px-4 sm:px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <Button variant="ghost" size="icon" className="2xl:hidden -ml-2 shrink-0" onClick={() => setActivePetId(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl shrink-0 ${speciesAvatarClass(activePet.species)}`}>
                  <PawPrint className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="min-w-0 max-w-full truncate text-xl font-bold">{activePet.name}</h1>
                    <Badge variant="outline" className="text-[10px]">{speciesLabel(activePet.species)}</Badge>
                    {activePet.neutered && <Badge variant="outline" className="text-[10px]">Neutered</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground break-words line-clamp-2 sm:truncate">
                    {activePet.breed} · {calculateAge(activePet.birthDate).label} · {activePet.ownerName}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleEdit(activePet)} title="Edit patient" aria-label="Edit patient">
                  <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Edit</span>
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteId(activePet.id)} title="Delete patient" aria-label="Delete patient">
                  <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Delete</span>
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-gradient-to-r from-primary to-emerald-600 hover:opacity-90"
                  onClick={() => setShowLiveConsult(true)}
                  title="Open Live Consultation Mode"
                >
                  <Radio className="h-3.5 w-3.5 animate-pulse" />
                  <span className="hidden sm:inline">Live Consult</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setShowShare(true)}
                  title="Generate shareable link for owner"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Share</span>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowReport(true)} title="Open clinical report" aria-label="Open clinical report">
                  <FileText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Report</span>
                </Button>
              </div>
            </div>
            {/* Quick stats */}
            <div className="flex gap-4 mt-3 flex-wrap text-xs">
              <QuickStat icon={Scale} label="Weight" value={`${activePet.currentWeight} kg`} sub={activePet.targetWeight ? `→ ${activePet.targetWeight} kg` : ""} />
              <QuickStat icon={Activity} label="BCS" value={`${activePet.bcs}/9`} sub={bcsDescription(activePet.bcs).label} tone={bcsDescription(activePet.bcs).color} />
              <QuickStat icon={Calendar} label="Visits" value={String(activePet.consultations.length)} sub="consultations" />
              <QuickStat icon={ImageIcon} label="Photos" value={String(activePet.photos.length)} sub="in gallery" />
              <QuickStat icon={ClipboardList} label="Diet plans" value={String(activePet.dietPlans.length)} sub="saved" />
            </div>
          </div>

          {/* Tabs */}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            <div className="p-4 sm:p-6">
              <Tabs defaultValue="visit" className="w-full">
                {/* На узких экранах вкладки прокручиваются по горизонтали, на широких — сетка */}
                <div className="w-full min-w-0 overflow-x-auto scrollbar-thin">
                  <TabsList className="flex h-9 w-max min-w-full max-w-4xl lg:grid lg:w-full lg:grid-cols-7">
                    <TabsTrigger value="visit" className="shrink-0 gap-1 text-xs font-semibold"><ClipboardList className="h-3.5 w-3.5" /> Приём</TabsTrigger>
                    <TabsTrigger value="profile" className="shrink-0 gap-1 text-xs"><Stethoscope className="h-3.5 w-3.5" /> Profile</TabsTrigger>
                    <TabsTrigger value="timeline" className="shrink-0 gap-1 text-xs"><Calendar className="h-3.5 w-3.5" /> Timeline</TabsTrigger>
                    <TabsTrigger value="gallery" className="shrink-0 gap-1 text-xs"><ImageIcon className="h-3.5 w-3.5" /> Gallery</TabsTrigger>
                    <TabsTrigger value="diet" className="shrink-0 gap-1 text-xs"><Scale className="h-3.5 w-3.5" /> Diet</TabsTrigger>
                    <TabsTrigger value="comms" className="shrink-0 gap-1 text-xs"><MessageSquare className="h-3.5 w-3.5" /> Comms</TabsTrigger>
                    <TabsTrigger value="scribe" className="shrink-0 gap-1 text-xs"><Activity className="h-3.5 w-3.5" /> Scribe</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="visit" className="mt-4">
                  <ConsultationWorkspace pet={activePet} onEditPet={() => handleEdit(activePet)} />
                </TabsContent>
                <TabsContent value="profile" className="mt-4">
                  <ProfileTab pet={activePet} />
                </TabsContent>
                <TabsContent value="timeline" className="mt-4">
                  <ConsultationTimeline pet={activePet} />
                </TabsContent>
                <TabsContent value="gallery" className="mt-4">
                  <DermatologyGallery pet={activePet} />
                </TabsContent>
                <TabsContent value="diet" className="mt-4">
                  <DietPlanPanel pet={activePet} />
                </TabsContent>
                <TabsContent value="comms" className="mt-4">
                  <OwnerCommunicationLog pet={activePet} />
                </TabsContent>
                <TabsContent value="scribe" className="mt-4">
                  <VoiceScribe pet={activePet} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center bg-muted/20">
          <div className="text-center max-w-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto mb-4">
              <PawPrint className="h-8 w-8" />
            </div>
            <h3 className="font-semibold text-lg">Select a patient</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a patient from the list to view their full record, or create a new one to get started.
            </p>
            <Button className="mt-4 gap-1.5" onClick={handleNew}>
              <Plus className="h-4 w-4" /> New Patient
            </Button>
          </div>
        </div>
      )}

      <PetForm open={showForm} onOpenChange={setShowForm} pet={editingPet} />
      <ReportView pet={activePet} open={showReport} onOpenChange={setShowReport} />
      <CsvImportDialog open={showImport} onOpenChange={setShowImport} />
      <LiveConsultMode pet={activePet} open={showLiveConsult} onOpenChange={setShowLiveConsult} />
      <OwnerPortalDialog pet={activePet} open={showShare} onOpenChange={setShowShare} />

      <DeleteDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await deletePet.mutateAsync(deleteId);
            toast.success("Patient deleted");
            setActivePetId(null);
            setDeleteId(null);
            await queryClient.invalidateQueries({ queryKey: ["pets"] });
            await queryClient.invalidateQueries({ queryKey: ["appointments"] });
          } catch {
            toast.error("Failed to delete");
          }
        }}
        petName={activePet?.name}
      />
    </div>
  );
}

function QuickStat({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; tone?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
        <div className="flex items-baseline gap-1">
          <span className="font-bold text-sm tabular-nums">{value}</span>
          {sub && <span className={`text-[10px] ${tone ?? "text-muted-foreground"}`}>{sub}</span>}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ pet }: { pet: PetWithRelations }) {
  const age = calculateAge(pet.birthDate);
  const calc = calculateRERMER(pet.currentWeight, pet.species, pet.lifeStage, pet.activityLevel, pet.neutered, pet.bcs, pet.targetWeight);

  const weightTrend = pet.consultations
    .filter((c) => c.weight != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((c) => ({
      date: new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weight: c.weight,
    }));

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Clinical Decision Support Alerts — full width */}
      <div className="lg:col-span-2">
        <ClinicalAlerts pet={pet} />
      </div>

      {/* Health Summary with sparklines — full width */}
      <div className="lg:col-span-2">
        <HealthSummary pet={pet} />
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-primary" /> Patient Vitals
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="Species" value={speciesLabel(pet.species)} />
            <InfoRow label="Breed" value={pet.breed} />
            <InfoRow label="Age" value={age.label} />
            <InfoRow label="Sex" value={`${pet.sex === "male" ? "Male" : "Female"} · ${pet.neutered ? "Neutered" : "Intact"}`} />
            <InfoRow label="Date of Birth" value={new Date(pet.birthDate).toLocaleDateString()} />
            <InfoRow label="Owner" value={pet.ownerName || "—"} />
            <InfoRow label="Email" value={pet.ownerEmail || splitOwnerContact(pet.ownerContact).email || "—"} plain />
            <InfoRow label="Phone" value={pet.ownerPhone || splitOwnerContact(pet.ownerContact).phone || "—"} plain />
          </div>
          {pet.notes && (
            <div className="mt-3 pt-3 border-t">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Clinical Notes</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{pet.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" /> Nutritional Baseline
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="Current Weight" value={`${pet.currentWeight} kg`} />
            <InfoRow label="Target Weight" value={pet.targetWeight ? `${pet.targetWeight} kg` : "—"} />
            <InfoRow label="BCS (1-9)" value={`${pet.bcs}/9 · ${bcsDescription(pet.bcs).label}`} />
            <InfoRow label="Life Stage" value={pet.lifeStage.replace("_", "/")} />
            <InfoRow label="Activity" value={pet.activityLevel} />
            <InfoRow label="Status" value={calc.weightStatus} />
          </div>
          <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/50 p-2.5">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">RER</div>
              <div className="text-lg font-bold tabular-nums">{calc.rer}</div>
              <div className="text-[9px] text-muted-foreground">kcal/day</div>
            </div>
            <div className="rounded-lg bg-primary/10 p-2.5">
              <div className="text-[10px] uppercase font-semibold text-primary">MER</div>
              <div className="text-lg font-bold tabular-nums text-primary">{calc.mer}</div>
              <div className="text-[9px] text-muted-foreground">kcal/day target</div>
            </div>
          </div>
          {calc.recommendations.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
              💡 {calc.recommendations[0]}
            </div>
          )}
        </CardContent>
      </Card>

      {weightTrend.length >= 2 && (
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Weight Trend
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightTrend} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" domain={["dataMin - 1", "dataMax + 1"]} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }} formatter={(v: number) => [`${v} kg`, "Weight"]} />
                  {pet.targetWeight && (
                    <Line type="monotone" dataKey={() => pet.targetWeight} stroke="oklch(0.7 0.15 145)" strokeDasharray="4 4" dot={false} name="Target" />
                  )}
                  <Line type="monotone" dataKey="weight" stroke="oklch(0.55 0.12 175)" strokeWidth={2.5} dot={{ fill: "oklch(0.55 0.12 175)", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weight Goal Projection */}
      <WeightProjection pet={pet} />

      {/* Drug Interaction Checker — full width */}
      <div className="lg:col-span-2">
        <DrugInteractionChecker initialText={pet.consultations.at(-1)?.notes ?? ""} compact />
      </div>
    </div>
  );
}

function InfoRow({ label, value, full, plain }: { label: string; value: string; full?: boolean; plain?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
      <div className={plain ? "font-medium break-words" : "font-medium capitalize"}>{value}</div>
    </div>
  );
}

function DeleteDialog({
  open, onOpenChange, onConfirm, petName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  petName?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete patient record?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{petName}</strong>'s record including all consultations, photos, and diet plans. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
