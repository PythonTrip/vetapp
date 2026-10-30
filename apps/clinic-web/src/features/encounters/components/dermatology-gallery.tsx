"use client";

import * as React from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/authentication/auth-provider";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Slider } from "@/shared/ui/slider";
import { Skeleton } from "@/shared/ui/skeleton";
import { Switch } from "@/shared/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { BODY_REGIONS } from "@/features/encounters/body-regions";
import { ApiError } from "@/shared/api/client";
import { attachmentsApi, type AttachmentRecord, type EncounterRecord } from "@/features/encounters/api";
import { SPECIALTY_LABELS } from "@/features/encounters/labels";
import { formatDateTime } from "@/shared/lib/date-time";
import { useAttachmentsQuery, useDeleteAttachment, useEncountersQuery, useUpdateAttachment, useUploadAttachment } from "@/features/encounters/hooks";
import { apiErrorMessage } from "@/shared/api/error-message";

function AttachmentThumb({ attachment }: { attachment: AttachmentRecord }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    if (!attachment.content_type.startsWith("image/")) return;
    attachmentsApi
      .file(attachment.uuid)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.uuid, attachment.content_type]);

  if (!attachment.content_type.startsWith("image/")) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
        PDF / документ
      </div>
    );
  }
  if (failed) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg bg-muted text-xs text-destructive">
        Не удалось загрузить фото
      </div>
    );
  }
  if (!url) return <Skeleton className="h-40 w-full" />;
  return <img src={url} alt={attachment.caption || "Поражение"} className="h-40 w-full rounded-lg object-cover" />;
}

export function DermatologyGallery({ patientId }: { patientId: string }) {
  const { user, workspace } = useAuth();
  const canShare = workspace === "personal" || ["owner", "admin", "member"].includes(user?.organization?.org_role ?? "");
  const attachments = useAttachmentsQuery(patientId);
  const encounters = useEncountersQuery(patientId);
  const upload = useUploadAttachment(patientId);
  const share = useUpdateAttachment(patientId);
  const remove = useDeleteAttachment(patientId);
  const [sharingId, setSharingId] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [caption, setCaption] = React.useState("");
  const [bodyRegion, setBodyRegion] = React.useState("");
  const [vasScore, setVasScore] = React.useState<number | null>(null);
  const [encounterId, setEncounterId] = React.useState("none");
  const [error, setError] = React.useState<string | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "lesion_photo");
    if (caption.trim()) form.set("caption", caption.trim());
    if (bodyRegion) form.set("body_region", bodyRegion);
    if (vasScore != null) form.set("vas_score", String(vasScore));
    if (encounterId !== "none") form.set("encounter_uuid", encounterId);
    try {
      await upload.mutateAsync(form);
      toast.success("Фото добавлено");
      setCaption("");
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }

  async function onShare(item: AttachmentRecord, visible: boolean) {
    setSharingId(item.uuid);
    try {
      await share.mutateAsync({ id: item.uuid, body: { owner_visible: visible } });
      toast.success(visible ? "Файл показан владельцу" : "Файл скрыт от владельца");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) return;
      toast.error(apiErrorMessage(cause));
    } finally {
      setSharingId(null);
    }
  }

  async function onDelete(item: AttachmentRecord) {
    if (!window.confirm("Удалить файл?")) return;
    try {
      await remove.mutateAsync(item.uuid);
      toast.success("Файл удалён");
    } catch (cause) {
      toast.error(apiErrorMessage(cause));
    }
  }

  const encounterById = new Map((encounters.data ?? []).map((item: EncounterRecord) => [item.uuid, item]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Галерея</CardTitle>
        <CardDescription>Фото поражений на диске, метаданные и VAS — в PostgreSQL.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="photo-caption">Подпись</Label>
            <Input id="photo-caption" value={caption} onChange={(event) => setCaption(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Область тела</Label>
            <Select value={bodyRegion || "none"} onValueChange={(value) => setBodyRegion(value === "none" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Не указана" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не указана</SelectItem>
                {BODY_REGIONS.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>VAS {vasScore ?? "не указан"}</Label>
            <Slider min={1} max={10} step={1} value={[vasScore ?? 5]} onValueChange={([value]) => setVasScore(value ?? 5)} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setVasScore(null)}>
              Сбросить VAS
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Приём</Label>
            <Select value={encounterId} onValueChange={setEncounterId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без приёма</SelectItem>
                {(encounters.data ?? []).map((encounter) => (
                  <SelectItem key={encounter.uuid} value={encounter.uuid}>
                    {formatDateTime(encounter.occurred_at)} · {SPECIALTY_LABELS[encounter.specialty]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(event) => void onFile(event)} />
        <Button type="button" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Загрузить фото или PDF
        </Button>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {attachments.isPending ? <Skeleton className="h-40 w-full" /> : null}
        {attachments.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {apiErrorMessage(attachments.error)}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {(attachments.data ?? []).map((item) => {
            const linked = item.encounter_uuid ? encounterById.get(item.encounter_uuid) : undefined;
            return (
              <div key={item.uuid} className="rounded-xl border p-2">
                <AttachmentThumb attachment={item} />
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.caption || "Без подписи"}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.body_region ? <Badge variant="outline">{item.body_region}</Badge> : null}
                      {item.vas_score != null ? <Badge>VAS {item.vas_score}</Badge> : null}
                      {linked ? <Badge variant="secondary">{SPECIALTY_LABELS[linked.specialty]}</Badge> : null}
                      {item.uploaded_by_owner ? <Badge variant="secondary">От владельца</Badge> : null}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Label htmlFor={`share-${item.uuid}`} className="text-xs">Показывать владельцу</Label>
                      <Switch
                        id={`share-${item.uuid}`}
                        checked={item.owner_visible}
                        disabled={!canShare || sharingId === item.uuid}
                        onCheckedChange={(checked) => void onShare(item, checked)}
                      />
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => void onDelete(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {attachments.data && attachments.data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Фотографий ещё нет</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
