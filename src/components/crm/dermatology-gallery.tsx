"use client";

import * as React from "react";
import {
  Plus, Trash2, ImagePlus, Calendar, MapPin, TrendingDown, TrendingUp, Minus,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
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
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAddPhoto, useDeletePhoto } from "@/lib/hooks";
import { BODY_REGIONS } from "@/lib/clinical-data";
import { vasDescription } from "@/lib/nutrition";
import type { PetWithRelations } from "@/lib/types";
import { toast } from "sonner";

export function DermatologyGallery({ pet }: { pet: PetWithRelations }) {
  const [open, setOpen] = React.useState(false);
  const addMut = useAddPhoto();
  const delMut = useDeletePhoto();

  const photos = [...pet.photos].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // VAS trend chart data
  const vasTrend = [...pet.photos]
    .filter((p) => p.vasScore != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((p) => ({
      date: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      vas: p.vasScore,
    }));

  // Also include VAS from consultations
  const consultVas = pet.consultations
    .filter((c) => c.vasScore != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((c) => ({
      date: new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      vas: c.vasScore,
    }));

  const trendData = [...vasTrend, ...consultVas]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    // dedupe by date, keep last
    .filter((d, i, arr) => i === arr.length - 1 || arr[i + 1].date !== d.date);

  const vasDelta = trendData.length >= 2
    ? (trendData[trendData.length - 1].vas ?? 0) - (trendData[0].vas ?? 0)
    : 0;

  return (
    <div className="space-y-4">
      {/* VAS Progress Chart */}
      {trendData.length >= 2 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Pruritus (VAS) Progress
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Visual Analog Scale over time · 1-10</p>
              </div>
              <VasDeltaBadge delta={vasDelta} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="vasGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.55 0.12 175)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.55 0.12 175)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }}
                  />
                  <ReferenceLine y={4} stroke="oklch(0.7 0.15 145)" strokeDasharray="4 4" label={{ value: "Mild", fontSize: 9, fill: "oklch(0.5 0.15 145)" }} />
                  <ReferenceLine y={7} stroke="oklch(0.65 0.2 40)" strokeDasharray="4 4" label={{ value: "Severe", fontSize: 9, fill: "oklch(0.5 0.2 40)" }} />
                  <Line
                    type="monotone"
                    dataKey="vas"
                    stroke="oklch(0.55 0.12 175)"
                    strokeWidth={2.5}
                    dot={{ fill: "oklch(0.55 0.12 175)", r: 4 }}
                    activeDot={{ r: 6 }}
                    fill="url(#vasGrad)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photo gallery */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Dermatology Gallery</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{photos.length} lesion photos · before & after tracking</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <ImagePlus className="h-3.5 w-3.5" /> Add Photo
          </Button>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No photos yet. Upload lesion photos with VAS scores to track progress.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {photos.map((p) => {
                const vas = p.vasScore != null ? vasDescription(p.vasScore) : null;
                return (
                  <div key={p.id} className="group relative rounded-xl overflow-hidden border bg-muted/30">
                    <div className="aspect-[4/3] bg-muted">
                      <img src={p.imageData} alt={p.caption ?? "lesion"} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-2.5 space-y-1">
                      <div className="flex items-center gap-1 flex-wrap">
                        {vas && (
                          <Badge variant="secondary" className={`text-[9px] ${vas.color}`}>
                            VAS {p.vasScore} · {vas.label}
                          </Badge>
                        )}
                        {p.bodyRegion && (
                          <Badge variant="outline" className="text-[9px] gap-0.5">
                            <MapPin className="h-2 w-2" />
                            {p.bodyRegion}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5" />
                        {new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                      {p.caption && (
                        <p className="text-[11px] text-foreground/80 line-clamp-2 leading-snug">{p.caption}</p>
                      )}
                    </div>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        delMut.mutate(p.id, {
                          onSuccess: () => toast.success("Photo removed"),
                          onError: () => toast.error("Failed to delete"),
                        });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AddPhotoDialog open={open} onOpenChange={setOpen} petId={pet.id} onAdd={addMut} />
    </div>
  );
}

function VasDeltaBadge({ delta }: { delta: number }) {
  if (delta === 0)
    return (
      <Badge variant="secondary" className="gap-1">
        <Minus className="h-3 w-3" /> Stable
      </Badge>
    );
  if (delta < 0)
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20">
        <TrendingDown className="h-3 w-3" /> Improved {Math.abs(delta)} pts
      </Badge>
    );
  return (
    <Badge className="gap-1 bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/20">
      <TrendingUp className="h-3 w-3" /> Worsened {delta} pts
    </Badge>
  );
}

function AddPhotoDialog({
  open, onOpenChange, petId, onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  petId: string;
  onAdd: ReturnType<typeof useAddPhoto>;
}) {
  const [imageData, setImageData] = React.useState<string>("");
  const [caption, setCaption] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [vas, setVas] = React.useState(5);
  const [region, setRegion] = React.useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image too large (max 4MB)");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setImageData(reader.result as string);
    reader.readAsDataURL(file);
  }

  function reset() {
    setImageData("");
    setCaption("");
    setVas(5);
    setRegion("");
  }

  async function handleAdd() {
    if (!imageData) {
      toast.error("Please select an image");
      return;
    }
    try {
      await onAdd.mutateAsync({
        petId,
        data: {
          date: new Date(date).toISOString(),
          imageData,
          caption: caption || null,
          vasScore: vas,
          bodyRegion: region || null,
        },
      });
      toast.success("Photo added to gallery");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add photo");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Lesion Photo</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Photo</Label>
            <div className="rounded-lg border-2 border-dashed p-4 text-center">
              {imageData ? (
                <div className="relative">
                  <img src={imageData} alt="preview" className="max-h-48 mx-auto rounded-lg" />
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setImageData("")}>Remove</Button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-2">
                  <ImagePlus className="h-8 w-8 text-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground">Click to upload (max 4MB)</span>
                  <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
                </label>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Body Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {BODY_REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Pruritus VAS at time of photo</Label>
              <Badge variant="secondary" className={vasDescription(vas).color}>{vas}/10 · {vasDescription(vas).label}</Badge>
            </div>
            <Slider value={[vas]} onValueChange={(v) => setVas(v[0])} min={1} max={10} step={1} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Caption / Description</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} placeholder="e.g. Erythema on interdigital skin, all four paws" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={onAdd.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add Photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
