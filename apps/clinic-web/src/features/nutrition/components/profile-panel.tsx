import { useId } from "react";
import { type AssessmentAnimal, type ProfileSelection } from "@/features/nutrition/api";
import { useAssessmentSuggestions, useStandardsQuery } from "@/features/nutrition/hooks";
import { apiErrorMessage } from "@/shared/api/error-message";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";

export function ProfilePanel({ animal, draft, confirmed, stale, onDraft, onConfirm }: {
  animal: AssessmentAnimal | null;
  draft: ProfileSelection;
  confirmed: boolean;
  stale: boolean;
  onDraft: (selection: ProfileSelection) => void;
  onConfirm: (selection: ProfileSelection) => void;
}) {
  const heading = useId();
  const standards = useStandardsQuery();
  const editions = standards.data?.filter((item) => item.standard_code === draft.standard_code) ?? [];
  const standard = draft.edition
    ? editions.find((item) => item.edition === draft.edition)
    : editions.find((item) => item.active) ?? editions[0];
  const suggestions = useAssessmentSuggestions(
    standard?.available ? animal : null, draft.standard_code, standard?.edition,
  );
  const profiles = suggestions.data?.profile_options ?? [];
  const current = profiles.find((item) => item.code === draft.profile_code);
  const recommended = profiles.find((item) => item.code === suggestions.data?.suggested_profile_code);
  const review = current?.compatibility;
  const recommendedReview = recommended?.compatibility;
  const canConfirm = current && review?.level !== "hard" && (!review?.comment_required || draft.comment?.trim());

  function chooseEdition(code: string, edition = "") {
    onDraft({ standard_code: code, edition, profile_code: "", source: "manual" });
  }

  return (
    <section id="nutrition-profile" tabIndex={-1} aria-labelledby={heading} className="scroll-mt-4 space-y-3 rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={heading} className="font-semibold">Нормативы и профиль оценки</h2>
        <p role="status" className="text-xs text-muted-foreground">
          {confirmed ? "Профиль подтверждён" : stale ? "Контекст изменился. Подтвердите профиль снова."
            : draft.profile_code ? "Профиль ожидает подтверждения" : "Профиль не выбран"}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_0.75fr_2fr]">
        <label className="grid gap-1 text-xs">
          Стандарт
          <select className={selectClass} value={draft.standard_code} onChange={(event) => chooseEdition(event.target.value)}>
            {Array.from(new Set([draft.standard_code, ...(standards.data?.map((item) => item.standard_code) ?? [])])).map((code) => (
              <option key={code} value={code}>{code.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          Редакция
          <select className={selectClass} value={standard?.edition ?? draft.edition} onChange={(event) => chooseEdition(draft.standard_code, event.target.value)} disabled={editions.length === 0 || (editions.length === 1 && Boolean(standard))}>
            {draft.edition && !standard ? <option value={draft.edition}>{draft.edition} · недоступна</option> : null}
            {editions.map((item) => <option key={item.edition} value={item.edition}>{item.edition}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          Профиль
          <select className={selectClass} value={draft.profile_code} disabled={!profiles.length} onChange={(event) => onDraft({
            ...draft, edition: standard?.edition ?? "", profile_code: event.target.value, source: "manual",
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
      {standard && !standard.commercial_use_verified && standard.available ? <p className="text-xs text-muted-foreground">{standard.reason}</p> : null}
      {standard?.standard_code === "fediaf" && standard.available && !standard.normative_categories?.includes("nutritional_maximum") ? (
        <p className="text-xs text-muted-foreground">В этой редакции загружены рекомендуемые минимумы. Верхние нормативные пределы недоступны.</p>
      ) : null}
      {animal && standard?.available && suggestions.isPending ? <p role="status">Загрузка профилей…</p> : null}
      {suggestions.data && !profiles.length ? <p role="status">Для текущего вида нет доступных профилей.</p> : null}
      {draft.profile_code && suggestions.data && !current ? (
        <p role="alert" className="text-destructive">Выбранный профиль недоступен для текущего вида. Выберите совместимый профиль.</p>
      ) : null}
      {review?.message ? <p role="status" className={review.level === "hard" ? "text-destructive" : "text-amber-800 dark:text-amber-300"}>{review.message}</p> : null}
      {review?.level === "soft" ? (
        <label className="grid gap-1 text-xs">
          Комментарий врача {review.comment_required ? "(обязательный)" : "(необязательный)"}
          <Input value={draft.comment ?? ""} maxLength={2000} onChange={(event) => onDraft({ ...draft, comment: event.target.value })} />
        </label>
      ) : null}
      {recommended ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <div>
            <p className="text-sm">Рекомендуемый профиль · {recommended.name_ru}</p>
            <p className="text-xs text-muted-foreground">{suggestions.data?.nutrient_standard_suggestion?.reason}</p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!standard || recommendedReview?.comment_required || recommendedReview?.level === "hard" || Boolean(confirmed && draft.profile_code === recommended.code)}
            onClick={() => standard && onConfirm({
              standard_code: standard.standard_code, edition: standard.edition,
              profile_code: recommended.code, source: "recommendation",
            })}>
            Применить рекомендованный
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {standard ? <a className="text-xs text-muted-foreground underline underline-offset-4" target="_blank" rel="noreferrer" href={standard.source_url}>Первоисточник</a> : <span />}
        <Button type="button" size="sm" disabled={!canConfirm || confirmed} onClick={() => onConfirm({ ...draft, source: "manual" })}>Подтвердить профиль</Button>
      </div>
      {suggestions.data?.edition.clinical_warning_ru ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Область применения стандарта</summary>
          <p className="mt-1">{suggestions.data.edition.clinical_warning_ru}</p>
        </details>
      ) : null}
    </section>
  );
}
