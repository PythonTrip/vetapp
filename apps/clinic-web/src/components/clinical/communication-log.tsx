"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CommunicationChannel, CommunicationDirection, CommunicationWrite } from "@/lib/api-client";
import { CHANNEL_LABELS, DIRECTION_LABELS, formatDateTime, fromDateTimeLocal, toDateTimeLocal } from "@/lib/clinical-labels";
import { useCommunicationsQuery, useCreateCommunication, useDeleteCommunication } from "@/lib/hooks";
import { apiErrorMessage } from "@/lib/patient-form";

export function CommunicationLog({ patientId }: { patientId: string }) {
  const query = useCommunicationsQuery(patientId);
  const createItem = useCreateCommunication(patientId);
  const removeItem = useDeleteCommunication(patientId);
  const [channel, setChannel] = React.useState<CommunicationChannel>("phone");
  const [direction, setDirection] = React.useState<CommunicationDirection>("outbound");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [occurredAt, setOccurredAt] = React.useState(toDateTimeLocal(new Date().toISOString()));
  const [followUpAt, setFollowUpAt] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const payload: CommunicationWrite = {
      channel,
      direction,
      subject: subject.trim() || null,
      body: body.trim() || null,
      occurred_at: occurredAt ? fromDateTimeLocal(occurredAt) : new Date().toISOString(),
      follow_up_at: followUpAt ? fromDateTimeLocal(followUpAt) : null,
    };
    try {
      await createItem.mutateAsync(payload);
      toast.success("Контакт записан");
      setSubject("");
      setBody("");
      setFollowUpAt("");
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Коммуникации</CardTitle>
        <CardDescription>Журнал контактов с владельцем и дата повторного касания.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(event) => void onSubmit(event)} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Канал</Label>
            <Select value={channel} onValueChange={(value) => setChannel(value as CommunicationChannel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Направление</Label>
            <Select value={direction} onValueChange={(value) => setDirection(value as CommunicationDirection)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DIRECTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="comm-when">Когда</Label>
            <Input id="comm-when" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comm-follow">Повторный контакт</Label>
            <Input id="comm-follow" type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="comm-subject">Тема</Label>
            <Input id="comm-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="comm-body">Текст</Label>
            <Textarea id="comm-body" value={body} onChange={(event) => setBody(event.target.value)} />
          </div>
          {error ? (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {error}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={createItem.isPending}>
              {createItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Добавить в журнал
            </Button>
          </div>
        </form>

        {query.isPending ? <Skeleton className="h-20 w-full" /> : null}
        {query.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {apiErrorMessage(query.error)}
          </p>
        ) : null}
        <div className="space-y-2">
          {(query.data ?? []).map((item) => (
            <div key={item.uuid} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{formatDateTime(item.occurred_at)}</strong>
                  <Badge variant="secondary">{CHANNEL_LABELS[item.channel]}</Badge>
                  <Badge variant="outline">{DIRECTION_LABELS[item.direction]}</Badge>
                  {item.follow_up_at ? <Badge>Follow-up {formatDateTime(item.follow_up_at)}</Badge> : null}
                </div>
                <p className="mt-1 text-sm">{item.subject || "Без темы"}</p>
                {item.body ? <p className="text-sm text-muted-foreground">{item.body}</p> : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (!window.confirm("Удалить запись журнала?")) return;
                  void removeItem.mutateAsync(item.uuid).then(
                    () => toast.success("Удалено"),
                    (cause) => toast.error(apiErrorMessage(cause)),
                  );
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {query.data && query.data.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Журнал пуст</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
