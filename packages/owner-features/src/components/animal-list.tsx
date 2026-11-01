"use client";
import * as React from "react";
import { Button } from "@vetdietderm/ui/button";
import { ownerError, ownerRequest, type AnimalPassport } from "../api";
import { sexLabel, speciesLabel } from "../domain";
import { CabinetIcon, PetAvatar, PetPattern } from "./cabinet-visuals";
import { AnimalForm } from "./animal-form";
import { AnimalChat } from "./animal-chat";
import { AnimalFiles } from "./animal-files";
import { PassportDocuments, PassportPhoto } from "./passport-media";
import { OwnerDialog } from "./owner-dialog";
import { AnimalVisits } from "./visit-request-form";
import type { CabinetSection } from "./cabinet-home";

export function AnimalList({ linked, hasDoctor = true, doctorName, section = "pets", onSection }: { linked: boolean; hasDoctor?: boolean; doctorName?: string; section?: CabinetSection; onSection?: (section: CabinetSection) => void }) {
  const [animals, setAnimals] = React.useState<AnimalPassport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [editing, setEditing] = React.useState<AnimalPassport | "new" | null>(null);
  const [editingBusy, setEditingBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [selectedId, setSelectedId] = React.useState("");
  const selectorId = React.useId();
  const selected = animals.find(animal => animal.uuid === selectedId) ?? animals[0];
  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try { setAnimals(await ownerRequest<AnimalPassport[]>("/animals")); }
    catch (cause) { setError(ownerError(cause)); } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  const openPassport = (animal: AnimalPassport) => { setSelectedId(animal.uuid); onSection?.("passport"); };
  return <section className={`owner-animal-content ${section === "home" ? "owner-home-content" : ""}`} aria-label="Питомец и его данные">
    {section === "home" && animals.length > 0 && <div className="pet-hero"><PetPattern /><div className="pet-avatar-row" aria-label="Выберите питомца">{animals.map(animal => <button type="button" key={animal.uuid} className="pet-hero-choice" aria-pressed={selected?.uuid === animal.uuid} onClick={() => setSelectedId(animal.uuid)}><PetAvatar name={animal.name} photoUrl={animal.photo_url} /><span>{animal.name}</span></button>)}</div></div>}
    {section !== "home" && section !== "profile" && <div className="owner-page-heading">{section === "passport" && <button type="button" className="owner-icon-button" aria-label="Вернуться к питомцам" onClick={() => onSection?.("pets")}><CabinetIcon name="back" /></button>}<div><h1>{section === "pets" ? "Мои питомцы" : section === "passport" ? "Паспорт питомца" : section === "results" ? "Результаты приёмов" : section === "chat" ? "Сообщения" : "Консультации"}</h1>{section === "pets" && <p>Паспорта, здоровье и документы ваших животных.</p>}</div></div>}
    {!["home", "pets", "passport", "profile"].includes(section) && animals.length > 0 && <div className="owner-pet-selector"><label htmlFor={selectorId}>Питомец</label><select id={selectorId} value={selected?.uuid ?? ""} onChange={event => { setSelectedId(event.target.value); setNotice(""); }}>{animals.map(animal => <option key={animal.uuid} value={animal.uuid}>{animal.name} · {speciesLabel(animal.species)}</option>)}</select></div>}
    {loading && <p role="status">Загрузка животных…</p>}
    {error && <div className="space-y-2"><p role="alert" className="text-destructive">{error}</p><Button variant="outline" disabled={loading} onClick={() => void load()}>Повторить загрузку</Button></div>}
    {!loading && !error && animals.length === 0 && <div className="owner-card owner-inline-empty"><CabinetIcon name="paw" /><p>Пока нет животных. Добавьте первого питомца, чтобы заполнить его паспорт.</p></div>}
    {section === "pets" && animals.map(animal => <article className="owner-card pet-list-card" key={animal.uuid}><div className="pet-overview"><PetAvatar name={animal.name} photoUrl={animal.photo_url} /><div><h2>{animal.name}</h2><p>{speciesLabel(animal.species)} · {animal.breed || "Порода не указана"}</p><span className="owner-pill"><CabinetIcon name="paw" size={16} />{speciesLabel(animal.species)}</span></div></div><dl className="owner-meta-grid"><div><dt>Пол</dt><dd>{sexLabel(animal.sex ?? "unspecified")}</dd></div><div><dt>Дата рождения</dt><dd>{animal.birth_date ? animal.birth_date.split("-").reverse().join(".") : "Не указана"}</dd></div></dl><Button className="w-full min-h-12" onClick={() => openPassport(animal)}>Открыть паспорт<CabinetIcon name="arrow" size={18} /></Button></article>)}
    {!loading && !error && selected && <div key={selected.uuid} className="owner-selected-content">
      {section === "passport" && <><PassportPhoto animal={selected} onPhoto={url => setAnimals(current => current.map(animal => animal.uuid === selected.uuid ? { ...animal, photo_url: url } : animal))} /><div className="owner-section-heading"><h2>Основные данные</h2><Button variant="ghost" onClick={() => setEditing(selected)}><CabinetIcon name="edit" size={18} />Изменить</Button></div><dl className="owner-card owner-meta-grid"><div><dt>Кличка</dt><dd>{selected.name}</dd></div><div><dt>Вид</dt><dd>{speciesLabel(selected.species)}</dd></div><div><dt>Порода</dt><dd>{selected.breed || "Не указана"}</dd></div><div><dt>Пол</dt><dd>{sexLabel(selected.sex ?? "unspecified")}</dd></div><div><dt>Дата рождения</dt><dd>{selected.birth_date ? selected.birth_date.split("-").reverse().join(".") : "Не указана"}</dd></div></dl><PassportDocuments animalId={selected.uuid} /><section className="owner-card"><h2>Медицинские документы</h2><AnimalFiles animalId={selected.uuid} linked={linked} /><Button variant="secondary" className="w-full" onClick={() => onSection?.("results")}>Результаты приёмов<CabinetIcon name="arrow" size={18} /></Button></section><section className="owner-card"><h2>Есть вопрос о здоровье?</h2><p>Свяжитесь с ветеринаром, чтобы уточнить информацию о питомце.</p><Button variant="secondary" className="w-full" onClick={() => onSection?.("chat")}><CabinetIcon name="chat" />Написать врачу</Button></section></>}
      {section === "chat" && (hasDoctor ? <AnimalChat path={`/owner/animals/${selected.uuid}/chat`} animalId={selected.uuid} animalName={selected.name} doctorName={doctorName} ownerView /> : <p className="owner-card">Подключите врача в разделе «Профиль», чтобы начать переписку.</p>)}
      {(section === "home" || section === "visits" || section === "results") && (hasDoctor ? <AnimalVisits animalId={selected.uuid} animalName={selected.name} doctorName={doctorName} animals={animals} onSelectAnimal={setSelectedId} home={section === "home"} onSection={onSection} resultsOnly={section === "results"} onChat={() => onSection?.("chat")} /> : <p className="owner-card">Подключите врача в разделе «Профиль», чтобы записываться на консультации и получать результаты.</p>)}
    </div>}
    {section === "home" && selected && <section className="owner-useful"><h2>Полезное</h2><div className="cabinet-quick-actions"><button type="button" onClick={() => onSection?.("chat")}><span className="owner-quick-icon"><CabinetIcon name="chat" /></span><strong>Написать врачу</strong><span>Задать вопрос</span></button><button type="button" onClick={() => openPassport(selected)}><span className="owner-quick-icon"><CabinetIcon name="file" /></span><strong>Паспорт</strong><span>Данные и документы</span></button></div></section>}
    {(section === "pets" || (!loading && !error && animals.length === 0)) && <Button variant="secondary" className="w-full min-h-12" disabled={loading || Boolean(error)} onClick={() => { setEditing("new"); setNotice(""); }}><CabinetIcon name="plus" />Добавить животное</Button>}
    {editing && <OwnerDialog busy={editingBusy} title={editing === "new" ? "Новый питомец" : "Изменить паспорт"} onClose={() => setEditing(null)}><AnimalForm onBusyChange={setEditingBusy} key={editing === "new" ? "new" : editing.uuid} animal={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={saved => {
      setAnimals(current => current.some(animal => animal.uuid === saved.uuid) ? current.map(animal => animal.uuid === saved.uuid ? saved : animal) : [...current, saved]); setSelectedId(saved.uuid); setEditing(null); setNotice("Паспорт сохранён"); onSection?.("passport");
    }} /></OwnerDialog>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
