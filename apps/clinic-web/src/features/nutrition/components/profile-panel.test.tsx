import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessmentsApi, type ProfileSelection } from "@/features/nutrition/api";
import { ProfilePanel } from "./profile-panel";

vi.mock("@/features/nutrition/api", () => ({
  assessmentsApi: { standards: vi.fn(), suggestions: vi.fn() },
}));

const recommendation = "dog_adult_mer110";
const alternative = "dog_adult_mer95";

function renderPanel() {
  const onConfirm = vi.fn();
  function Form() {
    const [draft, setDraft] = React.useState<ProfileSelection>({
      standard_code: "fediaf", edition: "", profile_code: "", source: "manual",
    });
    const [confirmed, setConfirmed] = React.useState(false);
    return <ProfilePanel animal={{ species: "dog", age_months: 26 }} selection={draft} confirmed={confirmed}
      stale={false} summary={confirmed ? "FEDIAF 2025.09" : null}
      onConfirm={(selection) => { onConfirm(selection); setDraft(selection); setConfirmed(true); }} />;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Form /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Выбрать профиль" }));
  return onConfirm;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assessmentsApi.standards).mockResolvedValue([
    { standard_code: "fediaf", edition: "2025.09", source_url: "https://example.com/fediaf", available: true, active: true },
    { standard_code: "nrc", edition: "2006", source_url: "https://example.com/nrc", available: false, reason: "Набор недоступен" },
  ]);
  vi.mocked(assessmentsApi.suggestions).mockResolvedValue({
    edition: {
      code: "2025.09", source_checksum: "test", source_title: "FEDIAF", source_url: "https://example.com/fediaf", clinical_warning_ru: "",
    },
    profile_options: [
      { code: recommendation, name_ru: "MER 110", species: "dog", life_stage: "adult", category: "recommended_minimum", basis: "per_1000_kcal_me", compatibility: { level: "compatible" } },
      { code: alternative, name_ru: "MER 95", species: "dog", life_stage: "adult", category: "recommended_minimum", basis: "per_1000_kcal_me", compatibility: { level: "soft", message: "Отличается от рекомендации." } },
    ],
    energy_formula_options: [], size_class_options: [],
    energy_suggestion: null, nutrient_standard_suggestion: { code: recommendation, reason: "Активность не указана." },
    suggested_profile_code: recommendation, suggested_energy_formula_code: null, suggested_size_class_code: null,
    confidence: "low", confidence_ru: "Предварительно",
  });
});

describe("profile confirmation", () => {
  it("only accepts a recommendation after the clinician applies it", async () => {
    const onConfirm = renderPanel();
    const apply = await screen.findByRole("button", { name: "Выбрать рекомендованный" });
    expect(screen.getByLabelText("Профиль")).toHaveValue("");
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(apply);
    expect(screen.getByLabelText("Профиль")).toHaveValue(recommendation);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить профиль" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ profile_code: recommendation, source: "recommendation" }));
    expect(screen.getByText("Профиль подтверждён")).toBeVisible();
  });

  it("keeps the confirmed profile when a standard change is cancelled", async () => {
    const onConfirm = renderPanel();
    await screen.findByRole("button", { name: "Выбрать рекомендованный" });
    fireEvent.change(screen.getByLabelText("Профиль"), { target: { value: alternative } });
    expect(screen.getByText("Отличается от рекомендации.")).toBeVisible();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Комментарий врача/), { target: { value: "Контекст подтверждён" } });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить профиль" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ profile_code: alternative, source: "manual", comment: "Контекст подтверждён" }));
    fireEvent.click(screen.getByRole("button", { name: "Изменить профиль" }));
    fireEvent.change(screen.getByLabelText("Стандарт"), { target: { value: "nrc" } });
    expect(screen.getByText("Набор недоступен")).toBeVisible();
    expect(screen.getByRole("button", { name: "Подтвердить профиль" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Профиль подтверждён")).toBeVisible();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Изменить профиль" }));
    expect(screen.getByLabelText("Профиль")).toHaveValue(alternative);
  });
});
