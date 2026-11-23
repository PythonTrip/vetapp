import { useState } from "react";
import { Check, ChevronDown, Plus, SlidersHorizontal, X } from "lucide-react";
import { type AssessmentAnimal, type ProfileSelection } from "@/features/nutrition/api";
import { useAssessmentSuggestions, useStandardsQuery } from "@/features/nutrition/hooks";
import { apiErrorMessage } from "@/shared/api/error-message";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";

const selectClass = "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring disabled:opacity-60";

export function ProfilePanel({ animal, selection, confirmed, stale, summary, onConfirm }: {
  animal: AssessmentAnimal | null;
  selection: ProfileSelection;
  confirmed: boolean;
  stale: boolean;
  summary: string | null;
  onConfirm: (selection: ProfileSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(selection);
  const editing = open ? draft : selection;
  const standards = useStandardsQuery();
  const editions = standards.data?.filter((item) => item.standard_code === editing.standard_code) ?? [];
  const standard = editing.edition
    ? editions.find((item) => item.edition === editing.edition)
    : editions.find((item) => item.active) ?? editions[0];
  const suggestions = useAssessmentSuggestions(
    standard?.available && (open || confirmed) ? animal : null, editing.standard_code, standard?.edition,
  );
  const profiles = suggestions.data?.profile_options ?? [];
  const current = profiles.find((item) => item.code === draft.profile_code);
  const recommended = profiles.find((item) => item.code === suggestions.data?.suggested_profile_code);
  const review = current?.compatibility;
  const recommendedReview = recommended?.compatibility;
  const canConfirm = standard?.available && current && !suggestions.isError
    && review?.level !== "hard" && (!review?.comment_required || draft.comment?.trim());
  const noUpperLimits = standard?.standard_code === "fediaf" && standard.available
    && !standard.normative_categories?.includes("nutritional_maximum");
  const clinicalWarning = suggestions.data?.edition.clinical_warning_ru;
  const confirmedName = profiles.find((item) => item.code === selection.profile_code)?.name_ru;

  function chooseEdition(code: string, edition = "") {
    setDraft({ standard_code: code, edition, profile_code: "", source: "manual" });
  }

  function changeOpen(next: boolean) {
    if (next) setDraft(selection);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:justify-end">
        <div className="min-w-0 text-left sm:text-right">
          {confirmed && summary ? <p className="text-sm font-medium wrap-break-word">
            {confirmedName ? `${selection.standard_code.toUpperCase()} ${selection.edition} · ${confirmedName}` : summary}
          </p> : null}
          <p role="status" className="text-xs text-muted-foreground">
            {confirmed ? "Профиль подтверждён" : stale ? "Контекст изменился. Подтвердите профиль снова." : "Профиль не выбран"}
          </p>
        </div>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="min-h-11 shrink-0 border-primary/25 text-teal-800 hover:bg-primary/10 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-teal-800 focus-visible:transition-none dark:text-teal-200 dark:hover:text-teal-200 dark:focus-visible:outline-teal-300">
            {confirmed || stale ? <SlidersHorizontal aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {confirmed || stale ? "Изменить профиль" : "Выбрать профиль"}
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[38rem] motion-reduce:animate-none">
        <DialogHeader className="relative gap-1.5 border-b px-4 py-5 pr-16 text-left sm:px-6 sm:pr-16">
          <DialogTitle className="text-xl">Профиль оценки</DialogTitle>
          <DialogDescription>Выберите нормативы для оценки нутриентного состава рациона.</DialogDescription>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" type="button" aria-label="Закрыть окно" className="absolute top-2 right-2 size-11"><X aria-hidden="true" /></Button>
          </DialogClose>
        </DialogHeader>
        <div className="min-w-0 space-y-4 overflow-y-auto px-4 py-5 text-sm sm:px-6">
          <div className="grid min-w-0 gap-3 min-[360px]:grid-cols-2">
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              Стандарт
              <select className={selectClass} value={draft.standard_code} onChange={(event) => chooseEdition(event.target.value)}>
                {Array.from(new Set([draft.standard_code, ...(standards.data?.map((item) => item.standard_code) ?? [])])).map((code) => (
                  <option key={code} value={code}>{code.toUpperCase()}</option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              Редакция
              <select className={selectClass} value={standard?.edition ?? draft.edition} onChange={(event) => chooseEdition(draft.standard_code, event.target.value)} disabled={editions.length === 0 || (editions.length === 1 && Boolean(standard))}>
                {draft.edition && !standard ? <option value={draft.edition}>{draft.edition} · недоступна</option> : null}
                {editions.map((item) => <option key={item.edition} value={item.edition}>{item.edition}</option>)}
              </select>
            </label>
            <label className="col-span-full grid min-w-0 gap-1.5 text-sm font-medium">
              Профиль
              <select className={selectClass} value={draft.profile_code} disabled={!profiles.length} onChange={(event) => setDraft({
                standard_code: draft.standard_code, edition: standard?.edition ?? "", profile_code: event.target.value, source: "manual",
              })}>
                <option value="">Выберите профиль</option>
                {draft.profile_code && !current ? <option value={draft.profile_code}>{draft.profile_code}</option> : null}
                {profiles.map((item) => <option key={item.code} value={item.code}>{item.name_ru}</option>)}
              </select>
            </label>
          </div>
          {standards.isError || suggestions.isError ? <p role="alert" className="text-destructive">{apiErrorMessage(standards.error ?? suggestions.error)}</p> : null}
          {standards.data && !standard ? <p role="alert">Выбранная редакция недоступна. Выберите доступную редакцию.</p> : null}
          {standard && !standard.available ? <p role="status">{standard.reason}</p> : null}
          {standards.isPending ? <p role="status">Загрузка стандартов…</p> : null}
          {!animal ? <p role="status">Проверьте параметры пациента, чтобы загрузить профили.</p> : null}
          {animal && standard?.available && suggestions.isPending ? <p role="status">Загрузка профилей…</p> : null}
          {suggestions.data && !profiles.length ? <p role="status">Для текущего вида нет доступных профилей.</p> : null}
          {draft.profile_code && suggestions.data && !current ? (
            <p role="alert" className="text-destructive">Выбранный профиль недоступен для текущего вида. Выберите совместимый профиль.</p>
          ) : null}
          {review?.message ? <p role="status" className={review.level === "hard" ? "text-destructive" : "text-amber-800 dark:text-amber-300"}>{review.message}</p> : null}
          {review?.level === "soft" ? (
            <label className="grid gap-1.5 text-sm font-medium">
              Комментарий врача {review.comment_required ? "(обязательный)" : "(необязательный)"}
              <Input className="min-h-11" value={draft.comment ?? ""} maxLength={2000} onChange={(event) => setDraft({ ...draft, comment: event.target.value })} />
            </label>
          ) : null}
          {recommended ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div>
                <p className="text-xs font-semibold text-teal-800 dark:text-teal-200">Рекомендуемый профиль</p>
                <p className="mt-1 font-medium">{recommended.name_ru}</p>
                <p className="text-sm text-muted-foreground">{suggestions.data?.nutrient_standard_suggestion?.reason}</p>
              </div>
              <Button type="button" variant="outline" className="min-h-11 max-w-full" disabled={!standard || recommendedReview?.level === "hard" || (draft.profile_code === recommended.code && draft.source === "recommendation")}
                onClick={() => standard && setDraft({
                  standard_code: standard.standard_code, edition: standard.edition,
                  profile_code: recommended.code, source: "recommendation",
                })}>
                {draft.profile_code === recommended.code && draft.source === "recommendation" ? <><Check aria-hidden="true" />Рекомендация выбрана</> : "Выбрать рекомендованный"}
              </Button>
            </div>
          ) : null}
          {standard ? (
            <details className="group border-t text-sm text-muted-foreground">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring">
                О стандарте и ограничениях <ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
              </summary>
              {noUpperLimits ? <p>В редакции доступны рекомендуемые минимумы. Верхние нормативные пределы недоступны.</p> : null}
              {clinicalWarning ? <p className="mt-1">{clinicalWarning}</p> : null}
              <a className="inline-flex min-h-11 items-center text-teal-800 underline underline-offset-4 dark:text-teal-200" target="_blank" rel="noreferrer" href={standard.source_url}>Первоисточник</a>
            </details>
          ) : null}
        </div>
        <DialogFooter className="border-t bg-muted/25 px-4 py-3 min-[380px]:flex-row min-[380px]:justify-end sm:px-6">
          <DialogClose asChild><Button type="button" variant="outline" className="min-h-11">Отмена</Button></DialogClose>
          <Button type="button" className="min-h-11 bg-teal-800 text-white hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-teal-800 dark:bg-teal-300 dark:text-teal-950 dark:hover:bg-teal-200 dark:focus-visible:outline-teal-300" disabled={!canConfirm} onClick={() => {
            if (!canConfirm) return;
            onConfirm({ ...draft, edition: standard.edition });
            setOpen(false);
          }}>Подтвердить профиль</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
