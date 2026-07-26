"use client";

import * as React from "react";
import {
  Mic, MicOff, Square, Loader2, Sparkles, Wand2, CheckCircle2, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAddConsultation, useUpdatePet } from "@/lib/hooks";
import type { PetWithRelations, ParsedNoteFields } from "@/lib/types";
import { toast } from "sonner";

interface VoiceScribeProps {
  pet: PetWithRelations;
  onSaved?: () => void;
}

export function VoiceScribe({ pet, onSaved }: VoiceScribeProps) {
  const [recording, setRecording] = React.useState(false);
  const [transcript, setTranscript] = React.useState("");
  const [transcribing, setTranscribing] = React.useState(false);
  const [parsing, setParsing] = React.useState(false);
  const [parsed, setParsed] = React.useState<ParsedNoteFields | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = React.useState(0);

  const addConsultation = useAddConsultation();
  const updatePet = useUpdatePet();

  // Clean up on unmount
  React.useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = handleStop;
      mr.start();

      // Audio level meter
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
    } catch (e) {
      toast.error("Microphone access denied. Please allow mic permissions and retry.");
      console.error(e);
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
      toast.error("Recording too short. Try speaking for at least 2 seconds.");
      return;
    }
    // Convert to base64
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
        toast.success("Transcription complete", {
          description: "Click 'AI Auto-Fill' to parse fields.",
        });
      } catch (e) {
        toast.error("Transcription failed", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
      } finally {
        setTranscribing(false);
      }
    };
    reader.readAsDataURL(blob);
  }

  async function parseNotes() {
    if (!transcript.trim()) {
      toast.error("Nothing to parse yet");
      return;
    }
    setParsing(true);
    try {
      const res = await fetch("/api/ai/parse-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, petName: pet.name }),
      });
      if (!res.ok) throw new Error("Parsing failed");
      const data: ParsedNoteFields = await res.json();
      setParsed(data);
      toast.success("Notes parsed", {
        description: `Extracted ${data.symptoms.length} symptoms, weight ${data.weight ?? "—"}.`,
      });
    } catch (e) {
      toast.error("AI parsing failed", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setParsing(false);
    }
  }

  async function saveToTimeline() {
    if (!parsed) return;
    try {
      // Save the consultation entry
      await addConsultation.mutateAsync({
        petId: pet.id,
        data: {
          date: new Date().toISOString(),
          type: "appointment",
          chiefComplaint: parsed.chiefComplaint,
          notes: parsed.notes,
          transcript: transcript,
          vasScore: parsed.vasScore,
          weight: parsed.weight,
        },
      });
      // Update pet metrics if extracted
      const updates: Record<string, unknown> = {};
      if (parsed.weight != null) updates.currentWeight = parsed.weight;
      if (parsed.bcs != null) updates.bcs = parsed.bcs;
      if (Object.keys(updates).length > 0) {
        await updatePet.mutateAsync({ id: pet.id, data: updates });
      }
      toast.success("Saved to consultation timeline", {
        description: "Patient card updated with extracted metrics.",
      });
      // Reset
      setTranscript("");
      setParsed(null);
      onSaved?.();
    } catch (e) {
      toast.error("Failed to save", { description: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  function reset() {
    setTranscript("");
    setParsed(null);
    setAudioLevel(0);
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-emerald-500/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Mic className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">AI Voice Scribe</h3>
              <p className="text-[11px] text-muted-foreground">Hands-free note capture during consultation</p>
            </div>
          </div>
          {recording && (
            <Badge variant="destructive" className="gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse-rec" />
              REC
            </Badge>
          )}
        </div>

        {/* Recording controls */}
        <div className="flex items-center gap-2">
          {!recording ? (
            <Button onClick={startRecording} className="gap-2" size="sm">
              <Mic className="h-4 w-4" /> Start Recording
            </Button>
          ) : (
            <Button onClick={stopRecording} variant="destructive" className="gap-2" size="sm">
              <Square className="h-4 w-4" /> Stop & Transcribe
            </Button>
          )}

          {transcribing && (
            <Badge variant="secondary" className="gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Transcribing audio...
            </Badge>
          )}
        </div>

        {/* Live waveform / level meter */}
        {recording && (
          <div className="flex items-center gap-3 rounded-lg bg-background/60 p-3">
            <div className="flex items-end gap-0.5 h-8 flex-1">
              {Array.from({ length: 32 }).map((_, i) => (
                <div
                  key={i}
                  className="wave-bar flex-1 bg-primary/70 rounded-full"
                  style={{
                    height: `${20 + (audioLevel / 100) * 80}%`,
                    animationDelay: `${i * 0.04}s`,
                    animationDuration: `${0.6 + (i % 5) * 0.1}s`,
                  }}
                />
              ))}
            </div>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">{Math.round(audioLevel)}%</span>
          </div>
        )}

        {/* Transcript */}
        {transcript && !parsed && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Transcript</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={reset}>
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
              rows={4}
              className="text-sm bg-background/70 resize-none"
              placeholder="Transcript will appear here. Edit if needed before parsing."
            />
            <p className="text-[10px] text-muted-foreground">
              <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
              Tip: Edit the transcript before parsing to correct any transcription errors.
            </p>
          </div>
        )}

        {/* Parsed result */}
        {parsed && (
          <div className="space-y-3 rounded-lg border bg-background/70 p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-semibold">AI-Parsed Patient Card</span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs gap-1" onClick={reset}>
                <RotateCcw className="h-3 w-3" /> Reset
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <ParsedMetric label="Weight" value={parsed.weight != null ? `${parsed.weight} kg` : "—"} />
              <ParsedMetric label="BCS" value={parsed.bcs != null ? `${parsed.bcs}/9` : "—"} />
              <ParsedMetric label="Pruritus (VAS)" value={parsed.vasScore != null ? `${parsed.vasScore}/10` : "—"} />
              <ParsedMetric label="Diet" value={parsed.diet ?? "—"} />
            </div>

            {parsed.chiefComplaint && (
              <div>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Chief Complaint</span>
                <p className="text-sm mt-0.5">{parsed.chiefComplaint}</p>
              </div>
            )}

            {parsed.symptoms.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Symptoms</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {parsed.symptoms.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
              </div>
            )}

            {parsed.diagnostics.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Diagnostics</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {parsed.diagnostics.map((d, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{d}</Badge>
                  ))}
                </div>
              </div>
            )}

            {parsed.treatment && (
              <div>
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Treatment</span>
                <p className="text-sm mt-0.5">{parsed.treatment}</p>
              </div>
            )}

            <div>
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Clinical Summary</span>
              <p className="text-sm mt-0.5 leading-relaxed">{parsed.notes}</p>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t">
              <Progress value={100} className="h-1" />
              <Button size="sm" className="gap-1.5 shrink-0" onClick={saveToTimeline} disabled={addConsultation.isPending || updatePet.isPending}>
                {addConsultation.isPending || updatePet.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Save to Timeline & Update Card
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              This saves a consultation entry and updates {pet.name}'s weight/BCS if extracted.
            </p>
          </div>
        )}

        {!transcript && !recording && (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <MicOff className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground">
              Press <span className="font-semibold">Start Recording</span> and speak naturally during the consultation.
              The system transcribes and AI extracts weight, symptoms, VAS, and more.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
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
