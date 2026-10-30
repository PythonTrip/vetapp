"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useAuth } from "@/features/authentication/auth-provider";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { ownerError } from "@/features/owner-cabinet/api";
import { visitQuestionnairesApi, type BookableVisitType, type VisitQuestionKind, type VisitQuestionnaire, type VisitQuestionWrite } from "@/features/appointments/api";

const types: Record<BookableVisitType, string> = {
  primary: "Первичный", secondary: "Повторный", consultation: "Консультация", supervision: "Курирование",
};
const kinds: Record<VisitQuestionKind, string> = {
  binary: "Да/нет", single_select: "Один вариант", multi_select: "Несколько вариантов", number: "Число", text: "Текст", date: "Дата",
};
type Draft = Required<VisitQuestionWrite> & { key: string };
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function TypeEditor({ slot, canEdit }: { slot: VisitQuestionnaire; canEdit: boolean }) {
  const toDrafts = (questions: VisitQuestionnaire["questions"]): Draft[] => questions.map(q => ({ ...q, options: q.options ?? [], key: q.uuid }));
  const [questions, setQuestions] = React.useState(() => toDrafts(slot.questions));
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  function change(next: Draft[]) { setQuestions(next); setDirty(true); setNotice(""); setError(""); }
  function update(index: number, patch: Partial<Draft>) {
    change(questions.map((question, i) => i === index ? { ...question, ...patch } : question));
  }
  function move(index: number, direction: number) {
    const next = [...questions];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    change(next);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    for (const question of questions) {
      if (!question.label.trim()) { setError("Введите текст каждого вопроса."); return; }
      if (["single_select", "multi_select"].includes(question.kind) &&
          (question.options.length < 2 || question.options.some(option => !option.label.trim()))) {
        setError("Для вопроса с выбором заполните хотя бы два варианта ответа."); return;
      }
    }
    setBusy(true);
    try {
      const saved = await visitQuestionnairesApi.save(slot.visit_type, questions.map(q => ({
        kind: q.kind, label: q.label, options: q.options,
      })));
      setQuestions(toDrafts(saved.questions)); setDirty(false); setNotice("Анкета сохранена");
    } catch (cause) { setError(ownerError(cause)); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="border-t pt-5 space-y-4" aria-label={`Анкета: ${types[slot.visit_type]}`}>
    <h3 className="font-semibold">{types[slot.visit_type]}</h3>
    {questions.length === 0 && <p className="text-sm text-muted-foreground">{dirty
      ? "Вопросов нет. Сохраните, чтобы запрос уходил без вопросов."
      : "Анкета не задана — запрос уйдёт без вопросов"}</p>}
    <fieldset disabled={busy || !canEdit} className="min-w-0 space-y-4">
      {questions.map((question, index) => <div key={question.key} className="space-y-3 rounded-md border p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Вопрос {index + 1}</span>
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="icon" disabled={index === 0} aria-label={`Поднять вопрос ${index + 1}`} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></Button>
            <Button type="button" variant="outline" size="icon" disabled={index === questions.length - 1} aria-label={`Опустить вопрос ${index + 1}`} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></Button>
            <Button type="button" variant="outline" size="icon" aria-label={`Удалить вопрос ${index + 1}`} onClick={() => change(questions.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>
          </div>
        </div>
        <label className="grid gap-1.5 text-sm">Текст вопроса
          <Input required maxLength={500} value={question.label} onChange={e => update(index, { label: e.target.value })} />
        </label>
        <label className="grid gap-1.5 text-sm">Тип ответа
          <select className={selectClass} value={question.kind} onChange={e => {
            const kind = e.target.value as VisitQuestionKind;
            update(index, { kind, options: ["single_select", "multi_select"].includes(kind)
              ? (question.options.length ? question.options : [{ value: crypto.randomUUID(), label: "" }, { value: crypto.randomUUID(), label: "" }]) : [] });
          }}>{Object.entries(kinds).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select>
        </label>
        {["single_select", "multi_select"].includes(question.kind) && <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Варианты ответа — минимум два</p>
          {question.options.map((option, optionIndex) => <div key={option.value} className="flex gap-2">
            <Input required aria-label={`Вопрос ${index + 1}, вариант ${optionIndex + 1}`} value={option.label} onChange={e => update(index, {
              options: question.options.map((item, i) => i === optionIndex ? { ...item, label: e.target.value } : item),
            })} />
            <Button type="button" variant="outline" size="icon" aria-label={`Удалить вариант ${optionIndex + 1} вопроса ${index + 1}`} onClick={() => update(index, { options: question.options.filter((_, i) => i !== optionIndex) })}><Trash2 className="size-4" /></Button>
          </div>)}
          <Button type="button" variant="outline" onClick={() => update(index, { options: [...question.options, { value: crypto.randomUUID(), label: "" }] })}>Добавить вариант</Button>
        </div>}
      </div>)}
      {canEdit && <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => change([...questions, { key: crypto.randomUUID(), kind: "binary", label: "", options: [] }])}>Добавить вопрос</Button>
        <Button type="submit" disabled={!dirty}>{busy ? "Сохранение…" : "Сохранить анкету"}</Button>
      </div>}
    </fieldset>
    {dirty && <p className="text-sm text-muted-foreground">Есть несохранённые изменения</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </form>;
}

export function VisitQuestionnaireEditor() {
  const { user } = useAuth();
  return <DoctorQuestionnaires key={user?.user_id ?? "signed-out"} />;
}

function DoctorQuestionnaires() {
  const { user, workspace } = useAuth();
  const canEdit = Boolean(user) && (workspace === "personal" || ["owner", "admin", "member"].includes(user?.organization?.org_role ?? ""));
  const [slots, setSlots] = React.useState<VisitQuestionnaire[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try { setSlots(await visitQuestionnairesApi.list()); }
    catch (cause) { setError(ownerError(cause)); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  return <Card>
    <CardHeader><CardTitle className="text-base">Анкеты перед визитом</CardTitle>
      <CardDescription>Ваши вопросы для каждого типа визита. Все вопросы обязательны для владельца. Сохранение публикует анкету.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {loading && <p role="status">Загрузка анкет…</p>}
      {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" disabled={loading} onClick={() => void load()}>Повторить загрузку</Button></div>}
      {!canEdit && <p className="text-sm text-muted-foreground">В этом рабочем месте доступен только просмотр.</p>}
      {slots?.map(slot => <TypeEditor key={slot.uuid} slot={slot} canEdit={canEdit} />)}
    </CardContent>
  </Card>;
}
