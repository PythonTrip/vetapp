"use client";

import * as React from "react";
import { Button } from "@vetdietderm/ui/button";
import { ownerError, ownerUploads, validateOwnerFile, OWNER_UPLOAD_TYPES, type AnimalPassport, type OwnerUpload } from "../api";
import { useOwnerPlatform } from "../platform";
import { CabinetIcon, PetAvatar } from "./cabinet-visuals";
import { speciesLabel } from "../domain";

export function PassportPhoto({ animal, onPhoto }: { animal: AnimalPassport; onPhoto: (url: string) => void }) {
  const id = React.useId();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  return <div className="passport-profile">
    <PetAvatar name={animal.name} photoUrl={animal.photo_url} />
    <div><h2>{animal.name}</h2><p>{speciesLabel(animal.species)} · {animal.breed || "Порода не указана"}</p>
      <Button variant="ghost" disabled={busy} onClick={() => document.getElementById(id)?.click()}><CabinetIcon name="edit" size={18} />{busy ? "Загрузка фото…" : "Изменить фото"}</Button>
      <input id={id} hidden type="file" aria-label="Фото питомца" disabled={busy} accept={OWNER_UPLOAD_TYPES.filter(type => type.startsWith("image/")).join(",")} onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file || busy) return;
        const invalid = validateOwnerFile(file, true); setNotice(""); setError(invalid);
        if (invalid) return;
        setBusy(true);
        try { const result = await ownerUploads.upload(animal.uuid, file, "photo"); onPhoto(`/api/owner/uploads/${result.uuid}`); setNotice("Фото сохранено"); }
        catch (cause) { setError(ownerError(cause)); } finally { setBusy(false); }
      }} />
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    </div>
  </div>;
}

export function PassportDocuments({ animalId }: { animalId: string }) {
  const id = React.useId();
  const platform = useOwnerPlatform();
  const [files, setFiles] = React.useState<OwnerUpload[]>([]);
  const [pending, setPending] = React.useState<File[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [reload, setReload] = React.useState(0);
  React.useEffect(() => {
    let active = true; setLoading(true); setError("");
    ownerUploads.list(animalId).then(result => { if (active) setFiles(result); }).catch(cause => { if (active) setError(ownerError(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [animalId, reload]);
  return <section className="owner-card owner-documents" aria-label="Мои фото и файлы">
    <div className="owner-section-heading"><h3>Мои фото и файлы</h3><Button variant="ghost" disabled={busy} onClick={() => document.getElementById(id)?.click()}><CabinetIcon name="plus" size={18} />Добавить</Button></div>
    <p className="owner-caption">JPEG, PNG, WebP, GIF или PDF, до 8 МБ. Для отправки врачу прикрепите файл в сообщениях.</p>
    <input id={id} aria-label="Фото и файлы питомца" hidden type="file" multiple disabled={busy} accept={OWNER_UPLOAD_TYPES.join(",")} onChange={event => {
      const selected = Array.from(event.target.files ?? []); event.target.value = "";
      const invalid = selected.map(file => validateOwnerFile(file)).find(Boolean); setError(invalid || ""); setNotice("");
      if (!invalid) setPending(selected);
    }} />
    {loading && <p role="status">Загрузка файлов…</p>}
    {error && <div><p role="alert" className="text-destructive">{error}</p>{!pending.length && <Button variant="outline" disabled={busy} onClick={() => setReload(value => value + 1)}>Повторить загрузку</Button>}</div>}
    {!loading && !error && files.length === 0 && <div className="owner-inline-empty"><CabinetIcon name="file" /><p>Загрузите фото, анализы или документы питомца.</p></div>}
    <ul>{files.map(file => <li key={file.uuid}><CabinetIcon name="file" /><span><strong>{file.filename}</strong><small>{Math.max(1, Math.round(file.byte_size / 1024))} КБ</small></span><Button variant="ghost" size="icon" aria-label={`Скачать ${file.filename}`} disabled={busy} onClick={async () => {
      setBusy(true); setError(""); try { await platform.saveFile(await ownerUploads.download(file.uuid), file.filename); } catch (cause) { setError(ownerError(cause)); } finally { setBusy(false); }
    }}><CabinetIcon name="arrow" /></Button></li>)}</ul>
    {pending.length > 0 && <div className="space-y-3"><ul>{pending.map((file, index) => <li key={`${file.name}-${index}`}><span>{file.name}</span><Button variant="ghost" size="icon" aria-label={`Убрать ${file.name}`} disabled={busy} onClick={() => setPending(current => current.filter(item => item !== file))}><CabinetIcon name="close" /></Button></li>)}</ul><Button disabled={busy} onClick={async () => {
      setBusy(true); setError(""); setNotice("");
      try {
        for (const file of pending) { const result = await ownerUploads.upload(animalId, file, "document"); setFiles(current => [result, ...current]); setPending(current => current.filter(item => item !== file)); }
        setNotice("Файлы сохранены");
      } catch (cause) { setError(ownerError(cause)); } finally { setBusy(false); }
    }}>{busy ? "Загрузка…" : "Загрузить файлы"}</Button></div>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
