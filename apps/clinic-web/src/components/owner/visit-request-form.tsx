"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BookableVisitType } from "@/lib/api-client";
import { BOOKABLE_VISIT_TYPES, VISIT_TYPE_LABELS, formatDateTime } from "@/lib/clinical-labels";
import { ownerError, ownerVisits, type OwnerVisit, type VisitAnswerValue, type VisitFile, type VisitQuestion, type VisitStatus } from "@/lib/owner-api";

export const OWNER_VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  requested: "Запрошен", scheduled: "Назначен", rejected: "Отклонён", withdrawn: "Отозван",
  cancelled: "Отменён", completed: "Завершён", no_show: "Не явился",
};
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

export function VisitRequestForm({ animalId, onChanged, onClose }: { animalId: string; onChanged: () => void; onClose: () => void }) {
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
  React.useEffect(() => {
    let active = true;
    setLoading(true); setQuestionError(""); setAnswers({});
    ownerVisits.questions(type).then(result => { if (active) setQuestions(result); }).catch(cause => { if (active) setQuestionError(ownerError(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, reload]);
  const ready = !loading && !questionError && startsAt && questions.every(q => hasAnswer(q, answers[q.uuid]));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || (!createdId && !ready)) return;
    setBusy(true); setError("");
    let requestId = createdId;
    try {
      if (!requestId) {
        const visit = await ownerVisits.create(animalId, { visit_type: type, proposed_starts_at: new Date(startsAt).toISOString(), answers: questions.map(q => ({ question_id: q.uuid, value: answers[q.uuid] })) });
        requestId = visit.uuid; setCreatedId(visit.uuid); onChanged();
      }
      // Remove successful uploads immediately. Retrying a failed upload never
      // creates another request or re-sends earlier successful files.
      for (const file of files) {
        await ownerVisits.upload(requestId, file);
        setFiles(current => current.filter(item => item !== file));
      }
      onChanged(); onClose();
    } catch (cause) {
      setError(`${requestId ? "Заявка создана, но не все файлы прикреплены. Повторите загрузку. " : ""}${ownerError(cause)}`);
      onChanged();
    } finally { setBusy(false); }
  }
  return <form onSubmit={event => void submit(event)} className="min-w-0 space-y-3 rounded-md border p-3">
    <h5 className="font-medium">Заявка на визит</h5>
    <p className="text-sm text-muted-foreground">Предложите удобное время. Визит появится в расписании после подтверждения врача.</p>
    <fieldset disabled={busy || createdId !== null} className="min-w-0 space-y-3">
      <div className="space-y-1"><label htmlFor={`${id}-type`} className="text-sm font-medium">Тип визита</label>
        <select id={`${id}-type`} className={selectClass} value={type} onChange={event => { setLoading(true); setType(event.target.value as BookableVisitType); }}>
          {BOOKABLE_VISIT_TYPES.map(value => <option key={value} value={value}>{VISIT_TYPE_LABELS[value]}</option>)}
        </select>
      </div>
      <div className="min-w-0 space-y-1"><label htmlFor={`${id}-time`} className="text-sm font-medium">Предлагаемые дата и время</label>
        <Input id={`${id}-time`} className="min-w-0 max-w-full" type="datetime-local" required value={startsAt} onChange={event => setStartsAt(event.target.value)} />
      </div>
      {loading && <p role="status" className="text-sm">Загрузка анкеты…</p>}
      {questionError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{questionError}</p><Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>Повторить загрузку анкеты</Button></div>}
      {!loading && !questionError && (questions.length ? <><p className="text-sm text-muted-foreground">Все вопросы обязательны</p>{questions.map(question => <QuestionField key={question.uuid} question={question} value={answers[question.uuid]} onChange={value => setAnswers(current => ({ ...current, [question.uuid]: value }))} />)}</> : <p className="text-sm text-muted-foreground">Для этого типа визита анкета не требуется.</p>)}
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
    </fieldset>
    {files.length > 0 && <ul className="space-y-1 text-sm">{files.map((file, index) => <li key={`${file.name}-${index}`} className="break-words">{file.name}</li>)}</ul>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <div className="flex flex-col gap-2">
      <Button type="submit" disabled={busy || (!createdId && !ready)}>{busy ? "Отправка…" : createdId ? "Повторить загрузку файлов" : "Отправить заявку"}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{createdId ? "Закрыть — заявка уже создана" : "Отмена"}</Button>
      {!createdId && !loading && !questionError && <Button type="button" variant="ghost" disabled={busy} onClick={() => setReload(value => value + 1)}>Обновить анкету</Button>}
    </div>
  </form>;
}

function answerLabel(answer: OwnerVisit["answers"][number]) {
  if (answer.kind === "binary") return answer.value === "yes" ? "Да" : "Нет";
  const values = Array.isArray(answer.value) ? answer.value : [answer.value];
  return values.map(value => answer.options?.find(option => option.value === value)?.label ?? String(value)).join(", ");
}

export function AnimalVisits({ animalId }: { animalId: string }) {
  const [visits, setVisits] = React.useState<OwnerVisit[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const generation = React.useRef(0);
  const load = React.useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError("");
    try { const result = await ownerVisits.list(animalId); if (generation.current === current) setVisits(result); }
    catch (cause) { if (generation.current === current) setError(ownerError(cause)); }
    finally { if (generation.current === current) setLoading(false); }
  }, [animalId]);
  React.useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  async function change(visit: OwnerVisit, action: "withdraw" | "cancel") {
    if (busy) return;
    setBusy(true); setError("");
    try { await ownerVisits.change(visit.uuid, action); await load(); }
    catch (cause) { setError(ownerError(cause)); }
    finally { setBusy(false); }
  }
  async function download(visit: OwnerVisit, file: VisitFile) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const blob = await ownerVisits.download(visit.uuid, file.uuid);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `файл.${file.content_type === "application/pdf" ? "pdf" : file.content_type.split("/")[1]}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (cause) { setError(ownerError(cause)); }
    finally { setBusy(false); }
  }
  return <section className="min-w-0 space-y-3 pt-3">
    <h4 className="font-semibold">Визиты</h4>
    {open ? <VisitRequestForm animalId={animalId} onChanged={() => void load()} onClose={() => setOpen(false)} /> : <Button type="button" className="w-full" onClick={() => setOpen(true)}>Запросить визит</Button>}
    <Button type="button" variant="outline" className="w-full" disabled={busy || loading} onClick={() => void load()}>Обновить визиты</Button>
    {loading && <p role="status" className="text-sm">Загрузка визитов…</p>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    {!loading && !error && visits.length === 0 && <p className="text-sm text-muted-foreground">Вы ещё не запрашивали визиты.</p>}
    <ul className="space-y-3">{visits.map(visit => <li key={visit.uuid} className="min-w-0 space-y-2 rounded-md border p-3 text-sm">
      <p className="font-medium">{VISIT_TYPE_LABELS[visit.visit_type]} · {OWNER_VISIT_STATUS_LABELS[visit.status]}</p>
      <p>Предложено: {formatDateTime(visit.proposed_starts_at)}</p>
      {visit.confirmed_starts_at && <p>Подтверждено: {formatDateTime(visit.confirmed_starts_at)} · {visit.duration_min} мин</p>}
      {visit.rejection_reason && <p className="break-words">Причина отказа: {visit.rejection_reason}</p>}
      {visit.answers.length > 0 && <details><summary className="cursor-pointer">Ответы на анкету</summary><dl className="space-y-2 pt-2">{visit.answers.map(answer => <div key={answer.question_id} className="break-words"><dt className="font-medium">{answer.label}</dt><dd className="whitespace-pre-wrap">{answerLabel(answer)}</dd></div>)}</dl></details>}
      {(visit.files ?? []).map((file, index) => <Button key={file.uuid} type="button" variant="outline" className="h-auto w-full whitespace-normal" disabled={busy} onClick={() => void download(visit, file)}>Скачать файл {index + 1} · {file.content_type === "application/pdf" ? "PDF" : "Фото"}</Button>)}
      {visit.status === "requested" && <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void change(visit, "withdraw")}>Отозвать заявку</Button>}
      {visit.status === "scheduled" && <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void change(visit, "cancel")}>Отменить визит</Button>}
    </li>)}</ul>
  </section>;
}
