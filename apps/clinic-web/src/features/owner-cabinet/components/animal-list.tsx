"use client";

import * as React from "react";
import { Button } from "@/shared/ui/button";
import { ownerError, ownerRequest, type AnimalPassport } from "@/features/owner-cabinet/api";
import { sexLabel, speciesLabel } from "@/features/patients/form";
import { AnimalForm } from "@/features/owner-cabinet/components/animal-form";
import { AnimalChat } from "@/features/owner-cabinet/components/animal-chat";
import { AnimalFiles } from "@/features/owner-cabinet/components/animal-files";
import { AnimalVisits } from "@/features/owner-cabinet/components/visit-request-form";

export function AnimalList({ linked }: { linked: boolean }) {
  const [animals, setAnimals] = React.useState<AnimalPassport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [editing, setEditing] = React.useState<AnimalPassport | "new" | null>(null);
  const [notice, setNotice] = React.useState("");
  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try { setAnimals(await ownerRequest<AnimalPassport[]>("/animals")); }
    catch (cause) { setError(ownerError(cause)); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  return <section className="space-y-4 border-b pb-6">
    <h2 className="text-lg font-semibold">Мои животные</h2>
    {loading && <p role="status">Загрузка животных…</p>}
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" disabled={loading} onClick={() => void load()}>Повторить загрузку</Button></div>}
    {!loading && !error && animals.length === 0 && <p className="text-sm text-muted-foreground">Пока нет животных. Добавьте первое животное, чтобы заполнить его паспорт.</p>}
    <ul className="divide-y">{animals.map(animal => <li key={animal.uuid} className="space-y-2 py-4 first:pt-0">
      <h3 className="break-words font-semibold">{animal.name}</h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Вид</dt><dd>{speciesLabel(animal.species)}</dd>
        <dt className="text-muted-foreground">Порода</dt><dd className="break-words">{animal.breed || "Не указана"}</dd>
        <dt className="text-muted-foreground">Пол</dt><dd>{sexLabel(animal.sex ?? "unspecified")}</dd>
        <dt className="text-muted-foreground">Дата рождения</dt><dd>{animal.birth_date ? animal.birth_date.split("-").reverse().join(".") : "Не указана"}</dd>
      </dl>
      <Button variant="outline" disabled={editing !== null} onClick={() => { setEditing(animal); setNotice(""); }}>Редактировать паспорт</Button>
      <AnimalChat key={animal.uuid} path={`/owner/animals/${animal.uuid}/chat`} ownerView />
      <AnimalFiles animalId={animal.uuid} linked={linked} />
      <AnimalVisits animalId={animal.uuid} />
    </li>)}</ul>
    {editing ? <AnimalForm key={editing === "new" ? "new" : editing.uuid} animal={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={saved => {
      setAnimals(current => current.some(animal => animal.uuid === saved.uuid) ? current.map(animal => animal.uuid === saved.uuid ? saved : animal) : [...current, saved]);
      setEditing(null); setNotice("Паспорт сохранён");
    }} /> : <Button disabled={loading || Boolean(error)} onClick={() => { setEditing("new"); setNotice(""); }}>Добавить животное</Button>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section>;
}
