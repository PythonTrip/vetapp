"use client";

import * as React from "react";
import { Button } from "@vetdietderm/ui/button";
import { ownerError, ownerRequest, type AnimalPassport } from "../api";
import { sexLabel, speciesLabel } from "../domain";
import { CabinetIcon, PetAvatar, PetPattern } from "./cabinet-visuals";
import { AnimalForm } from "./animal-form";
import { AnimalChat } from "./animal-chat";
import { AnimalFiles } from "./animal-files";
import { AnimalVisits } from "./visit-request-form";
import type { CabinetSection } from "./cabinet-home";

export function AnimalList({ linked, hasDoctor = true, doctorName, section = "pets", onSection }: { linked: boolean; hasDoctor?: boolean; doctorName?: string; section?: CabinetSection; onSection?: (section: CabinetSection) => void }) {
  const [animals, setAnimals] = React.useState<AnimalPassport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [editing, setEditing] = React.useState<AnimalPassport | "new" | null>(null);
  const [notice, setNotice] = React.useState("");
  const [selectedId, setSelectedId] = React.useState("");
  const selectorId = React.useId();
  const selected = animals.find(animal => animal.uuid === selectedId) ?? animals[0];
  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try { setAnimals(await ownerRequest<AnimalPassport[]>("/animals")); }
    catch (cause) { setError(ownerError(cause)); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  return <section className={`min-w-0 pb-6 ${section === "home" ? "space-y-3" : "space-y-5"}`} aria-label="Питомец и его данные">
    {section === "home" && animals.length > 0 && <div className="pet-hero"><PetPattern /><div className="pet-avatar-row" aria-label="Выберите питомца">{animals.map(animal => <button type="button" key={animal.uuid} className="pet-hero-choice" aria-pressed={selected?.uuid === animal.uuid} onClick={() => { setSelectedId(animal.uuid); setEditing(null); }}><PetAvatar name={animal.name} /><span>{animal.name}</span></button>)}</div></div>}
    {section !== "home" && animals.length > 0 && <div className="animal-selector flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2"><label htmlFor={selectorId} className="text-sm font-medium">Питомец</label>
        <select id={selectorId} value={selected?.uuid ?? ""} onChange={event => { setSelectedId(event.target.value); setEditing(null); setNotice(""); }} className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-base">
          {animals.map(animal => <option key={animal.uuid} value={animal.uuid}>{animal.name} · {speciesLabel(animal.species)}</option>)}
        </select>
      </div>
      {section !== "pets" && <Button type="button" variant="outline" onClick={() => onSection?.("pets")}>Паспорт питомца</Button>}
    </div>}
    {section !== "home" && <h2 className="text-xl font-semibold">{section === "pets" ? "Мои животные" : section === "results" ? "Результаты приёмов" : section === "chat" ? "Сообщения врачу" : "Консультации"}</h2>}
    {loading && <p role="status">Загрузка животных…</p>}
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" disabled={loading} onClick={() => void load()}>Повторить загрузку</Button></div>}
    {!loading && !error && animals.length === 0 && <p className="text-sm text-muted-foreground">Пока нет животных. Добавьте первое животное, чтобы заполнить его паспорт.</p>}
    {!loading && !error && selected && <div key={selected.uuid} className="min-w-0 space-y-5">
      {section === "pets" && <>
      <div className="space-y-4">
      <h3 className="break-words font-semibold">{selected.name}</h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Вид</dt><dd>{speciesLabel(selected.species)}</dd>
        <dt className="text-muted-foreground">Порода</dt><dd className="break-words">{selected.breed || "Не указана"}</dd>
        <dt className="text-muted-foreground">Пол</dt><dd>{sexLabel(selected.sex ?? "unspecified")}</dd>
        <dt className="text-muted-foreground">Дата рождения</dt><dd>{selected.birth_date ? selected.birth_date.split("-").reverse().join(".") : "Не указана"}</dd>
      </dl>
      <Button variant="outline" disabled={editing !== null} onClick={() => { setEditing(selected); setNotice(""); }}>Редактировать паспорт</Button>
      </div>
      <AnimalFiles animalId={selected.uuid} linked={linked} />
      </>}
      {section === "chat" && (hasDoctor ? <AnimalChat path={`/owner/animals/${selected.uuid}/chat`} ownerView /> : <p className="text-sm text-muted-foreground">Подключите врача в разделе «Профиль», чтобы начать переписку.</p>)}
      {(section === "home" || section === "visits" || section === "results") && (hasDoctor ? <AnimalVisits animalId={selected.uuid} animalName={selected.name} doctorName={doctorName} animals={animals} onSelectAnimal={setSelectedId} home={section === "home"} onSection={onSection} resultsOnly={section === "results"} onChat={() => onSection?.("chat")} /> : <p className="text-sm text-muted-foreground">Подключите врача в разделе «Профиль», чтобы записываться на консультации и получать результаты.</p>)}
    </div>}
    {section === "home" && <div className="cabinet-quick-actions"><button type="button" onClick={() => onSection?.("results")}><CabinetIcon name="file" /><span>Медкарта</span></button><button type="button" onClick={() => onSection?.("chat")}><CabinetIcon name="chat" /><span>Сообщения врачу</span></button></div>}
    {editing ? <AnimalForm key={editing === "new" ? "new" : editing.uuid} animal={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={saved => {
      setAnimals(current => current.some(animal => animal.uuid === saved.uuid) ? current.map(animal => animal.uuid === saved.uuid ? saved : animal) : [...current, saved]);
      setSelectedId(saved.uuid); setEditing(null); setNotice("Паспорт сохранён");
    }} /> : (section === "pets" || animals.length === 0) && <Button disabled={loading || Boolean(error)} onClick={() => { setEditing("new"); setNotice(""); }}>Добавить животное</Button>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section>;
}
