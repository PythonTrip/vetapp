"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEX_OPTIONS, SPECIES_OPTIONS } from "@/lib/patient-form";
import { ownerError, ownerRequest, type AnimalPassport } from "@/lib/owner-api";

export function AnimalForm({ animal, onSaved, onCancel }: { animal?: AnimalPassport; onSaved: (value: AnimalPassport) => void; onCancel: () => void }) {
  const [species, setSpecies] = React.useState(animal?.species ?? "dog");
  const [sex, setSex] = React.useState(animal?.sex ?? "unspecified");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const saved = await ownerRequest<AnimalPassport>(animal ? `/animals/${animal.uuid}` : "/animals", animal ? "PATCH" : "POST", {
        name: data.get("name"), species, breed: data.get("breed"), sex, birth_date: data.get("birth_date") || null,
      });
      onSaved(saved);
    } catch (cause) { setError(ownerError(cause)); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <h3 className="text-lg font-semibold">{animal ? "Редактировать паспорт" : "Добавить животное"}</h3>
    <div className="space-y-2"><Label htmlFor="animal-name">Кличка</Label><Input id="animal-name" name="name" required maxLength={255} defaultValue={animal?.name} disabled={busy} /></div>
    <div className="space-y-2"><Label htmlFor="animal-species">Вид</Label><Select value={species} onValueChange={value => setSpecies(value as AnimalPassport["species"])} disabled={busy}><SelectTrigger id="animal-species"><SelectValue /></SelectTrigger><SelectContent>{SPECIES_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-2"><Label htmlFor="animal-breed">Порода</Label><Input id="animal-breed" name="breed" maxLength={255} defaultValue={animal?.breed} disabled={busy} /></div>
    <div className="space-y-2"><Label htmlFor="animal-sex">Пол</Label><Select value={sex} onValueChange={value => setSex(value as NonNullable<AnimalPassport["sex"]>)} disabled={busy}><SelectTrigger id="animal-sex"><SelectValue /></SelectTrigger><SelectContent>{SEX_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-2"><Label htmlFor="animal-birth">Дата рождения</Label><Input id="animal-birth" name="birth_date" type="date" defaultValue={animal?.birth_date ?? ""} disabled={busy} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy}>{busy ? "Сохранение…" : "Сохранить животное"}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Отмена</Button></div>
  </form>;
}
