import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  assessmentsApi, dietPlansApi, foodsApi, nutrientsApi,
  type AssessmentRecord, type AssessmentRequestPayload, type DietPlanRecord, type FoodSummaryRecord,
} from "@/features/nutrition/api";
import { ApiError } from "@/shared/api/client";
import { NutritionWorkspace } from "./nutrition-workspace";

const navigation = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => navigation.params,
}));
vi.mock("@/features/nutrition/api", () => ({
  assessmentsApi: { standards: vi.fn(), suggestions: vi.fn(), energyEstimate: vi.fn(), create: vi.fn() },
  dietPlansApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn() },
  foodsApi: { list: vi.fn(), categories: vi.fn(), get: vi.fn(), matrix: vi.fn() },
  nutrientsApi: { list: vi.fn() },
}));
vi.mock("@/features/patients/hooks", () => ({
  usePatientQuery: (id: string) => id === "patient-b"
    ? { isPending: false, data: { uuid: id, name: "Мира", species: "cat", body_weight_kg: 4, life_stage: "adult" } }
    : { isPending: false },
  usePatientsQuery: () => ({ isPending: false, data: [] }),
}));
vi.mock("./patient-picker", () => ({
  PatientPicker: ({ onChange }: { onChange: (id: string) => void }) =>
    <button type="button" onClick={() => onChange("patient-b")}>Выбрать Миру</button>,
}));

const edition = {
  code: "2025.09", source_checksum: "source", source_title: "FEDIAF",
  source_url: "https://example.com/standard", clinical_warning_ru: "",
};
const profile = "dog_adult_mer110";
const food: FoodSummaryRecord = {
  uuid: "food-1", name: "Тестовый корм", type: "commercial", feed_form: "dry",
  category: null, subcategory: null, created_at: "", updated_at: "",
};
const energy = {
  energy_formula_code: "adult-energy", complete: true, missing_fields: [],
  energy_adjustment_percent: 100, reference_energy_kcal: 400, working_energy_kcal: 400,
  reference_energy_min_kcal: null, reference_energy_max_kcal: null,
  rer_kcal_day: null, rer_factor: 1.6, rer_factor_kcal_day: null,
};

function result(request: AssessmentRequestPayload): AssessmentRecord {
  const grams = request.components[0].grams;
  return {
    engine_id: "test", edition, energy,
    context: {
      nutrient_profile_code: request.profile_selection?.profile_code ?? null,
      energy_formula_code: "adult-energy", size_class_code: null, feed_form: "dry", therapeutic_goal: false,
    },
    coverage: { expected_atomic_count: 0, complete_atomic_count: 0, percent: 0, below_threshold: true },
    rows: [], met_count: 0, input_hash: "a".repeat(64),
    normative_comparison_performed: Boolean(request.profile_selection),
    ration_energy: {
      items: [{
        food_uuid: food.uuid, kcal_day: grams * 3, me_kcal_per_100g: 300,
        method: "declared", quality: "measured", source: "catalog",
      }],
      total_kcal_day: grams * 3, known_kcal_day: grams * 3,
      requirement_kcal_day: 400, coverage_percent: grams * 3 / 4, difference_kcal_day: grams * 3 - 400,
    },
  };
}

function savedPlan(): DietPlanRecord {
  const selection = {
    standard_code: "fediaf", edition: edition.code, profile_code: profile, source: "manual" as const,
  };
  const request: AssessmentRequestPayload = {
    animal: { species: "dog", current_body_weight_kg: 12 },
    components: [{ food_uuid: food.uuid, grams: 100 }], rer_factor: 1.6,
    energy_adjustment_percent: 100, profile_selection: selection, profile_mode: "manual",
  };
  const assessment = result(request);
  return {
    name: "Сохранённый рацион", uuid: "plan-1", patient_uuid: null, patient: null, notes: null,
    edition_code: edition.code, edition_source_checksum: edition.source_checksum,
    engine_id: assessment.engine_id, created_at: "", updated_at: "",
    ration: [{ food_uuid: food.uuid, food_name: food.name, food_type: food.type, feed_form: "dry", grams: 100 }],
    assessment_snapshot: {
      request, assessment, result: assessment, resolved_context: assessment.context,
      standard_code: "fediaf", edition: edition.code, nutrient_profile_code: profile,
      energy_formula_code: "adult-energy", provider_version: "test", provider_checksum: "test",
    },
  };
}

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><NutritionWorkspace /></QueryClientProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
  navigation.params = new URLSearchParams();
  vi.mocked(assessmentsApi.create).mockImplementation(async (request) => result(request));
  vi.mocked(assessmentsApi.energyEstimate).mockResolvedValue({
    energy_formula_code: null, value: null, inputs: {},
    source: { edition: edition.code, table: null, page: null }, warnings: [], missing_fields: [],
  });
  vi.mocked(assessmentsApi.standards).mockResolvedValue([
    { standard_code: "fediaf", edition: edition.code, source_url: edition.source_url, available: true, active: true },
  ]);
  vi.mocked(assessmentsApi.suggestions).mockImplementation(async (animal) => {
    const code = animal.species === "cat" ? "cat_adult_mer100" : profile;
    const name = animal.species === "cat" ? "MER 100" : "MER 110";
    return {
      edition, profile_options: [{ code, name_ru: name, species: animal.species, life_stage: "adult",
        category: "recommended_minimum", basis: "per_1000_kcal_me", compatibility: { level: "compatible" } }],
      energy_formula_options: [], size_class_options: [], energy_suggestion: null,
      nutrient_standard_suggestion: { code, reason: "Тестовый контекст" }, suggested_profile_code: code,
      suggested_size_class_code: null, suggested_energy_formula_code: null,
      confidence: "high", confidence_ru: "",
    };
  });
  vi.mocked(foodsApi.matrix).mockResolvedValue({ items: [{ ...food, nutrient_values: [] }], total: 1 });
  vi.mocked(foodsApi.categories).mockResolvedValue([]);
  vi.mocked(foodsApi.get).mockResolvedValue({ ...food, nutrient_values: [] });
  vi.mocked(nutrientsApi.list).mockResolvedValue([]);
  vi.mocked(dietPlansApi.list).mockResolvedValue([]);
  vi.mocked(dietPlansApi.get).mockResolvedValue(savedPlan());
  vi.mocked(dietPlansApi.create).mockResolvedValue(savedPlan());
});

it("keeps catalog filters across tabs and applies branch selection independently of expansion", async () => {
  vi.mocked(foodsApi.categories).mockResolvedValue([
    {
      category: "Корма", food_count: 2,
      subcategories: [{ subcategory: "Сухие", food_count: 1 }, { subcategory: null, food_count: 1 }],
    },
    { category: null, food_count: 1, subcategories: [] },
  ]);
  const foods = [
    { ...food, uuid: "dry", name: "Сухой корм", category: "Корма", subcategory: "Сухие", nutrient_values: [] },
    { ...food, uuid: "wet", name: "Влажный корм", category: "Корма", nutrient_values: [] },
    { ...food, uuid: "other", name: "Добавка", nutrient_values: [] },
  ];
  vi.mocked(foodsApi.matrix).mockImplementation(async ({ q, categoryPairs }) => {
    const items = foods.filter((item) =>
      item.name.includes(q) && (!categoryPairs.length || categoryPairs.some((pair) =>
        item.category === pair.category && (pair.allSubcategories || item.subcategory === pair.subcategory),
      )),
    );
    return { items, total: items.length };
  });
  const openTab = (name: string) => fireEvent.keyDown(screen.getByRole("tab", { name }), { key: "Enter" });
  const workspace = renderWorkspace();
  openTab("Каталог");
  expect(screen.getByText("Выберите продукты для сравнения")).toBeVisible();
  expect(foodsApi.matrix).not.toHaveBeenCalled();

  const sidebar = within(screen.getByRole("complementary", { name: "Категории" }));
  const parent = await sidebar.findByRole("checkbox", { name: "Корма" });
  const leaf = sidebar.getByRole("checkbox", { name: "Без категории" });
  expect(sidebar.queryByRole("button", { name: "Развернуть Без категории" })).not.toBeInTheDocument();
  expect(sidebar.queryByRole("checkbox", { name: "Сухие" })).not.toBeInTheDocument();
  fireEvent.click(sidebar.getByRole("button", { name: "Развернуть Корма" }));
  expect(sidebar.getByRole("checkbox", { name: "Без подкатегории" })).not.toBeChecked();
  fireEvent.click(sidebar.getByRole("checkbox", { name: "Сухие" }));
  expect(parent).toBePartiallyChecked();
  expect(await screen.findByText("Найдено: 1")).toBeVisible();
  fireEvent.click(parent);
  expect(parent).toBeChecked();
  expect(await screen.findByText("Найдено: 2")).toBeVisible();
  expect(foodsApi.matrix).toHaveBeenLastCalledWith(expect.objectContaining({
    categoryPairs: [{ category: "Корма", subcategory: null, allSubcategories: true }],
  }));
  fireEvent.click(parent);
  expect(parent).not.toBeChecked();
  fireEvent.click(sidebar.getByRole("checkbox", { name: "Сухие" }));
  fireEvent.click(sidebar.getByRole("button", { name: "Свернуть Корма" }));
  expect(parent).toBePartiallyChecked();
  fireEvent.click(leaf);
  expect(await screen.findByRole("button", { name: "Открыть карточку продукта: Добавка" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Открыть карточку продукта: Сухой корм" })).toBeVisible();

  fireEvent.change(screen.getByRole("searchbox", { name: "Поиск продуктов" }), { target: { value: "Сухой" } });
  expect(await screen.findByText("Найдено: 1")).toBeVisible();
  expect(sidebar.getByText("2")).toBeVisible();
  openTab("Минералы");
  await waitFor(() => expect(foodsApi.matrix).toHaveBeenLastCalledWith(expect.objectContaining({
    q: "Сухой", nutrientCategory: "mineral",
  })));
  fireEvent.click(sidebar.getByRole("button", { name: "Скрыть категории" }));
  openTab("Недавние планы");
  openTab("Рацион");
  openTab("Каталог");
  expect(screen.queryByRole("complementary", { name: "Категории" })).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Поиск продуктов" })).toHaveValue("Сухой");
  fireEvent.click(screen.getByRole("button", { name: "Корма · Сухие" }));
  expect(await screen.findByText("Найдено: 0")).toBeVisible();
  expect(screen.getByRole("button", { name: "Без категории" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));
  expect(screen.getByRole("searchbox", { name: "Поиск продуктов" })).toHaveValue("");
  expect(screen.getByText("Выберите продукты для сравнения")).toBeVisible();

  fireEvent.change(screen.getByRole("searchbox", { name: "Поиск продуктов" }), { target: { value: "Сухой" } });
  workspace.unmount();
  renderWorkspace();
  openTab("Каталог");
  expect(screen.getByRole("complementary", { name: "Категории" })).toBeVisible();
  expect(screen.getByRole("searchbox", { name: "Поиск продуктов" })).toHaveValue("");
  expect(screen.getByText("Выберите продукты для сравнения")).toBeVisible();
});

it("retries the next matrix page and adds a food without losing the modal filters", async () => {
  const items = Array.from({ length: 101 }, (_, index) => ({
    ...food, uuid: `food-${index + 1}`, name: `Корм ${index + 1}`, nutrient_values: [],
  }));
  let failNextPage = true;
  vi.mocked(foodsApi.categories).mockResolvedValue([{ category: null, food_count: 101, subcategories: [] }]);
  vi.mocked(foodsApi.matrix).mockImplementation(async ({ offset = 0, limit = 50 }) => {
    if (offset === 50 && failNextPage) throw new ApiError("Test page failure", 400);
    return { items: items.slice(offset, offset + limit), total: items.length };
  });

  const openTab = (name: string) => fireEvent.keyDown(screen.getByRole("tab", { name }), { key: "Enter" });
  const openModal = () => fireEvent.click(screen.getAllByRole("button", { name: "Добавить продукт" })[0]);
  renderWorkspace();
  openTab("Каталог");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Каталог" } });
  openTab("Рацион");
  openModal();
  const dialog = within(screen.getByRole("dialog", { name: "Добавить продукт" }));
  const search = dialog.getByRole("searchbox");
  expect(search).toHaveValue("");
  expect(dialog.queryByRole("table")).not.toBeInTheDocument();
  expect(foodsApi.matrix).not.toHaveBeenCalled();

  fireEvent.change(search, { target: { value: "Корм" } });
  fireEvent.click(await dialog.findByRole("checkbox", { name: "Без категории" }));
  openTab("Минералы");
  await waitFor(() => expect(foodsApi.matrix).toHaveBeenLastCalledWith(expect.objectContaining({
    q: "Корм", categoryPairs: [{ category: null, subcategory: null, allSubcategories: true }],
    nutrientCategory: "mineral", offset: 0, limit: 50, sort: "name", sortDir: "asc",
  })));
  expect(await dialog.findByText("Загружено 50 из 101")).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Название" }));
  await waitFor(() => expect(foodsApi.matrix).toHaveBeenLastCalledWith(expect.objectContaining({
    offset: 0, sort: "name", sortDir: "desc",
  })));
  await waitFor(() => expect(dialog.getByRole("button", { name: "Загрузить ещё" })).toBeEnabled());

  fireEvent.click(dialog.getByRole("button", { name: "Загрузить ещё" }));
  expect(await dialog.findByText("Не удалось загрузить следующую порцию.")).toBeVisible();
  expect(dialog.getByText("Загружено 50 из 101")).toBeVisible();
  failNextPage = false;
  fireEvent.click(dialog.getByRole("button", { name: "Загрузить ещё" }));
  expect(await dialog.findByText("Загружено 100 из 101")).toBeVisible();
  expect(foodsApi.matrix).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50, limit: 50 }));
  fireEvent.click(dialog.getByRole("button", { name: "Загрузить ещё" }));
  expect(await dialog.findByRole("button", { name: "Все загружены" })).toBeDisabled();

  fireEvent.click(dialog.getByRole("button", { name: "Добавить Корм 101" }));
  expect(dialog.getByRole("button", { name: "Корм 101 уже добавлен" })).toBeDisabled();
  expect(dialog.queryByRole("button", { name: /Создать продукт|Открыть карточку продукта/ })).not.toBeInTheDocument();
  expect(foodsApi.list).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("textbox", { name: "Количество, г/сут: Корм 101" })).toHaveValue("100");

  openModal();
  const reopened = within(screen.getByRole("dialog", { name: "Добавить продукт" }));
  expect(reopened.getByRole("searchbox")).toHaveValue("");
  expect(reopened.getByRole("checkbox", { name: "Без категории" })).not.toBeChecked();
  expect(reopened.getByRole("tab", { name: "Основные" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(reopened.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  openTab("Каталог");
  expect(screen.getByRole("searchbox")).toHaveValue("Каталог");
});

it("builds and saves a ration after explicit profile confirmation", async () => {
  renderWorkspace();
  fireEvent.click(screen.getAllByRole("button", { name: "Добавить продукт" })[0]);
  const search = screen.getByRole("searchbox", { name: "Поиск продукта по названию" });
  fireEvent.change(search, { target: { value: food.name } });
  fireEvent.click(await screen.findByRole("button", { name: `Добавить ${food.name}` }));
  fireEvent.keyDown(search, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const grams = screen.getByRole("textbox", { name: `Количество, г/сут: ${food.name}` });
  const save = screen.getByRole("button", { name: "Сохранить план" });
  expect(save).toBeDisabled();
  await waitFor(() => expect(assessmentsApi.create).toHaveBeenCalledWith(expect.objectContaining({ profile_selection: null })));
  fireEvent.click(screen.getByRole("button", { name: "Выбрать профиль" }));
  fireEvent.click(await screen.findByRole("button", { name: "Выбрать рекомендованный" }));
  expect(save).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Подтвердить профиль" }));
  fireEvent.change(grams, { target: { value: "120" } });
  expect(save).toBeDisabled();
  await waitFor(() => expect(save).toBeEnabled());
  expect(screen.getByText("300 ккал/100 г · 360 ккал/сут")).toBeVisible();
  fireEvent.click(save);
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.click(dialog.getByRole("button", { name: "Сохранить план" }));
  await waitFor(() => expect(dietPlansApi.create).toHaveBeenCalledWith(expect.objectContaining({
    expected_input_hash: "a".repeat(64),
    assessment_request: expect.objectContaining({
      components: [{ food_uuid: food.uuid, grams: 120 }],
      profile_selection: expect.objectContaining({ profile_code: profile, source: "recommendation" }),
    }),
  })));
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/nutrition?planId=plan-1"));
});

it("opens a historical profile and reloads the context when the editing patient changes", async () => {
  const legacy = savedPlan();
  legacy.assessment_snapshot.request.profile_selection = null;
  vi.mocked(dietPlansApi.get).mockResolvedValueOnce(legacy);
  navigation.params = new URLSearchParams("planId=plan-1");
  renderWorkspace();
  await screen.findByText("Сохранённый расчёт");
  expect(screen.getByText("Предыдущая методика расчёта")).toBeVisible();
  expect(screen.getByText(/Взрослая собака · MER 110/)).toBeVisible();
  expect(screen.getByRole("textbox", { name: `Количество, г/сут: ${food.name}` })).toHaveAttribute("readonly");
  expect(assessmentsApi.create).not.toHaveBeenCalled();
  expect(assessmentsApi.suggestions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Редактировать и пересчитать" }));
  fireEvent.click(screen.getByRole("button", { name: "Выбрать профиль" }));
  const confirm = screen.getByRole("button", { name: "Подтвердить профиль" });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  await waitFor(() => expect(screen.getByRole("button", { name: "Пересчитать и сохранить" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Выбрать Миру" }));
  await waitFor(() => expect(assessmentsApi.create).toHaveBeenCalledWith(expect.objectContaining({
    animal: expect.objectContaining({ species: "cat", current_body_weight_kg: 4 }),
    profile_selection: null,
  })));
  expect(screen.getByRole("button", { name: "Пересчитать и сохранить" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Изменить профиль" }));
  expect(screen.getByLabelText("Профиль")).toHaveValue(profile);
  fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
  fireEvent.click(screen.getByRole("button", { name: `Удалить ${food.name}` }));
  expect(screen.getByText("Рацион пока пуст")).toBeVisible();
});

it("shows a failed recalculation and retries the current inputs", async () => {
  navigation.params = new URLSearchParams("planId=plan-1");
  vi.mocked(assessmentsApi.create).mockRejectedValueOnce(new Error("Сбой расчёта"));
  renderWorkspace();
  fireEvent.click(await screen.findByRole("button", { name: "Редактировать и пересчитать" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Сбой расчёта");
  const grams = screen.getByRole("textbox", { name: `Количество, г/сут: ${food.name}` });
  expect(grams).toHaveValue("100");
  fireEvent.click(screen.getByRole("button", { name: "Повторить расчёт" }));
  await waitFor(() => expect(assessmentsApi.create).toHaveBeenCalledTimes(2));
  expect(assessmentsApi.create).toHaveBeenLastCalledWith(expect.objectContaining({
    components: [{ food_uuid: food.uuid, grams: 100 }],
  }));
  await screen.findByText("300 ккал/100 г · 300 ккал/сут");
  expect(screen.queryByText("Сбой расчёта")).not.toBeInTheDocument();
});
