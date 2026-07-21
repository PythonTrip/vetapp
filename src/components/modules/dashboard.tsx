"use client";
// Dashboard module with overview and analytics tabs
import * as React from "react";
import {
  PawPrint,
  Users,
  Activity,
  Stethoscope,
  Mic,
  FileText,
  ArrowRight,
  Calendar,
  Scale,
  BarChart3,
  LayoutDashboard,
  Download,
  DatabaseBackup,
  Loader2,
} from "lucide-react";
import { usePets } from "@/lib/hooks";
import { speciesAvatarClass } from "@/lib/clinical-data";
import { useAppStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { calculateAge, bcsDescription, vasDescription } from "@/lib/nutrition";
import { AnalyticsPanel } from "@/components/modules/analytics";
import { ComparisonPanel } from "@/components/modules/comparison";
import { exportPatientsCSV } from "@/lib/export-utils";
import { AppointmentScheduler } from "@/components/appointment-scheduler";
import { GitCompare } from "lucide-react";
import { toast } from "sonner";
import { ClinicalInsights } from "@/components/dashboard/clinical-insights";

export function DashboardModule() {
  const { data: pets, isLoading } = usePets();
  const { setActiveModule, setActivePetId } = useAppStore();
  const [tab, setTab] = React.useState<"overview" | "analytics" | "compare">("overview");
  const [backingUp, setBackingUp] = React.useState(false);

  async function handleBackup() {
    setBackingUp(true);
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error("Backup failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vetdietderm-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const counts = data.meta.counts;
      toast.success("Backup downloaded", {
        description: `${counts.pets} pets · ${counts.consultations} consultations · ${counts.customTemplates} templates`,
      });
    } catch {
      toast.error("Failed to create backup");
    } finally {
      setBackingUp(false);
    }
  }

  const totalPets = pets?.length ?? 0;
  const avgVas =
    pets && pets.length > 0
      ? Math.round(
          (pets
            .map((p) => p.consultations.at(-1)?.vasScore)
            .filter((v): v is number => v != null)
            .reduce((a, b) => a + b, 0) /
            Math.max(1, pets.filter((p) => p.consultations.at(-1)?.vasScore != null).length)) *
            10
        ) / 10
      : 0;
  const overweight = pets?.filter((p) => p.bcs >= 6).length ?? 0;
  const totalConsults = pets?.reduce((sum, p) => sum + p.consultations.length, 0) ?? 0;

  // Recent consultations across all pets
  const recent = (pets ?? [])
    .flatMap((p) =>
      p.consultations.map((c) => ({
        ...c,
        petName: p.name,
        species: p.species,
        breed: p.breed,
      }))
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  const openPet = (id: string) => {
    setActivePetId(id);
    setActiveModule("crm");
  };

  return (
    <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary mb-1">
            <Stethoscope className="h-3.5 w-3.5" />
            Clinical Overview
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome back, Doctor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here's your practice at a glance. Start a hands-free consultation or review recent activity.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pets && pets.length > 0 && (
            <>
              <Button variant="outline" className="gap-2" onClick={handleBackup} disabled={backingUp} title="Download full JSON backup of all data">
                {backingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
                <span className="hidden sm:inline">Backup</span>
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => exportPatientsCSV(pets)} title="Export patients to CSV">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
            </>
          )}
          <Button onClick={() => setActiveModule("crm")} className="gap-2">
            <Mic className="h-4 w-4" />
            Start Consultation
          </Button>
        </div>
      </div>

      {/* View toggle */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "overview" | "analytics" | "compare")}>
        <TabsList className="grid w-full max-w-md grid-cols-3 h-9">
          <TabsTrigger value="overview" className="text-xs gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="compare" className="text-xs gap-1.5">
            <GitCompare className="h-3.5 w-3.5" /> Compare
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Active Patients"
          value={isLoading ? "—" : String(totalPets)}
          sub={`${overweight} need weight management`}
          tint="primary"
          loading={isLoading}
        />
        <StatCard
          icon={Activity}
          label="Avg. Pruritus (VAS)"
          value={isLoading ? "—" : avgVas.toFixed(1)}
          sub={`out of 10 · latest visits`}
          tint={avgVas > 5 ? "amber" : "emerald"}
          loading={isLoading}
        />
        <StatCard
          icon={Scale}
          label="Overweight / Obese"
          value={isLoading ? "—" : String(overweight)}
          sub={`${totalPets > 0 ? Math.round((overweight / totalPets) * 100) : 0}% of caseload`}
          tint="orange"
          loading={isLoading}
        />
        <StatCard
          icon={Calendar}
          label="Total Visits"
          value={isLoading ? "—" : String(totalConsults)}
          sub="consultation entries logged"
          tint="cyan"
          loading={isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Recent Consultation Activity</CardTitle>
              <CardDescription className="text-xs">Latest entries across all patients</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setActiveModule("crm")}>
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : recent.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No consultations yet.</div>
            ) : (
              recent.map((c) => {
                const vas = c.vasScore;
                const vasInfo = vas != null ? vasDescription(vas) : null;
                return (
                  <button
                    key={c.id}
                    onClick={() => openPet(c.petId)}
                    className="w-full flex items-start gap-3 rounded-xl border p-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <PawPrint className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{c.petName}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">{c.type}</Badge>
                        {vasInfo && (
                          <Badge variant="secondary" className={`text-[10px] ${vasInfo.color}`}>
                            VAS {vas} · {vasInfo.label}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {c.chiefComplaint || c.notes.slice(0, 120)}
                      </p>
                      <span className="text-[10px] text-muted-foreground/70 mt-1 block">
                        {new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Patient quick list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Patients</CardTitle>
            <CardDescription className="text-xs">Click to open full record</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : (
              pets?.map((p) => {
                const age = calculateAge(p.birthDate);
                const bcsInfo = bcsDescription(p.bcs);
                const lastVas = p.consultations.at(-1)?.vasScore;
                return (
                  <button
                    key={p.id}
                    onClick={() => openPet(p.id)}
                    className="w-full flex items-center gap-3 rounded-xl border p-2.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${speciesAvatarClass(p.species)}`}>
                      <PawPrint className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm truncate">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground capitalize">{age.label}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {p.breed} · {p.currentWeight} kg
                      </div>
                      <div className="flex gap-1 mt-1">
                        <Badge variant="secondary" className={`text-[9px] ${bcsInfo.color}`}>
                          BCS {p.bcs} · {bcsInfo.label}
                        </Badge>
                        {lastVas != null && (
                          <Badge variant="outline" className="text-[9px]">VAS {lastVas}</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Appointment Scheduler */}
        <AppointmentScheduler />
      </div>

      {/* Quick actions / value prop */}
      <div className="grid gap-4 md:grid-cols-3">
        <QuickAction
          icon={Mic}
          title="AI Voice Scribe"
          desc="Record live consultations. We transcribe and auto-fill the patient card — no more typing mid-visit."
          action="Open Patients"
          onClick={() => setActiveModule("crm")}
        />
        <QuickAction
          icon={Scale}
          title="Nutrition Calculators"
          desc="RER/MER, Dry Matter converter, and a flexible home-cooked / BARF diet template builder."
          action="Open Tools"
          onClick={() => setActiveModule("nutrition")}
        />
        <QuickAction
          icon={FileText}
          title="One-Click PDF Report"
          desc="Aggregate notes, diet plan, progress charts, and handouts into a branded report for the owner."
          action="Build Report"
          onClick={() => {
            if (pets && pets.length > 0) {
              setActivePetId(pets[0].id);
              setActiveModule("crm");
            }
          }}
        />
      </div>

      {/* Clinical Insights panel */}
      <ClinicalInsights />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AnalyticsPanel />
        </TabsContent>

        <TabsContent value="compare" className="mt-4">
          <ComparisonPanel />
        </TabsContent>
      </Tabs>

    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tint,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  tint: "primary" | "emerald" | "amber" | "orange" | "cyan";
  loading?: boolean;
}) {
  const tints: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  };
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tints[tint]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 text-2xl sm:text-3xl font-bold tabular-nums">
          {loading ? <Skeleton className="h-8 w-16" /> : value}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function QuickAction({
  icon: Icon,
  title,
  desc,
  action,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <Card className="group cursor-pointer hover:shadow-md transition-shadow" >
      <CardContent className="p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground mb-3">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
        <Button variant="ghost" size="sm" className="mt-3 -ml-2 gap-1 text-xs text-primary group-hover:gap-2 transition-all" onClick={onClick}>
          {action} <ArrowRight className="h-3 w-3" />
        </Button>
      </CardContent>
    </Card>
  );
}
