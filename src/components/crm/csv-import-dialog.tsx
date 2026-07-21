"use client";

import * as React from "react";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Loader2, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { parsePatientCsv, downloadImportTemplate, rowToPetPayload, type ParsedPetRow } from "@/lib/import-utils";
import { toast } from "sonner";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Phase = "idle" | "parsing" | "preview" | "importing" | "done";

export function CsvImportDialog({ open, onOpenChange }: CsvImportDialogProps) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [rows, setRows] = React.useState<ParsedPetRow[]>([]);
  const [stats, setStats] = React.useState({ totalRows: 0, validRows: 0, errorRows: 0 });
  const [importProgress, setImportProgress] = React.useState(0);
  const [importedCount, setImportedCount] = React.useState(0);
  const [failedCount, setFailedCount] = React.useState(0);
  const [fileName, setFileName] = React.useState<string>("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);

  // Reset state on open
  React.useEffect(() => {
    if (open) {
      setPhase("idle");
      setRows([]);
      setStats({ totalRows: 0, validRows: 0, errorRows: 0 });
      setImportProgress(0);
      setImportedCount(0);
      setFailedCount(0);
      setFileName("");
    }
  }, [open]);

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      toast.error("Please select a .csv file");
      return;
    }
    setFileName(file.name);
    setPhase("parsing");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result ?? "");
        const result = parsePatientCsv(text);
        if (result.rows.length === 0) {
          toast.error("No data rows found in CSV");
          setPhase("idle");
          return;
        }
        setRows(result.rows);
        setStats({ totalRows: result.totalRows, validRows: result.validRows, errorRows: result.errorRows });
        setPhase("preview");
        toast.success(`Parsed ${result.totalRows} row${result.totalRows === 1 ? "" : "s"} · ${result.validRows} valid, ${result.errorRows} with errors`);
      } catch {
        toast.error("Failed to parse CSV");
        setPhase("idle");
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    const validRows = rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    setPhase("importing");
    setImportProgress(0);
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < validRows.length; i++) {
      try {
        const res = await fetch("/api/pets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rowToPetPayload(validRows[i])),
        });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
      // small delay so progress bar is visible
      await new Promise((r) => setTimeout(r, 50));
    }
    setImportedCount(ok);
    setFailedCount(fail);
    setPhase("done");
    if (ok > 0) {
      await queryClient.invalidateQueries({ queryKey: ["pets"] });
      toast.success(`Imported ${ok} patient${ok === 1 ? "" : "s"}`);
    }
    if (fail > 0) {
      toast.error(`${fail} patient${fail === 1 ? "" : "s"} failed to import`);
    }
  }

  function handleClose() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Import Patients from CSV
          </DialogTitle>
          <DialogDescription>
            Bulk-create patient records from a spreadsheet. Download the template to see required columns.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {phase === "idle" && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
                  dragActive
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40",
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto mb-3">
                  <Upload className="h-7 w-7" />
                </div>
                <p className="text-sm font-semibold mb-1">
                  {dragActive ? "Drop CSV here" : "Click to select or drag & drop a CSV file"}
                </p>
                <p className="text-xs text-muted-foreground">Supports .csv — UTF-8 encoded</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>

              {/* Template download */}
              <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Need a template?</div>
                    <div className="text-xs text-muted-foreground">Download a sample CSV with 14 columns and 2 example rows.</div>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={downloadImportTemplate}>
                  <Download className="h-3.5 w-3.5" /> Template
                </Button>
              </div>

              {/* Required fields info */}
              <div className="rounded-lg border p-3">
                <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" /> Required columns
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  {["Name", "Species (dog/cat)", "Breed", "BirthDate (YYYY-MM-DD)", "Sex (male/female)", "OwnerName", "CurrentWeight (kg)", "BCS (1-9)", "LifeStage", "ActivityLevel"].map((f) => (
                    <div key={f} className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-1 w-1 rounded-full bg-primary" /> {f}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground mt-2 italic">
                  Optional: Neutered, TargetWeight, OwnerContact, Notes
                </div>
              </div>
            </div>
          )}

          {phase === "parsing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Parsing CSV...</p>
            </div>
          )}

          {(phase === "preview" || phase === "importing" || phase === "done") && (
            <div className="space-y-3 h-full flex flex-col">
              {/* Stats header */}
              <div className="grid grid-cols-4 gap-2">
                <StatBox label="Total" value={stats.totalRows} icon={FileSpreadsheet} color="text-foreground" />
                <StatBox label="Valid" value={stats.validRows} icon={CheckCircle2} color="text-emerald-600 dark:text-emerald-400" />
                <StatBox label="Errors" value={stats.errorRows} icon={XCircle} color="text-rose-600 dark:text-rose-400" />
                <StatBox label="Source" value={fileName.length > 12 ? fileName.slice(0, 10) + "..." : fileName} icon={FileText} color="text-muted-foreground" small />
              </div>

              {phase === "importing" && (
                <div className="rounded-lg border bg-primary/5 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Importing...
                    </span>
                    <span className="text-xs tabular-nums font-bold text-primary">{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} className="h-2" />
                </div>
              )}

              {phase === "done" && (
                <div className={cn(
                  "rounded-lg border p-3 flex items-center gap-3",
                  failedCount > 0
                    ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30"
                    : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30",
                )}>
                  <div className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                    failedCount > 0 ? "bg-amber-100 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400",
                  )}>
                    {failedCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">
                      Import complete: {importedCount} added{failedCount > 0 ? `, ${failedCount} failed` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {failedCount > 0 ? "Some rows failed. See details below." : "All valid patients were successfully imported."}
                    </div>
                  </div>
                </div>
              )}

              {/* Preview table */}
              <ScrollArea className="flex-1 border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr className="border-b">
                      <th className="text-left p-2 font-semibold w-8">#</th>
                      <th className="text-left p-2 font-semibold">Name</th>
                      <th className="text-left p-2 font-semibold">Species</th>
                      <th className="text-left p-2 font-semibold">Breed</th>
                      <th className="text-right p-2 font-semibold">Weight</th>
                      <th className="text-center p-2 font-semibold">BCS</th>
                      <th className="text-left p-2 font-semibold">Status / Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const hasError = row.errors.length > 0;
                      const hasWarning = row.warnings.length > 0;
                      return (
                        <tr key={row.rowIndex} className={cn(
                          "border-b last:border-0 hover:bg-muted/30",
                          hasError && "bg-rose-50/40 dark:bg-rose-950/20",
                          !hasError && hasWarning && "bg-amber-50/40 dark:bg-amber-950/20",
                        )}>
                          <td className="p-2 text-muted-foreground tabular-nums">{row.rowIndex}</td>
                          <td className="p-2 font-medium">{row.name || <span className="text-muted-foreground italic">—</span>}</td>
                          <td className="p-2 capitalize">{row.species || <span className="text-muted-foreground italic">—</span>}</td>
                          <td className="p-2">{row.breed || <span className="text-muted-foreground italic">—</span>}</td>
                          <td className="p-2 text-right tabular-nums">{row.currentWeight > 0 ? `${row.currentWeight} kg` : "—"}</td>
                          <td className="p-2 text-center tabular-nums">{row.bcs || "—"}</td>
                          <td className="p-2">
                            {hasError ? (
                              <div className="space-y-0.5">
                                {row.errors.slice(0, 2).map((e, i) => (
                                  <div key={i} className="text-[10px] text-rose-600 dark:text-rose-400 flex items-start gap-1">
                                    <XCircle className="h-3 w-3 mt-0.5 shrink-0" /> {e}
                                  </div>
                                ))}
                                {row.errors.length > 2 && <div className="text-[10px] text-rose-500">+{row.errors.length - 2} more</div>}
                              </div>
                            ) : hasWarning ? (
                              <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" /> {row.warnings[0]}
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50">
                                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> OK
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-row justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => setPhase("idle")} disabled={phase === "importing"}>
            Start over
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={phase === "importing"}>
              {phase === "done" ? "Close" : "Cancel"}
            </Button>
            {phase === "preview" && (
              <Button onClick={handleImport} disabled={stats.validRows === 0} className="gap-1.5">
                <Upload className="h-4 w-4" /> Import {stats.validRows} patient{stats.validRows === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatBox({ label, value, icon: Icon, color, small }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
        <Icon className={cn("h-3 w-3", color)} /> {label}
      </div>
      <div className={cn("font-bold tabular-nums", small ? "text-xs" : "text-lg", color)}>
        {value}
      </div>
    </div>
  );
}
