"use client";

import * as React from "react";
import {
  Mic, MicOff, Square, Loader2, Sparkles, Wand2, CheckCircle2, RotateCcw,
  Activity, Pill, Clock, Plus, Save, X, Timer, Zap, Thermometer, Scale,
  Heart, Stethoscope, ChevronRight, AlertTriangle,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAddConsultation, useUpdatePet } from "@/lib/hooks";
import type { PetWithRelations, ParsedNoteFields, ConsultationType } from "@/lib/types";
import { speciesAvatarClass } from "@/lib/clinical-data";
import { DrugInteractionChecker } from "@/components/crm/drug-interaction-checker";
import { toast } from "sonner";

interface LiveConsultModeProps {
  pet: PetWithRelations | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type QuickTab = "scribe" | "vitals" | "notes" | "safety";

const COMMON_SYMPTOMS = [
  "Pruritus", "Erythema", "Alopecia", "Otitis", "Paw licking", "Vomiting",
  "Diarrhea", "Lethargy", "Polyuria", "Polydipsia", "Anorexia", "Coughing",
];

const COMMON_FINDINGS = [
  { label: "Skin scrape negative", type: "diagnostic" as ConsultationType },
  { label: "Cytology: Malassezia", type: "diagnostic" as ConsultationType },
  { label: "CBC/chem submitted", type: "diagnostic" as ConsultationType },
  { label: "Weight measured", type: "appointment" as ConsultationType },
  { label: "Vaccines administered", type: "treatment" as ConsultationType },
  { label: "Diet trial compliance good", type: "note" as ConsultationType },
  { label: "Recheck scheduled", type: "appointment" as ConsultationType },
  { label: "Medication dispensed", type: "treatment" as ConsultationType },
];

export function LiveConsultMode({ pet, open, onOpenChange }: LiveConsultModeProps) {
  const [activeTab, setActiveTab] = React.useState<QuickTab>("scribe");
  const [elapsedSec, setElapsedSec] = React.useState(0);
  const [notesText, setNotesText] = React.useState("");
  const [chiefComplaint, setChiefComplaint] = React.useState("");
  const [consultType, setConsultType] = React.useState<ConsultationType>("appointment");
  const [vasScore, setVasScore] = React.useState<string>("");
  const [weight, setWeight] = React.useState<string>("");
  const [bcs, setBcs] = React.useState<string>("");
  const [selectedSymptoms, setSelectedSymptoms] = React.useState<Set<string>>(new Set());
  const [transcript, setTranscript] = React.useState("");
  const [parsed, setParsed] = React.useState<ParsedNoteFields | null>(null);

  // Voice recorder state
  const [recording, setRecording] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const [parsing, setParsing] = React.useState(false);
  const [audioLevel, setAudioLevel] = React.useState(0);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);

  const addConsultation = useAddConsultation();
  const updatePet = useUpdatePet();

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setElapsedSec(0);
      setNotesText("");
      setChiefComplaint("");
      setConsultType("appointment");
      setVasScore("");
      setWeight("");
      setBcs("");
      setSelectedSymptoms(new Set());
      setTranscript("");
      setParsed(null);
      setActiveTab("scribe");
    }
  }, [open, pet?.id]);

  // Cleanup audio on close
  React.useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setRecording(false);
    }
  }, [open]);

  // Elapsed timer
  React.useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  const elapsedDisplay = React.useMemo(() => {
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, [elapsedSec]);

  if (!pet) return null;

  function toggleSymptom(s: string) {
    setSelectedSymptoms((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function appendFinding(label: string, type: ConsultationType) {
    setNotesText((n) => {
      const prefix = n.trim() ? n.trim() + "\n" : "";
      return prefix + `• ${label}`;
    });
    setConsultType(type);
    toast.success(`Added: ${label}`);
  }

  // --- Voice recording handlers ---
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = handleStop;
      mr.start();

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!recording) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(Math.min(100, avg * 1.5));
        requestAnimationFrame(tick);
      };
      setRecording(true);
      tick();
    } catch {
      toast.error("Microphone access denied");
    }
  }

  async function stopRecording() {
    setRecording(false);
    setAudioLevel(0);
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  async function handleStop() {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    if (blob.size < 500) {
      toast.error("Recording too short");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setTranscribing(true);
      try {
        const res = await fetch("/api/ai/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64 }),
        });
        if (!res.ok) throw new Error("Transcription failed");
        const data = await res.json();
        setTranscript(data.text || "");
        toast.success("Transcription complete");
      } catch (e) {
        toast.error("Transcription failed");
      } finally {
        setTranscribing(false);
      }
    };
    reader.readAsDataURL(blob);
  }

  async function parseNotes() {
    if (!transcript.trim()) {
      toast.error("Nothing to parse");
      return;
    }
    setParsing(true);
    try {
      const res = await fetch("/api/ai/parse-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, petName: pet!.name }),
      });
      if (!res.ok) throw new Error("Parsing failed");
      const data: ParsedNoteFields = await res.json();
      setParsed(data);
      // Auto-apply to vitals
      if (data.weight != null) setWeight(String(data.weight));
      if (data.bcs != null) setBcs(String(data.bcs));
      if (data.vasScore != null) setVasScore(String(data.vasScore));
      if (data.chiefComplaint) setChiefComplaint(data.chiefComplaint);
      if (data.symptoms.length > 0) setSelectedSymptoms(new Set(data.symptoms));
      if (data.notes && !notesText) setNotesText(data.notes);
      toast.success("Notes parsed & fields pre-filled");
    } catch {
      toast.error("AI parsing failed");
    } finally {
      setParsing(false);
    }
  }

  async function endConsultation() {
    const w = weight ? Number(weight) : null;
    const v = vasScore ? Number(vasScore) : null;
    const b = bcs ? Number(bcs) : null;

    const soapParts: string[] = [];
    if (chiefComplaint) soapParts.push(`S: ${chiefComplaint}`);
    if (selectedSymptoms.size > 0) soapParts.push(`S: Symptoms: ${Array.from(selectedSymptoms).join(", ")}`);
    if (w != null) soapParts.push(`O: Weight ${w} kg`);
    if (b != null) soapParts.push(`O: BCS ${b}/9`);
    if (v != null) soapParts.push(`O: VAS ${v}/10`);
    if (notesText.trim()) soapParts.push(`A/P: ${notesText.trim()}`);
    if (transcript && !soapParts.length) soapParts.push(transcript);

    const finalNotes = soapParts.join("\n") || transcript || "Live consultation — see timeline.";

    try {
      await addConsultation.mutateAsync({
        petId: pet!.id,
        data: {
          date: new Date().toISOString(),
          type: consultType,
          chiefComplaint: chiefComplaint || null,
          notes: finalNotes,
          transcript: transcript || null,
          vasScore: v,
          weight: w,
        },
      });

      const updates: Record<string, unknown> = {};
      if (w != null) updates.currentWeight = w;
      if (b != null) updates.bcs = b;
      if (Object.keys(updates).length > 0) {
        await updatePet.mutateAsync({ id: pet!.id, data: updates });
      }

      toast.success(`Consultation saved · ${elapsedDisplay}`, {
        description: `Added to ${pet!.name}'s timeline. ${Object.keys(updates).length > 0 ? "Patient card updated." : ""}`,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to save consultation");
    }
  }

  const TABS: { id: QuickTab; label: string; icon: React.ElementType }[] = [
    { id: "scribe", label: "Voice Scribe", icon: Mic },
    { id: "vitals", label: "Vitals & Symptoms", icon: Activity },
    { id: "notes", label: "Notes & Findings", icon: Stethoscope },
    { id: "safety", label: "Drug Safety", icon: Pill },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        {/* Hero header with gradient + timer */}
        <div className="bg-gradient-to-br from-primary/15 via-emerald-500/5 to-transparent border-b px-5 py-4">
          <SheetHeader className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl shrink-0",
                  speciesAvatarClass(pet.species),
                )}>
                  <Stethoscope className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-base flex items-center gap-2 flex-wrap">
                    Live Consultation
                    <Badge variant="outline" className="text-[10px] gap-1 font-normal border-emerald-400/60 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> ACTIVE
                    </Badge>
                  </SheetTitle>
                  <SheetDescription className="text-xs">
                    {pet.name} · {pet.breed} · {pet.ownerName}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 rounded-lg bg-background/80 px-2.5 py-1.5 border">
                <Timer className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold tabular-nums">{elapsedDisplay}</span>
              </div>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 pt-2 -mb-1 overflow-x-auto scrollbar-thin">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" /> {tab.label}
                  </button>
                );
              })}
            </div>
          </SheetHeader>
        </div>

        {/* Body */}
        <ScrollArea className="flex-1 scrollbar-thin">
          <div className="p-5 space-y-4">
            {activeTab === "scribe" && (
              <div className="space-y-3 animate-fade-in-up">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <Mic className="h-4 w-4 text-primary" /> Hands-Free Voice Scribe
                  </h3>
                  {recording && (
                    <Badge variant="destructive" className="gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse-rec" /> REC
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!recording ? (
                    <Button onClick={startRecording} className="gap-2" size="default">
                      <Mic className="h-4 w-4" /> Start Recording
                    </Button>
                  ) : (
                    <Button onClick={stopRecording} variant="destructive" className="gap-2">
                      <Square className="h-4 w-4" /> Stop & Transcribe
                    </Button>
                  )}
                  {transcribing && (
                    <Badge variant="secondary" className="gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" /> Transcribing...
                    </Badge>
                  )}
                </div>

                {recording && (
                  <div className="flex items-center gap-3 rounded-lg bg-background/60 p-3 border">
                    <div className="flex items-end gap-0.5 h-10 flex-1">
                      {Array.from({ length: 40 }).map((_, i) => (
                        <div
                          key={i}
                          className="wave-bar flex-1 bg-primary/70 rounded-full"
                          style={{
                            height: `${20 + (audioLevel / 100) * 80}%`,
                            animationDelay: `${i * 0.03}s`,
                            animationDuration: `${0.5 + (i % 5) * 0.1}s`,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">{Math.round(audioLevel)}%</span>
                  </div>
                )}

                {transcript && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Transcript</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setTranscript(""); setParsed(null); }}>
                          <RotateCcw className="h-3 w-3" /> Clear
                        </Button>
                        <Button variant="secondary" size="sm" className="h-7 text-xs gap-1" onClick={parseNotes} disabled={parsing}>
                          {parsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                          AI Auto-Fill
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      rows={5}
                      className="text-sm resize-none"
                    />
                  </div>
                )}

                {parsed && (
                  <Card className="border-emerald-300/60 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                        <CheckCircle2 className="h-4 w-4" /> Fields pre-filled — review other tabs
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <ParsedMetric label="Weight" value={parsed.weight != null ? `${parsed.weight} kg` : "—"} />
                        <ParsedMetric label="BCS" value={parsed.bcs != null ? `${parsed.bcs}/9` : "—"} />
                        <ParsedMetric label="VAS" value={parsed.vasScore != null ? `${parsed.vasScore}/10` : "—"} />
                        <ParsedMetric label="Symptoms" value={String(parsed.symptoms.length)} />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!transcript && !recording && (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <MicOff className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Press <span className="font-semibold">Start Recording</span> and speak naturally.
                      AI will transcribe and auto-fill the consultation fields across all tabs.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "vitals" && (
              <div className="space-y-4 animate-fade-in-up">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                    <Activity className="h-4 w-4 text-primary" /> Vital Signs
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs flex items-center gap-1"><Scale className="h-3 w-3" /> Weight (kg)</Label>
                      <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={String(pet.currentWeight)} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1"><Heart className="h-3 w-3" /> BCS (1-9)</Label>
                      <Input type="number" min={1} max={9} value={bcs} onChange={(e) => setBcs(e.target.value)} placeholder={String(pet.bcs)} className="h-9" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs flex items-center gap-1"><Thermometer className="h-3 w-3" /> Pruritus VAS (1-10)</Label>
                      <div className="flex gap-1 flex-wrap mt-1">
                        {Array.from({ length: 10 }).map((_, i) => {
                          const v = i + 1;
                          const isSel = vasScore === String(v);
                          const color = v <= 3 ? "bg-emerald-500" : v <= 6 ? "bg-amber-500" : "bg-rose-500";
                          return (
                            <button
                              key={v}
                              onClick={() => setVasScore(isSel ? "" : String(v))}
                              className={cn(
                                "h-9 w-9 rounded-lg text-xs font-bold transition-all",
                                isSel ? `${color} text-white shadow-sm scale-105` : "bg-muted/60 text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {v}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                    <Stethoscope className="h-4 w-4 text-primary" /> Symptoms / Findings
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_SYMPTOMS.map((s) => {
                      const sel = selectedSymptoms.has(s);
                      return (
                        <button
                          key={s}
                          onClick={() => toggleSymptom(s)}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium transition-all border",
                            sel
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-muted/40 text-muted-foreground border-border hover:bg-muted",
                          )}
                        >
                          {sel && "✓ "}{s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                    <Zap className="h-4 w-4 text-amber-500" /> Chief Complaint
                  </h3>
                  <Input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} placeholder="e.g. Recurrent paw licking" className="h-9 text-sm" />
                </div>
              </div>
            )}

            {activeTab === "notes" && (
              <div className="space-y-3 animate-fade-in-up">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                    <Stethoscope className="h-4 w-4 text-primary" /> Consultation Type
                  </h3>
                  <Select value={consultType} onValueChange={(v) => setConsultType(v as ConsultationType)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appointment">Appointment</SelectItem>
                      <SelectItem value="diagnostic">Diagnostic</SelectItem>
                      <SelectItem value="treatment">Treatment</SelectItem>
                      <SelectItem value="note">Note</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                    <Zap className="h-4 w-4 text-amber-500" /> Quick-Add Findings
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {COMMON_FINDINGS.map((f) => (
                      <button
                        key={f.label}
                        onClick={() => appendFinding(f.label, f.type)}
                        className="rounded-lg border border-border bg-muted/30 hover:bg-muted/60 p-2 text-left text-xs transition-all flex items-center gap-1.5 group"
                      >
                        <Plus className="h-3 w-3 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="truncate">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                    <Stethoscope className="h-4 w-4 text-primary" /> Clinical Notes (A/P)
                  </h3>
                  <Textarea
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    rows={8}
                    placeholder="Assessment & Plan notes. Quick-add buttons append here. Free-text edits welcome."
                    className="text-sm"
                  />
                </div>
              </div>
            )}

            {activeTab === "safety" && (
              <div className="space-y-3 animate-fade-in-up">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Pill className="h-4 w-4 text-primary" /> Prescription Safety Check
                </h3>
                <p className="text-xs text-muted-foreground">
                  Type or paste prescription text. The checker scans for 18+ common veterinary drugs and flags interactions in real-time.
                </p>
                <DrugInteractionChecker compact />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer with summary + end consult */}
        <SheetFooter className="border-t bg-muted/30 p-3 flex-row items-center justify-between gap-2">
          <div className="flex gap-2 flex-wrap text-[10px]">
            {weight && <Badge variant="outline" className="bg-background">Weight: {weight} kg</Badge>}
            {bcs && <Badge variant="outline" className="bg-background">BCS: {bcs}/9</Badge>}
            {vasScore && <Badge variant="outline" className="bg-background">VAS: {vasScore}/10</Badge>}
            {selectedSymptoms.size > 0 && <Badge variant="outline" className="bg-background">{selectedSymptoms.size} symptoms</Badge>}
            {notesText && <Badge variant="outline" className="bg-background">{notesText.length} chars</Badge>}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="gap-1.5">
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={endConsultation} disabled={addConsultation.isPending} className="gap-1.5">
              {addConsultation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              End & Save ({elapsedDisplay})
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ParsedMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
