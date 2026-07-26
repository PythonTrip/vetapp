"use client";

import * as React from "react";
import {
  CalendarDays, Clock, Plus, Trash2, Video, Stethoscope, Syringe,
  ChevronRight, CheckCircle2, CalendarX, PawPrint,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAppointments, useCreateAppointment, useUpdateAppointment, useDeleteAppointment, usePets,
} from "@/lib/hooks";
import { useAppNavigation } from "@/lib/navigation";
import { speciesAvatarClass } from "@/lib/clinical-data";
import type { AppointmentWithPet } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const APPT_TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  consultation: { label: "Consultation", icon: Stethoscope, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/10" },
  recheck: { label: "Recheck", icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  procedure: { label: "Procedure", icon: Syringe, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  telemedicine: { label: "Telemedicine", icon: Video, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10" },
};

function relativeDay(date: Date): { label: string; sub: string; isToday: boolean; isTomorrow: boolean } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return { label: "Today", sub: time, isToday: true, isTomorrow: false };
  if (diffDays === 1) return { label: "Tomorrow", sub: time, isToday: false, isTomorrow: true };
  if (diffDays > 0 && diffDays < 7) {
    return {
      label: date.toLocaleDateString(undefined, { weekday: "long" }),
      sub: `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${time}`,
      isToday: false, isTomorrow: false,
    };
  }
  return {
    label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    sub: `${date.toLocaleDateString(undefined, { weekday: "short" })} · ${time}`,
    isToday: false, isTomorrow: false,
  };
}

export function AppointmentScheduler() {
  const { data: appointments, isLoading } = useAppointments();
  const { openProject } = useAppNavigation();
  const [showForm, setShowForm] = React.useState(false);

  const now = new Date();
  // Upcoming = scheduled + date >= now
  const upcoming = (appointments ?? [])
    .filter((a) => a.status === "scheduled" && new Date(a.date) >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Group by day
  const grouped = upcoming.reduce((acc, appt) => {
    const d = new Date(appt.date);
    const key = d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    if (!acc[key]) acc[key] = [];
    acc[key].push(appt);
    return acc;
  }, {} as Record<string, AppointmentWithPet[]>);

  const nextAppt = upcoming[0];
  const daysUntilNext = nextAppt
    ? Math.ceil((new Date(nextAppt.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const openPet = (petId: string) => {
    openProject(petId);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Upcoming Appointments
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {upcoming.length} scheduled
            {nextAppt && (
              <span className="ml-1">
                · next in <span className="font-semibold text-foreground">{daysUntilNext === 0 ? "today" : `${daysUntilNext} day${daysUntilNext !== 1 ? "s" : ""}`}</span>
              </span>
            )}
          </CardDescription>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5" /> Schedule
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="text-center py-8">
            <CalendarX className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> Schedule one
            </Button>
          </div>
        ) : (
          <div className="space-y-4 max-h-[480px] overflow-y-auto scrollbar-thin pr-1">
            {Object.entries(grouped).map(([day, appts]) => (
              <div key={day}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 sticky top-0 bg-card/80 backdrop-blur py-1">
                  {day}
                </div>
                <div className="space-y-2">
                  {appts.map((appt) => {
                    const meta = APPT_TYPE_META[appt.type] ?? APPT_TYPE_META.consultation;
                    const rel = relativeDay(new Date(appt.date));
                    return (
                      <AppointmentCard
                        key={appt.id}
                        appt={appt}
                        meta={meta}
                        rel={rel}
                        onOpenPet={() => openPet(appt.petId)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AppointmentFormDialog open={showForm} onOpenChange={setShowForm} />
    </Card>
  );
}

function AppointmentCard({
  appt, meta, rel, onOpenPet,
}: {
  appt: AppointmentWithPet;
  meta: { label: string; icon: React.ElementType; color: string; bg: string };
  rel: { label: string; sub: string; isToday: boolean; isTomorrow: boolean };
  onOpenPet: () => void;
}) {
  const delMut = useDeleteAppointment();
  const updMut = useUpdateAppointment();
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-all hover:shadow-sm group",
        rel.isToday && "border-teal-500/40 bg-teal-500/5",
        rel.isTomorrow && "border-violet-500/30 bg-violet-500/5"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Time block */}
        <div className={cn("flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 shrink-0", meta.bg)}>
          <span className={cn("text-[10px] font-bold uppercase", meta.color)}>{rel.label}</span>
          <span className="text-xs font-semibold tabular-nums mt-0.5">{rel.sub.split(" · ").pop()}</span>
        </div>

        {/* Content */}
        <button onClick={() => setExpanded((v) => !v)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <meta.icon className={cn("h-3.5 w-3.5 shrink-0", meta.color)} />
            <span className="font-semibold text-sm truncate">{appt.reason}</span>
            {rel.isToday && (
              <Badge className="text-[9px] bg-teal-500/15 text-teal-700 dark:text-teal-400 hover:bg-teal-500/20">Today</Badge>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenPet(); }}
            className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className={cn(
              "flex h-4 w-4 items-center justify-center rounded",
              speciesAvatarClass(appt.pet.species)
            )}>
              <PawPrint className="h-2.5 w-2.5" />
            </div>
            <span className="font-medium">{appt.pet.name}</span>
            <span className="text-muted-foreground/70">· {appt.pet.breed}</span>
            <ChevronRight className="h-3 w-3" />
          </button>
          {expanded && appt.notes && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed bg-muted/30 rounded p-2">{appt.notes}</p>
          )}
        </button>

        {/* Duration + actions */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="outline" className="text-[9px] gap-1">
            <Clock className="h-2.5 w-2.5" />
            {appt.duration}min
          </Badge>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-emerald-600 hover:text-emerald-700"
              title="Mark completed"
              onClick={() => updMut.mutate(
                { id: appt.id, data: { status: "completed" } },
                { onSuccess: () => toast.success("Marked completed") }
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              title="Delete"
              onClick={() => delMut.mutate(appt.id, {
                onSuccess: () => toast.success("Appointment cancelled"),
                onError: () => toast.error("Failed to cancel"),
              })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppointmentFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: pets } = usePets();
  const createMut = useCreateAppointment();

  const [petId, setPetId] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = React.useState("10:00");
  const [duration, setDuration] = React.useState("30");
  const [type, setType] = React.useState("consultation");
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setPetId(pets?.[0]?.id ?? "");
      setReason("");
      setNotes("");
    }
  }, [open, pets]);

  async function handleCreate() {
    if (!petId) { toast.error("Select a patient"); return; }
    if (!reason.trim()) { toast.error("Reason is required"); return; }
    const dt = new Date(`${date}T${time}`);
    try {
      await createMut.mutateAsync({
        petId,
        date: dt.toISOString(),
        duration: Number(duration),
        type,
        reason,
        notes: notes || null,
      });
      toast.success("Appointment scheduled");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to schedule");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Schedule Appointment
          </DialogTitle>
          <DialogDescription>Book a follow-up visit or procedure</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Patient *</Label>
            <Select value={petId} onValueChange={setPetId}>
              <SelectTrigger><SelectValue placeholder="Choose a patient..." /></SelectTrigger>
              <SelectContent>
                {pets?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.breed}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Duration (min)</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                  <SelectItem value="90">90 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="consultation">Consultation</SelectItem>
                <SelectItem value="recheck">Recheck</SelectItem>
                <SelectItem value="procedure">Procedure</SelectItem>
                <SelectItem value="telemedicine">Telemedicine</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2-week diet trial recheck" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Pre-appointment notes for the vet..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createMut.isPending} className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
