"use client";

import * as React from "react";
import { useOwnerPlatform } from "../platform";
import { Button } from "@vetdietderm/ui/button";
import { Input } from "@vetdietderm/ui/input";
import { Textarea } from "@vetdietderm/ui/textarea";
import type { BookableVisitType } from "../domain";
import { BOOKABLE_VISIT_TYPES, VISIT_TYPE_LABELS, VISIT_STATUS_LABELS, VISIT_STATUS_STYLES, consultationState, speciesLabel } from "../domain";
import { formatDateTime } from "@vetdietderm/ui/date-time";
import { visitAnswerLabel, ownerError, ownerVisits, ownerFiles, type AnimalPassport, type OwnerVisit, type VisitAnswerValue, type VisitFile, type VisitQuestion, type VisitStatus } from "../api";

export const OWNER_VISIT_STATUS_LABELS: Record<VisitStatus, string> = VISIT_STATUS_LABELS;
import { BookingSheet } from "./booking-sheet";
import { BookingDatePicker } from "./booking-date-picker";
import { CabinetIcon, PetAvatar } from "./cabinet-visuals";
import type { CabinetSection } from "./cabinet-home";

const selectClass = "min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";
const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

function hasAnswer(question: VisitQuestion, value: VisitAnswerValue | undefined) {
  if (question.kind === "multi_select") return Array.isArray(value) && value.length > 0;
  if (question.kind === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "string" && value.trim().length > 0;
}

function QuestionField({ question, value, onChange }: { question: VisitQuestion; value: VisitAnswerValue | undefined; onChange: (value: VisitAnswerValue) => void }) {
  const id = React.useId();
  if (question.kind === "multi_select") return <fieldset className="min-w-0 space-y-2">
    <legend className="break-words text-sm font-medium">{question.label} *</legend>
    {(question.options ?? []).map(option => <label key={option.value} className="flex items-start gap-2 break-words text-sm">
      <input type="checkbox" className="mt-1" checked={Array.isArray(value) && value.includes(option.value)} onChange={event => {
        const current = Array.isArray(value) ? value : [];
        onChange(event.target.checked ? [...current, option.value] : current.filter(item => item !== option.value));
      }} />{option.label}
    </label>)}
  </fieldset>;
  return <div className="min-w-0 space-y-1">
    <label htmlFor={id} className="break-words text-sm font-medium">{question.label} *</label>
    {question.kind === "binary" || question.kind === "single_select" ? <select id={id} required className={selectClass} value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)}>
      <option value="">Выберите ответ</option>
      {(question.kind === "binary" ? [{ value: "yes", label: "Да" }, { value: "no", label: "Нет" }] : question.options ?? []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select> : question.kind === "text" ? <Textarea id={id} required maxLength={4000} value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} /> :
      <Input id={id} required type={question.kind === "date" ? "date" : "number"} step={question.kind === "number" ? "any" : undefined} value={typeof value === "number" || typeof value === "string" ? value : ""} onChange={event => onChange(question.kind === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} />}
  </div>;
}

export function VisitRequestForm({ animalId, animalName, animals, doctorName, onChanged, onClose, onBusyChange }: { animalId: string; animalName?: string; animals?: AnimalPassport[]; doctorName?: string; onChanged: () => void; onClose: (animalId?: string) => void; onBusyChange?: (busy: boolean) => void }) {
  const [chosenAnimalId, setChosenAnimalId] = React.useState(animalId);
  const chosenAnimalName = animals?.find(animal => animal.uuid === chosenAnimalId)?.name ?? animalName;
  const id = React.useId();
  const [type, setType] = React.useState<BookableVisitType>("primary");
  const [questions, setQuestions] = React.useState<VisitQuestion[]>([]);
  const [answers, setAnswers] = React.useState<Record<string, VisitAnswerValue>>({});
  const [startsAt, setStartsAt] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [questionError, setQuestionError] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);
  const [step, setStep] = React.useState(0);
  const [sent, setSent] = React.useState(false);
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { titleRef.current?.focus(); }, [step]);
  React.useEffect(() => {
    let active = true;
    setLoading(true); setQuestionError(""); setAnswers({});
    ownerVisits.questions(type).then(result => { if (active) setQuestions(result); }).catch(cause => { if (active) setQuestionError(ownerError(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, reload]);
  const validTime = Boolean(startsAt) && Number.isFinite(new Date(startsAt).getTime());
  const ready = !loading && !questionError && validTime && questions.every(q => hasAnswer(q, answers[q.uuid]));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || (!createdId && !ready)) return;
    setBusy(true); onBusyChange?.(true); setError("");
    let requestId = createdId;
    try {
      if (!requestId) {
        const visit = await ownerVisits.create(chosenAnimalId, { visit_type: type, proposed_starts_at: new Date(startsAt).toISOString(), answers: questions.map(q => ({ question_id: q.uuid, value: answers[q.uuid] })) });
        requestId = visit.uuid; setCreatedId(visit.uuid); onChanged();
      }
      // Remove successful uploads immediately. Retrying a failed upload never
      // creates another request or re-sends earlier successful files.
      for (const file of files) {
        await ownerVisits.upload(requestId, file);
        setFiles(current => current.filter(item => item !== file));
      }
      onChanged(); setSent(true);
    } catch (cause) {
      setError(`${requestId ? "Заявка создана, но не все файлы прикреплены. Повторите загрузку. " : ""}${ownerError(cause)}`);
      onChanged();
    } finally { setBusy(false); onBusyChange?.(false); }
  }
  if (sent) return <section className="space-y-4 rounded-xl bg-accent p-5" aria-label="Заявка отправлена"><h3 className="text-lg font-semibold" tabIndex={-1} ref={node => node?.focus()}>Заявка отправлена</h3><p className="text-sm">{chosenAnimalName && `${chosenAnimalName} · `}{formatDateTime(new Date(startsAt).toISOString())}</p><p className="text-sm">Ожидает подтверждения. Врач рассмотрит анкету и подтвердит время. Статус и окончательное время появятся в разделе «Консультации».</p><Button type="button" onClick={() => onClose(chosenAnimalId)}>К консультациям</Button></section>;
  return <form onSubmit={event => { event.preventDefault(); if (step === 4 || createdId) void submit(event); }} className="booking-form min-w-0 space-y-5">
      {step > 0 && !createdId && <Button type="button" variant="outline" className="booking-back" aria-label="Назад" disabled={busy} onClick={() => setStep(value => value - 1)}><CabinetIcon name="back" /><span>Назад</span></Button>}
    <p className="booking-progress" role="status">Шаг {step + 1} из 5</p>
    <h3 className="booking-title" tabIndex={-1} ref={titleRef}>{["Кому нужна консультация?", "Расскажите о питомце", "Выберите ветеринара", "Выберите дату и время", "Подтвердите заявку"][step]}</h3>
    <p className="booking-subtitle">{["Выберите питомца и тип приёма", "Заполните анкету перед приёмом", "Консультация с врачом вашего кабинета", "Предложите удобное время для консультации", "Проверьте данные перед отправкой врачу"][step]}</p>
    <fieldset disabled={busy || createdId !== null} className="min-w-0 space-y-3">
      <div hidden={step !== 0} className="space-y-4">
      {animals?.length ? <fieldset className="booking-pets"><legend>Питомец</legend><div>{animals.map(animal => <label key={animal.uuid} className="booking-pet"><PetAvatar name={animal.name} small /><span className="booking-pet-details"><strong>{animal.name}</strong><small>{speciesLabel(animal.species)}</small></span><input type="radio" name={`${id}-pet`} value={animal.uuid} aria-label={animal.name} checked={chosenAnimalId === animal.uuid} onChange={() => setChosenAnimalId(animal.uuid)} /></label>)}</div></fieldset> : animalName && <p className="booking-context"><CabinetIcon name="paw" />{animalName}</p>}
      <div className="space-y-1"><label htmlFor={`${id}-type`} className="text-sm font-medium">Тип визита</label>
        <select id={`${id}-type`} className="sr-only" tabIndex={-1} value={type} onChange={event => { setLoading(true); setType(event.target.value as BookableVisitType); }}>
          {BOOKABLE_VISIT_TYPES.map(value => <option key={value} value={value}>{VISIT_TYPE_LABELS[value]}</option>)}
        </select>
        <div className="booking-reasons" role="group" aria-label="Тип обращения">{BOOKABLE_VISIT_TYPES.map(value => <button type="button" key={value} aria-pressed={type === value} onClick={() => { if (value !== type) { setLoading(true); setType(value); } }}><span className="reason-icon"><CabinetIcon name={value === "primary" ? "doctor" : value === "secondary" ? "calendar" : value === "consultation" ? "chat" : "file"} /></span><span><strong>{VISIT_TYPE_LABELS[value]}</strong><small>{{ primary: "Первое обращение по проблеме", secondary: "Контроль состояния после приёма", consultation: "Вопросы о здоровье и уходе", supervision: "Наблюдение и сопровождение лечения" }[value]}</small></span><span className="reason-check">{type === value && <CabinetIcon name="check" size={14} />}</span></button>)}</div>
      </div>
      </div>
      <div hidden={step !== 1} className="space-y-4">
      {loading && <p role="status" className="text-sm">Загрузка анкеты…</p>}
      {questionError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{questionError}</p><Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>Повторить загрузку анкеты</Button></div>}
      {!loading && !questionError && (questions.length ? <><p className="text-sm text-muted-foreground">Все вопросы обязательны</p>{questions.map(question => <QuestionField key={question.uuid} question={question} value={answers[question.uuid]} onChange={value => setAnswers(current => ({ ...current, [question.uuid]: value }))} />)}</> : <p className="text-sm text-muted-foreground">Для этого типа визита анкета не требуется.</p>)}
      </div>
      <div hidden={step !== 2} className="space-y-4">
        <fieldset><legend className="booking-label">Ветеринар вашего кабинета</legend><label className="booking-doctor"><input type="radio" checked readOnly name={`${id}-doctor`} /><span className="doctor-initials" aria-hidden="true">{doctorName ? doctorName.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]).join("") : <CabinetIcon name="doctor" />}</span><span><strong>{doctorName || "Подключённый врач"}</strong><small>Врач рассмотрит вашу заявку</small></span><CabinetIcon name="check" /></label></fieldset>
        <p className="booking-context"><CabinetIcon name="doctor" />Переписка, фото и рекомендации — в чате с врачом. Доступен врач, подключённый к вашему кабинету.</p>
      </div>
      <div hidden={step !== 3} className="space-y-4">
      <BookingDatePicker id={`${id}-time`} value={startsAt} onChange={setStartsAt} />
      <div className="min-w-0 space-y-1"><label htmlFor={`${id}-files`} className="text-sm font-medium">Фото и документы</label>
        <Input id={`${id}-files`} className="h-auto min-w-0 py-2" type="file" multiple accept={allowedTypes.join(",")} onChange={event => {
          const selected = Array.from(event.target.files ?? []);
          if (selected.some(file => !allowedTypes.includes(file.type) || file.size === 0 || file.size > 8 * 1024 * 1024)) {
            setError("Выберите непустые JPEG, PNG, WebP, GIF или PDF, каждый не больше 8 МБ.");
            event.target.value = ""; setFiles([]); return;
          }
          setFiles(selected); setError("");
        }} />
        <p className="text-xs text-muted-foreground">JPEG, PNG, WebP, GIF или PDF, до 8 МБ каждый.</p>
      </div>
      </div>
    </fieldset>
    {step === 4 && <div className="space-y-3 text-sm"><h4 className="font-semibold">Проверьте перед отправкой</h4><p>{chosenAnimalName ? `${chosenAnimalName} · ` : ""}{VISIT_TYPE_LABELS[type]}</p>{doctorName && <p>{doctorName}</p>}<p>Предложено: {formatDateTime(new Date(startsAt).toISOString())}</p><dl className="space-y-2">{questions.map(q => <div key={q.uuid}><dt className="font-medium">{q.label}</dt><dd className="whitespace-pre-wrap break-words">{visitAnswerLabel({ ...q, question_id: q.uuid, value: answers[q.uuid] })}</dd></div>)}</dl></div>}
    {files.length > 0 && <ul className="space-y-1 text-sm">{files.map((file, index) => <li key={`${file.name}-${index}`} className="break-words">{file.name}</li>)}</ul>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <div className="booking-footer flex flex-col gap-2">
      {(step === 4 || createdId) ? <Button key="send" type="submit" disabled={busy || (!createdId && !ready)}>{busy ? "Отправка…" : createdId ? "Повторить загрузку файлов" : "Отправить заявку"}</Button> : <Button key="continue" className="booking-next" type="button" disabled={busy || (step === 1 ? loading || Boolean(questionError) || !questions.every(q => hasAnswer(q, answers[q.uuid])) : step === 3 ? !validTime : false)} onClick={event => { event.preventDefault(); setStep(value => value + 1); }}>Продолжить<CabinetIcon name="arrow" size={18} /></Button>}
      <Button type="button" variant="outline" className="booking-cancel" disabled={busy} onClick={() => onClose(createdId ? chosenAnimalId : undefined)}>{createdId ? "Закрыть — заявка уже создана" : "Отмена"}</Button>
      {step === 1 && !createdId && !loading && !questionError && <Button type="button" variant="ghost" className="booking-refresh" disabled={busy} onClick={() => setReload(value => value + 1)}>Обновить анкету</Button>}
    </div>
  </form>;
}

export function AnimalVisits({ animalId, animalName, doctorName, animals, home = false, onSection, onSelectAnimal, resultsOnly = false, onChat }: { animalId: string; animalName?: string; doctorName?: string; animals?: AnimalPassport[]; home?: boolean; onSection?: (section: CabinetSection) => void; onSelectAnimal?: (id: string) => void; resultsOnly?: boolean; onChat?: () => void }) {
  const platform = useOwnerPlatform();
  const [visits, setVisits] = React.useState<OwnerVisit[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [bookingBusy, setBookingBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [now, setNow] = React.useState(Date.now);
  const generation = React.useRef(0);
  const previous = React.useRef<string | null>(null);
  const load = React.useCallback(async (background = false) => {
    const current = ++generation.current;
    if (!background) setLoading(true); setError("");
    try { const result = await ownerVisits.list(animalId); if (generation.current === current) {
      const signature = JSON.stringify(result.map(visit => [visit.uuid, visit.status, visit.confirmed_starts_at, visit.encounter_status, visit.result_files?.map(file => file.uuid)]));
      if (previous.current !== null && previous.current !== signature) setNotice("Данные консультаций обновлены. Проверьте время, статус и доступные результаты.");
      previous.current = signature; setVisits(result);
    } }
    catch (cause) { if (generation.current === current) setError(ownerError(cause)); }
    finally { if (generation.current === current) setLoading(false); }
  }, [animalId]);
  React.useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  React.useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()); if (!document.hidden) void load(true); }, 30_000);
    const refresh = () => { if (!document.hidden) { setNow(Date.now()); void load(true); } };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); };
  }, [load]);
  async function change(visit: OwnerVisit, action: "withdraw" | "cancel") {
    if (busy) return;
    setBusy(true); setError("");
    try { await ownerVisits.change(visit.uuid, action); setNotice(action === "withdraw" ? "Заявка отозвана" : "Визит отменён"); await load(); }
    catch (cause) { await load(); setError(ownerError(cause)); }
    finally { setBusy(false); }
  }
  async function download(visit: OwnerVisit, file: VisitFile) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const blob = await ownerVisits.download(visit.uuid, file.uuid);
      await platform.saveFile(blob, `файл.${file.content_type === "application/pdf" ? "pdf" : file.content_type.split("/")[1]}`);
    } catch (cause) { setError(ownerError(cause)); }
    finally { setBusy(false); }
  }
  const finished = (visit: OwnerVisit) => visit.status === "completed" || (visit.status === "scheduled" && visit.encounter_status === "completed");
  const active = (visit: OwnerVisit) => visit.status === "requested" || (visit.status === "scheduled" && !finished(visit));
  const running = (visit: OwnerVisit) => visit.status === "scheduled" && visit.encounter_status === "in_progress";
  const groups = resultsOnly ? [{ title: "Завершённые консультации", rows: visits.filter(finished) }] : [
    { title: "Сейчас идёт консультация", rows: visits.filter(running) },
    { title: "Предстоящие и заявки", rows: visits.filter(visit => active(visit) && !running(visit)).sort((a, b) => new Date(a.confirmed_starts_at ?? a.proposed_starts_at).getTime() - new Date(b.confirmed_starts_at ?? b.proposed_starts_at).getTime()) },
    { title: "История консультаций", rows: visits.filter(visit => !active(visit)) },
  ];
  async function downloadResult(visit: OwnerVisit, file: NonNullable<OwnerVisit["result_files"]>[number]) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const blob = await ownerFiles.download(file.uuid);
      const name = (file.caption || "Результат приёма").replace(/[\\/:*?"<>|]+/g, " ");
      const ext = file.content_type === "application/pdf" ? "pdf" : file.content_type.split("/")[1];
      const context = `${animalName || "Питомец"}_${(visit.confirmed_starts_at || visit.proposed_starts_at).slice(0, 10)}`.replace(/[\\/:*?"<>|]+/g, " ");
      await platform.saveFile(blob, `${context}_${name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`}`);
    } catch (cause) { setError(ownerError(cause)); } finally { setBusy(false); }
  }
  const booking = open && <BookingSheet busy={bookingBusy} onClose={() => setOpen(false)}><VisitRequestForm animalId={animalId} animalName={animalName} animals={animals} doctorName={doctorName} onBusyChange={setBookingBusy} onChanged={() => void load(true)} onClose={id => { setOpen(false); if (id) onSelectAnimal?.(id); }} /></BookingSheet>;
  if (home) {
    const pending = visits.filter(active).sort((a, b) => Number(running(b)) - Number(running(a)) || new Date(a.confirmed_starts_at || a.proposed_starts_at).getTime() - new Date(b.confirmed_starts_at || b.proposed_starts_at).getTime());
    const current = pending[0];
    const currentState = current && consultationState(current.status, current.confirmed_starts_at, current.encounter_status, now);
    return <section className="owner-dashboard" aria-label="Консультации питомца">
      {booking}
      <section className="home-booking-section"><h2>Запись к ветеринару</h2><div className="home-booking-card"><div className="home-booking-intro"><span><CabinetIcon name="calendar" size={25} /></span><div><h3>Запланируйте приём</h3><p>Выберите удобное время</p></div></div><Button type="button" className="w-full min-h-12" onClick={() => setOpen(true)}>Записаться к врачу<CabinetIcon name="arrow" size={19} /></Button></div></section>
      <div className="dashboard-section-heading"><h2>Текущая консультация</h2><button type="button" disabled={loading || busy} onClick={() => void load()}>Обновить</button></div>
      {loading && <p role="status">Загрузка консультаций…</p>}
      {error && <div className="space-y-2"><p role="alert" className="text-destructive">{error}</p><Button variant="outline" disabled={loading} onClick={() => void load()}>Повторить загрузку</Button></div>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {current && currentState ? <article className="current-consultation">
        <div className="consultation-meta"><span className="consultation-status"><span aria-hidden="true" className="status-dot" />{currentState.label}</span>{current.duration_min != null && <span>{current.duration_min} мин</span>}</div>
        <h3>{animalName} · {VISIT_TYPE_LABELS[current.visit_type]}</h3>
        <p>{running(current) ? "Откройте переписку с врачом." : currentState.next}</p>
        {!running(current) && <p className="consultation-date">{formatDateTime(current.confirmed_starts_at || current.proposed_starts_at)}</p>}
        <div className="current-consultation-footer"><span className="doctor-byline"><span className="doctor-avatar"><CabinetIcon name="doctor" size={18} /></span>{doctorName}</span><Button type="button" onClick={running(current) ? onChat : () => onSection?.("visits")}>{running(current) ? "Войти в чат" : "Подробнее"}<CabinetIcon name="arrow" size={18} /></Button></div>
      </article> : !loading && !error && <div className="dashboard-empty"><CabinetIcon name="calendar" /><h3>Новых консультаций пока нет</h3><p>Запишитесь к ветеринару, когда понадобится помощь.</p></div>}
      {pending.length > 1 && <>
      <div className="dashboard-section-heading"><h2>Предстоящие записи</h2><button type="button" onClick={() => onSection?.("visits")}>Все <CabinetIcon name="arrow" size={16} /></button></div>
      {pending.filter(visit => visit !== current).slice(0, 2).map(visit => <button key={visit.uuid} type="button" className="upcoming-visit" onClick={() => onSection?.("visits")}><span className="visit-calendar"><CabinetIcon name="calendar" /></span><span><strong>{VISIT_TYPE_LABELS[visit.visit_type]}</strong><small>{animalName} · {doctorName}</small><small className="sr-only">{formatDateTime(visit.confirmed_starts_at || visit.proposed_starts_at)}</small></span><span className="upcoming-visit-end"><small>{new Date(visit.confirmed_starts_at || visit.proposed_starts_at).toLocaleString("ru", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small><span className="visit-status-chip">{consultationState(visit.status, visit.confirmed_starts_at, visit.encounter_status, now).label}</span></span></button>)}
      </>}
      {visits.length > 0 && <button type="button" className="finished-result-link" onClick={() => onSection?.("visits")}>Все консультации<CabinetIcon name="arrow" size={18} /></button>}
      {visits.some(finished) && <button type="button" className="finished-result-link" onClick={() => onSection?.("results")}><CabinetIcon name="file" /><span>Результаты завершённых приёмов</span><CabinetIcon name="arrow" size={18} /></button>}
    </section>;
  }
  return <section className="min-w-0 space-y-5">
    {booking}
    {!resultsOnly && <Button type="button" variant={visits.some(running) ? "outline" : "default"} className="min-h-12 w-full sm:w-auto" onClick={() => setOpen(true)}>Запросить визит</Button>}
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Статусы обновляются автоматически каждые 30 секунд.</p><Button type="button" variant="ghost" disabled={busy || loading} onClick={() => void load()}>Обновить визиты</Button></div>
    {resultsOnly && <p className="text-sm text-muted-foreground">Те же документы, что в карточках завершённых консультаций. Они сгруппированы по приёмам выбранного питомца.</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {loading && <p role="status" className="text-sm">Загрузка визитов…</p>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    {!loading && !error && (resultsOnly ? !visits.some(finished) : visits.length === 0) && <div className="space-y-2 rounded-xl bg-muted/50 p-5"><p className="font-medium">{resultsOnly ? "Завершённых консультаций пока нет" : "Вы ещё не запрашивали визиты."}</p><p className="text-sm text-muted-foreground">{resultsOnly ? "Здесь будут результаты завершённых приёмов, которыми врач поделился с вами." : "Выберите тип обращения, заполните анкету и предложите удобное время."}</p></div>}
    {groups.filter(group => group.rows.length > 0).map(group => <section key={group.title} className="space-y-3"><h3 className="text-base font-semibold">{group.title}</h3><ul className="space-y-4">{group.rows.map(visit => { const state = consultationState(visit.status, visit.confirmed_starts_at, visit.encounter_status, now); return <li key={visit.uuid} className={`min-w-0 space-y-4 rounded-xl border p-4 text-sm sm:p-5 ${running(visit) ? "border-primary bg-accent/50" : "bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-semibold">{VISIT_TYPE_LABELS[visit.visit_type]}{animalName ? ` · ${animalName}` : ""}</h4><span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${VISIT_STATUS_STYLES[state.tone]}`}>{state.label}</span></div>
      {running(visit) && onChat && <div className="space-y-2"><Button type="button" className="min-h-12 w-full sm:w-auto" onClick={onChat}>Открыть консультацию</Button><p className="text-xs text-muted-foreground">Откроется переписка с врачом по этому питомцу.</p></div>}
      <dl className="space-y-1"><div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{visit.confirmed_starts_at ? "Приём:" : "Предлагаемое время:"}</dt><dd className="font-medium tabular-nums">{formatDateTime(visit.confirmed_starts_at || visit.proposed_starts_at)}</dd></div>{visit.duration_min != null && <div className="flex gap-2"><dt className="text-muted-foreground">Длительность:</dt><dd>{visit.duration_min} мин</dd></div>}<div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">Врач:</dt><dd className="break-words">{doctorName || "Информация недоступна"}</dd></div></dl>
      <p className="text-muted-foreground">{state.next}</p>
      {visit.reason && <p className="whitespace-pre-wrap break-words">{visit.reason}</p>}
      {visit.rejection_reason && <p className="break-words">Причина отказа: {visit.rejection_reason}</p>}
      {visit.answers.length > 0 && <details><summary className="cursor-pointer">Ответы на анкету</summary><dl className="space-y-2 pt-2">{visit.answers.map(answer => <div key={answer.question_id} className="break-words"><dt className="font-medium">{answer.label}</dt><dd className="whitespace-pre-wrap">{visitAnswerLabel(answer)}</dd></div>)}</dl></details>}
      {(visit.files ?? []).length > 0 && <details><summary className="min-h-11 cursor-pointer py-2">Материалы к заявке · {visit.files?.length}</summary><div className="space-y-2">{visit.files?.map((file, index) => <Button key={file.uuid} type="button" variant="outline" className="h-auto min-h-11 w-full whitespace-normal" disabled={busy} onClick={() => void download(visit, file)}>Скачать файл {index + 1} · {file.content_type === "application/pdf" ? "PDF" : "Фото"}</Button>)}</div></details>}
      {(finished(visit) || Boolean(visit.result_files?.length)) && <section className="space-y-3 rounded-lg bg-muted/50 p-3" aria-label="Результаты этого приёма"><h5 className="font-semibold">Результаты приёма · {visit.result_files?.length ? "Доступны" : "Пока недоступны"}</h5>{visit.result_files?.length ? <ul className="space-y-2">{visit.result_files.map(file => <li key={file.uuid}><Button type="button" variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal break-words text-left" disabled={busy} onClick={() => void downloadResult(visit, file)}>Скачать · {file.caption || "Документ приёма"} · {file.content_type === "application/pdf" ? "PDF" : "Фото"}</Button></li>)}</ul> : <p className="text-muted-foreground">Врач ещё не открыл документы этого приёма. Уточните готовность в сообщениях.</p>}</section>}
      {visit.status === "requested" && <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void change(visit, "withdraw")}>Отозвать заявку</Button>}
      {visit.status === "scheduled" && !finished(visit) && visit.encounter_status !== "in_progress" && <div className="flex flex-wrap gap-2">{onChat && <Button type="button" variant="outline" onClick={onChat}>Обсудить перенос с врачом</Button>}<Button type="button" variant="ghost" disabled={busy} onClick={() => void change(visit, "cancel")}>Отменить визит</Button></div>}
    </li>; })}</ul></section>)}
  </section>;
}
