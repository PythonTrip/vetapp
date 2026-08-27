"use client";

import * as React from "react";
import { Plus, Trash2, Flame, Beef, Wheat, Droplet, Scale, BookOpen } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDietPlan, useDeleteDietPlan } from "@/lib/hooks";
import { parseDietPlanFediafMeta } from "@/lib/diet-plan";
import { calculateRERMER } from "@/lib/nutrition";
import type { PetWithRelations, DietType } from "@/lib/types";
import { toast } from "sonner";

const DIET_TYPES: { value: DietType; label: string }[] = [
  { value: "commercial", label: "Commercial" },
  { value: "home_cooked", label: "Home-cooked" },
  { value: "barf", label: "BARF (Raw)" },
  { value: "mixed", label: "Mixed" },
];

export function DietPlanPanel({ pet }: { pet: PetWithRelations }) {
  const [open, setOpen] = React.useState(false);
  const createMut = useCreateDietPlan();
  const delMut = useDeleteDietPlan();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Diet Plans</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{pet.dietPlans.length} plans · RER/MER calculated</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New Plan
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {pet.dietPlans.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No diet plans yet. Create one — RER and MER are auto-calculated from {pet.name}'s metrics.
          </div>
        ) : (
          pet.dietPlans.map((plan) => {
            const macros = JSON.parse(plan.macros || "{}");
            const macroData = [
              { name: "Protein", value: macros.protein ?? 0, fill: "oklch(0.6 0.13 175)" },
              { name: "Fat", value: macros.fat ?? 0, fill: "oklch(0.7 0.14 85)" },
              { name: "Carbs", value: macros.carbs ?? 0, fill: "oklch(0.65 0.15 145)" },
            ];
            let template: { category: string; ingredient: string; grams?: number; percentage?: number }[] = [];
            try { template = plan.template ? JSON.parse(plan.template) : []; } catch { /* */ }
            const fediafMeta = parseDietPlanFediafMeta(plan.fediafMeta);
            return (
              <div key={plan.id} className="rounded-xl border p-4 group">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm">{plan.name}</h4>
                      <Badge variant="outline" className="text-[10px] capitalize">{plan.type}</Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={() => delMut.mutate(plan.id, {
                      onSuccess: () => toast.success("Diet plan removed"),
                      onError: () => toast.error("Failed to delete"),
                    })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      <Flame className="h-3 w-3 text-orange-500" /> RER
                    </div>
                    <div className="text-lg font-bold tabular-nums mt-0.5">{Math.round(plan.rer)}</div>
                    <div className="text-[9px] text-muted-foreground">kcal/day</div>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-2.5">
                    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-primary">
                      <Flame className="h-3 w-3" /> MER
                    </div>
                    <div className="text-lg font-bold tabular-nums mt-0.5 text-primary">{Math.round(plan.mer)}</div>
                    <div className="text-[9px] text-muted-foreground">kcal/day target</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      <Scale className="h-3 w-3" /> Macros
                    </div>
                    <div className="text-sm font-semibold mt-0.5">% DM</div>
                    <div className="text-[9px] text-muted-foreground">P/F/C</div>
                  </div>
                </div>

                {fediafMeta && (
                  <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-semibold">Контекст FEDIAF</span>
                      <Badge variant="outline" className="text-[9px]">v{fediafMeta.version}</Badge>
                      <Badge variant="secondary" className="text-[9px]">{fediafMeta.stageCode}</Badge>
                    </div>
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer font-medium text-foreground">
                        Клинический дисклеймер
                      </summary>
                      <p className="mt-2 leading-relaxed">{fediafMeta.disclaimerRu}</p>
                      {fediafMeta.sourceUrl && (
                        <a
                          href={fediafMeta.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block underline underline-offset-2 hover:text-foreground"
                        >
                          {fediafMeta.sourceTitle ?? "Источник FEDIAF"}
                        </a>
                      )}
                    </details>
                  </div>
                )}

                {macros.protein != null && (
                  <div className="h-32 mt-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={macroData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                        <YAxis tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }}
                          formatter={(v: number) => [`${v}%`, "of DM"]}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {macroData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {template.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">Template Breakdown</div>
                    <div className="space-y-1">
                      {template.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Badge variant="secondary" className="text-[9px] capitalize w-20 justify-center">{t.category}</Badge>
                          <span className="flex-1 truncate">{t.ingredient}</span>
                          <span className="font-semibold tabular-nums">
                            {t.grams != null ? `${t.grams} г` : `${t.percentage ?? 0}%`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {plan.notes && (
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed bg-muted/30 rounded-lg p-2">
                    {plan.notes}
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      <NewDietPlanDialog open={open} onOpenChange={setOpen} pet={pet} onCreate={createMut} />
    </Card>
  );
}

function NewDietPlanDialog({
  open, onOpenChange, pet, onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pet: PetWithRelations;
  onCreate: ReturnType<typeof useCreateDietPlan>;
}) {
  // Auto-calc RER/MER from pet metrics
  const calc = React.useMemo(
    () => calculateRERMER(pet.currentWeight, pet.species, pet.lifeStage, pet.activityLevel, pet.neutered, pet.bcs, pet.targetWeight),
    [pet]
  );

  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<DietType>("commercial");
  const [protein, setProtein] = React.useState("30");
  const [fat, setFat] = React.useState("15");
  const [carbs, setCarbs] = React.useState("55");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName(`${pet.name}'s Diet Plan`);
      setNotes("");
    }
  }, [open, pet.name]);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Plan name required");
      return;
    }
    try {
      await onCreate.mutateAsync({
        petId: pet.id,
        name,
        type,
        rer: calc.rer,
        mer: calc.mer,
        macros: JSON.stringify({ protein: Number(protein), fat: Number(fat), carbs: Number(carbs) }),
        notes: notes || null,
      });
      toast.success("Diet plan created");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create plan");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Diet Plan</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
            <div className="text-xs">
              <span className="text-muted-foreground">Auto-calculated for {pet.name}:</span>
              <div className="font-semibold mt-0.5">RER {calc.rer} · MER {calc.mer} kcal/day</div>
            </div>
            <div className="text-right text-[10px] text-muted-foreground">
              <div>{pet.currentWeight} kg · BCS {pet.bcs}</div>
              <div className="capitalize">{pet.lifeStage.replace("_", " ")} · {pet.activityLevel}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Plan Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Diet Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as DietType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIET_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Macronutrient Targets (% Dry Matter)</Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] flex items-center gap-1"><Beef className="h-3 w-3" /> Protein %</Label>
                <Input type="number" value={protein} onChange={(e) => setProtein(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] flex items-center gap-1"><Droplet className="h-3 w-3" /> Fat %</Label>
                <Input type="number" value={fat} onChange={(e) => setFat(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] flex items-center gap-1"><Wheat className="h-3 w-3" /> Carb %</Label>
                <Input type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Feeding instructions, brand, supplement notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={onCreate.isPending}>Create Plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
