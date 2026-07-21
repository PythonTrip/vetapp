"use client";

import * as React from "react";
import {
  MessageSquare, Send, Trash2, Plus, Clock, PhoneCall,
  Mail as MailIcon, MessagesSquare, Video, User, Check, RotateCcw, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { PetWithRelations, CommunicationLogEntry } from "@/lib/types";
import {
  useCommunications, useCreateCommunication, useDeleteCommunication, useUpdateCommunication,
} from "@/lib/hooks";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CommChannel = "phone" | "email" | "text" | "video" | "in_person";
type CommDirection = "outbound" | "inbound";

const CHANNEL_META: Record<CommChannel, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  phone: { label: "Phone Call", icon: PhoneCall, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/10" },
  email: { label: "Email", icon: MailIcon, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10" },
  text: { label: "Text Message", icon: MessageSquare, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  video: { label: "Video Call", icon: Video, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  in_person: { label: "In-Person", icon: User, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10" },
};

export function OwnerCommunicationLog({ pet }: { pet: PetWithRelations }) {
  const { data: comms, isLoading } = useCommunications(pet.id);
  const createMut = useCreateCommunication();
  const deleteMut = useDeleteCommunication();
  const updateMut = useUpdateCommunication();
  const [open, setOpen] = React.useState(false);

  const sorted = React.useMemo(() => {
    return [...(comms ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [comms]);

  // Stats
  const totalComms = sorted.length;
  const lastContact = sorted[0];
  const daysSinceLast = lastContact
    ? Math.floor((Date.now() - new Date(lastContact.date).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const pendingFollowUps = sorted.filter((c) => c.followUp).length;

  function addComm(entry: Omit<CommunicationLogEntry, "id" | "petId" | "createdAt">) {
    createMut.mutate(
      { ...entry, petId: pet.id },
      {
        onSuccess: () => toast.success("Communication logged", { description: `Recorded with ${pet.ownerName || "owner"}.` }),
        onError: () => toast.error("Failed to log communication"),
      },
    );
  }
  function deleteComm(id: string) {
    deleteMut.mutate(
      { id, petId: pet.id },
      { onSuccess: () => toast.success("Entry deleted"), onError: () => toast.error("Failed to delete") },
    );
  }
  function toggleFollowUp(c: CommunicationLogEntry) {
    updateMut.mutate(
      { id: c.id, petId: pet.id, data: { followUp: !c.followUp } },
      { onSuccess: () => toast.success(c.followUp ? "Follow-up cleared" : "Marked for follow-up"), onError: () => toast.error("Update failed") },
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-primary" />
            Owner Communication Log
            <Badge variant="secondary" className="text-[9px] gap-0.5 font-normal">
              Synced
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {totalComms > 0
              ? `${totalComms} entries · last contact ${daysSinceLast === 0 ? "today" : `${daysSinceLast}d ago`}${pendingFollowUps > 0 ? ` · ${pendingFollowUps} pending follow-up` : ""}`
              : "Track calls, emails, and messages with the owner"}
          </CardDescription>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Log Contact
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 mx-auto mb-3">
              <MessagesSquare className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground">No communications logged</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Keep a record of every phone call, email, text, or in-person conversation with {pet.name}'s owner for continuity of care. Entries are synced across devices.
            </p>
            <Button size="sm" className="gap-1.5 mt-4" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Log First Contact
            </Button>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px] scrollbar-thin pr-2">
            <div className="space-y-2">
              {sorted.map((c) => {
                const meta = CHANNEL_META[c.channel as CommChannel] ?? CHANNEL_META.phone;
                return (
                  <div key={c.id} className={cn(
                    "group rounded-xl border p-3 hover:shadow-sm transition-all",
                    c.followUp && "border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20",
                  )}>
                    <div className="flex items-start gap-3">
                      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", meta.bg)}>
                        <meta.icon className={cn("h-4 w-4", meta.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{c.subject || meta.label}</span>
                          <Badge variant="outline" className={cn("text-[9px]", c.direction === "inbound" ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" : "bg-primary/5 text-primary")}>
                            {c.direction === "inbound" ? "← In" : "→ Out"}
                          </Badge>
                          {c.duration != null && (
                            <Badge variant="outline" className="text-[9px] gap-0.5">
                              <Clock className="h-2.5 w-2.5" /> {c.duration}min
                            </Badge>
                          )}
                          {c.followUp && (
                            <Badge className="text-[9px] bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 gap-0.5">
                              Follow-up
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(c.date).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                        {c.notes && (
                          <p className="text-xs text-foreground/80 mt-1.5 leading-relaxed whitespace-pre-wrap">{c.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                          title={c.followUp ? "Clear follow-up flag" : "Mark for follow-up"}
                          onClick={() => toggleFollowUp(c)}
                          disabled={updateMut.isPending}
                        >
                          {c.followUp ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteComm(c.id)}
                          disabled={deleteMut.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <AddCommDialog
        open={open}
        onOpenChange={setOpen}
        onAdd={addComm}
        submitting={createMut.isPending}
      />
    </Card>
  );
}

function AddCommDialog({
  open, onOpenChange, onAdd, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (entry: Omit<CommunicationLogEntry, "id" | "petId" | "createdAt">) => void;
  submitting: boolean;
}) {
  const [channel, setChannel] = React.useState<CommChannel>("phone");
  const [direction, setDirection] = React.useState<CommDirection>("outbound");
  const [date, setDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = React.useState(new Date().toTimeString().slice(0, 5));
  const [duration, setDuration] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [followUp, setFollowUp] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSubject("");
      setNotes("");
      setFollowUp(false);
      setDuration("");
      setDate(new Date().toISOString().split("T")[0]);
      setTime(new Date().toTimeString().slice(0, 5));
    }
  }, [open]);

  function handleAdd() {
    if (!notes.trim() && !subject.trim()) {
      toast.error("Add a subject or notes");
      return;
    }
    onAdd({
      channel,
      direction,
      date: new Date(`${date}T${time}`).toISOString(),
      duration: duration ? Number(duration) : null,
      subject: subject || CHANNEL_META[channel].label,
      notes: notes || null,
      followUp,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-primary" />
            Log Owner Communication
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as CommChannel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as CommDirection)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound (I contacted them)</SelectItem>
                  <SelectItem value="inbound">Inbound (They contacted me)</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="—" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Lab results discussion" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Summary of the conversation..." />
          </div>
          <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-2.5">
            <input
              type="checkbox"
              checked={followUp}
              onChange={(e) => setFollowUp(e.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            <span className="text-xs font-medium flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Flag for follow-up
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={submitting} className="gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Log Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
