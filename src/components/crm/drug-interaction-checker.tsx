"use client";

import * as React from "react";
import {
  Pill, AlertTriangle, AlertCircle, XOctagon, Info, Loader2, Search,
  ShieldCheck, Sparkles, ChevronDown, ChevronRight, Activity,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { SEVERITY_META, type InteractionSeverity, type DetectedInteraction } from "@/lib/drug-interactions";
import { toast } from "sonner";

const SEVERITY_ICONS: Record<InteractionSeverity, React.ElementType> = {
  contraindicated: XOctagon,
  major: AlertTriangle,
  moderate: AlertCircle,
  minor: Info,
};

interface DrugInteractionCheckerProps {
  /** Optional initial text (e.g., from consultation notes) */
  initialText?: string;
  /** Compact mode for inline use within other components */
  compact?: boolean;
}

export function DrugInteractionChecker({ initialText = "", compact = false }: DrugInteractionCheckerProps) {
  const [text, setText] = React.useState(initialText);
  const [result, setResult] = React.useState<{ interactions: DetectedInteraction[]; summary: { total: number; contraindicated: number; major: number; moderate: number; minor: number } } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    if (initialText && initialText !== text) {
      setText(initialText);
    }
  }, [initialText]);

  async function check() {
    if (!text.trim()) {
      toast.error("Enter prescription text to check");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/drug-interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setResult(data);
      if (data.summary.total === 0) {
        toast.success("No interactions detected");
      } else {
        const s = data.summary;
        const parts: string[] = [];
        if (s.contraindicated) parts.push(`${s.contraindicated} contraindicated`);
        if (s.major) parts.push(`${s.major} major`);
        if (s.moderate) parts.push(`${s.moderate} moderate`);
        if (s.minor) parts.push(`${s.minor} minor`);
        toast.warning(`${s.total} interaction${s.total === 1 ? "" : "s"} found`, { description: parts.join(", ") });
      }
    } catch {
      toast.error("Failed to check interactions");
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setText("");
    setResult(null);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn(
        "border-2 overflow-hidden transition-all",
        result && result.summary.contraindicated > 0
          ? "border-rose-300 dark:border-rose-900/60"
          : result && result.summary.total > 0
          ? "border-amber-300 dark:border-amber-900/60"
          : "border-primary/20",
      )}>
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                result && result.summary.contraindicated > 0
                  ? "bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400"
                  : "bg-primary/15 text-primary",
              )}>
                <Pill className="h-5 w-5" />
              </div>
              <div className="text-left min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold">Drug Interaction Checker</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Patient safety
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {result
                    ? result.summary.total === 0
                      ? "No interactions detected — safe to prescribe"
                      : `${result.summary.total} interaction${result.summary.total === 1 ? "" : "s"} found`
                    : "Scan prescription text for drug-drug interactions"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {result && result.summary.total > 0 && (
                <div className="flex gap-1">
                  {result.summary.contraindicated > 0 && (
                    <Badge variant="outline" className="text-[9px] border-rose-400 text-rose-700 dark:border-rose-800 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50">
                      {result.summary.contraindicated} contraindicated
                    </Badge>
                  )}
                  {result.summary.major > 0 && (
                    <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-700 dark:border-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50">
                      {result.summary.major} major
                    </Badge>
                  )}
                  {result.summary.moderate > 0 && (
                    <Badge variant="outline" className="text-[9px] border-orange-400 text-orange-700 dark:border-orange-800 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50">
                      {result.summary.moderate} moderate
                    </Badge>
                  )}
                  {result.summary.minor > 0 && (
                    <Badge variant="outline" className="text-[9px] border-teal-400 text-teal-700 dark:border-teal-800 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50">
                      {result.summary.minor} minor
                    </Badge>
                  )}
                </div>
              )}
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 border-t bg-muted/10 space-y-3">
            <div className="space-y-2 pt-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  Prescription / Clinical Notes
                </label>
                <div className="flex gap-1.5">
                  {text && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clear}>
                      Clear
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-7 gap-1.5"
                    onClick={check}
                    disabled={loading || !text.trim()}
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Check Interactions
                  </Button>
                </div>
              </div>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste prescription text or clinical notes here. Example: 'Started on carprofen 75mg PO BID. Continue prednisolone 5mg PO daily for atopic flare.'"
                rows={compact ? 3 : 4}
                className="text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Scans for 18+ common veterinary drugs (NSAIDs, steroids, ACE inhibitors, azoles, anti-convulsants, etc.). For informational use only.
              </p>
            </div>

            {result && (
              <div className="space-y-2 animate-fade-in-up">
                {result.interactions.length === 0 ? (
                  <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 shrink-0">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">No interactions detected</div>
                      <div className="text-xs text-muted-foreground">No known drug interactions found in the provided text.</div>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className={cn(compact ? "max-h-72" : "max-h-96", "scrollbar-thin pr-2")}>
                    <div className="space-y-2">
                      {result.interactions.map((det, idx) => {
                        const Icon = SEVERITY_ICONS[det.interaction.severity];
                        const meta = SEVERITY_META[det.interaction.severity];
                        return (
                          <div
                            key={`${det.interaction.id}-${idx}`}
                            className={cn("rounded-lg border p-3 animate-fade-in-up", meta.bg, meta.border)}
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn("flex h-7 w-7 items-center justify-center rounded-md shrink-0", meta.bg, meta.color)}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm">
                                    {det.interaction.drugA} + {det.interaction.drugB}
                                  </span>
                                  <Badge variant="outline" className={cn("text-[9px] capitalize", meta.color, "border-current/40")}>
                                    {meta.label}
                                  </Badge>
                                </div>
                                <p className="text-xs mt-1 text-foreground/80">{det.interaction.effect}</p>
                                <div className="mt-1.5 text-[11px]">
                                  <span className="font-semibold text-muted-foreground">Mechanism: </span>
                                  <span className="text-foreground/80">{det.interaction.mechanism}</span>
                                </div>
                                <div className="mt-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 p-2 text-xs flex items-start gap-1.5">
                                  <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                                  <span><span className="font-semibold">Recommendation: </span>{det.interaction.recommendation}</span>
                                </div>
                                {det.matchedDrugsA.length > 0 && (
                                  <div className="mt-1.5 text-[10px] text-muted-foreground">
                                    <span className="font-semibold">Detected: </span>
                                    {[...det.matchedDrugsA, ...det.matchedDrugsB].join(", ")}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
