import type { paths } from "@vetdietderm/api-contract";
import type { Schemas } from "@/shared/api/schema";
import { api } from "@/shared/api/client";
import type { Species } from "@/features/patients/api";

export type FoodType = Schemas["FoodType"];

export type FeedForm = Schemas["FeedForm"];

export type WeightBasis = Schemas["ResolvedContext"]["weight_basis"];

export type NutrientCategory = Schemas["NutrientCategory"];

export type NutrientValueStatus = Schemas["NutrientValueStatus"];

export type NutrientRecord = Schemas["NutrientRead"];

export type FoodSummaryRecord = Schemas["FoodSummary"];

export type FoodCategoryGroupRecord = Schemas["FoodCategoryGroup"];

export interface FoodCategoryPair {
  category: string | null;
  subcategory: string | null;
  allSubcategories?: boolean;
}

export type FoodMatrixSortDirection = NonNullable<NonNullable<paths["/foods/matrix"]["get"]["parameters"]["query"]>["sort_dir"]>;

export type FoodMatrixValueRecord = Schemas["FoodMatrixValue"];

export type FoodMatrixRowRecord = Schemas["FoodMatrixRow"];

export type FoodMatrixPageRecord = Schemas["FoodMatrixPage"];

export interface FoodMatrixParams {
  q: string;
  categoryPairs: FoodCategoryPair[];
  nutrientCategory: NutrientCategory;
  sort: string;
  sortDir: FoodMatrixSortDirection;
  offset?: number;
  limit?: number;
}

export type FoodNutrientValueRecord = Schemas["FoodNutrientValueRead"];

export type FoodRecord = Schemas["FoodRead"];

export type FoodWrite = Schemas["FoodCreate"];

export type FoodNutrientValueWrite = Schemas["FoodNutrientValueWrite"];

export type AssessmentStatus = Schemas["AssessmentStatus"];

export type AssessmentAnimal = Schemas["AnimalProfile"];

export type AssessmentSuggestionOption = Schemas["SuggestionOption"];

export type AssessmentFormulaOption = Schemas["FormulaSuggestionOption"];

export type AssessmentContextSuggestion = Schemas["ContextSuggestion"];

export type AssessmentSizeClassOption = Schemas["SizeClassSuggestionOption"];

export type GuidelineEditionRecord = Schemas["EditionIdentity"];

export type ActiveGuidelineRecord = Schemas["ActiveGuidelineRead"];

export type GuidelineContextOptionsRecord = Schemas["GuidelineContextOptionsRead"];

export type AssessmentSuggestionsRecord = Schemas["SuggestionsResponse"];

export type AssessmentRequestPayload = Schemas["AssessmentRequest"];

export type EnergyEstimateValue = Schemas["EnergyEstimateResponse"]["value"];

export type EnergyEstimateRequestPayload = Schemas["EnergyEstimateRequest"];

export type EnergyEstimateRecord = Schemas["EnergyEstimateResponse"];

export type AssessmentEnergyRecord = Schemas["EnergyAssessment"];

export type AssessmentRowRecord = Schemas["AssessmentRow"];

export type AssessmentRecord = Schemas["AssessmentResponse"];

export type DietPlanRationComponent = Schemas["DietPlanRationComponent"];

export type DietPlanSummaryRecord = Schemas["DietPlanSummary"];

export type DietPlanRecord = Schemas["DietPlanRead"];

export type DietPlanWrite = Schemas["DietPlanWrite"];

function foodSearchUrl(q: string, type?: FoodType, categoryPairs: FoodCategoryPair[] = []): string {
  const params = new URLSearchParams();
  params.set("q", q);
  if (type) params.set("type", type);
  for (const pair of categoryPairs) {
    params.append("category", pair.category ?? "__none__");
    params.append("subcategory", pair.allSubcategories ? "__all__" : pair.subcategory ?? "__none__");
  }
  return `/foods?${params.toString()}`;
}

function foodMatrixUrl(options: FoodMatrixParams): string {
  const params = new URLSearchParams({
    q: options.q,
    nutrient_category: options.nutrientCategory,
    sort: options.sort,
    sort_dir: options.sortDir,
    offset: String(options.offset ?? 0),
    limit: String(options.limit ?? 50),
  });
  for (const pair of options.categoryPairs) {
    params.append("category", pair.category ?? "__none__");
    params.append("subcategory", pair.allSubcategories ? "__all__" : pair.subcategory ?? "__none__");
  }
  return `/foods/matrix?${params.toString()}`;
}

export const foodsApi = {
  list: (
    q = "",
    type?: FoodType,
    categoryPairs: FoodCategoryPair[] = [],
    fallbackMessage = "Не удалось загрузить каталог",
  ) => api.get<FoodSummaryRecord[]>(foodSearchUrl(q, type, categoryPairs), fallbackMessage),
  categories: (fallbackMessage = "Не удалось загрузить категории каталога") =>
    api.get<FoodCategoryGroupRecord[]>("/foods/categories", fallbackMessage),
  matrix: (options: FoodMatrixParams, fallbackMessage = "Не удалось загрузить таблицу каталога") =>
    api.get<FoodMatrixPageRecord>(foodMatrixUrl(options), fallbackMessage),
  get: (id: string, fallbackMessage = "Продукт не найден") =>
    api.get<FoodRecord>(`/foods/${id}`, fallbackMessage),
  create: (body: FoodWrite, fallbackMessage = "Не удалось создать продукт") =>
    api.post<FoodRecord>("/foods", body, fallbackMessage),
  update: (id: string, body: Partial<FoodWrite>, fallbackMessage = "Не удалось сохранить продукт") =>
    api.patch<FoodRecord>(`/foods/${id}`, body, fallbackMessage),
  replaceNutrients: (
    id: string,
    body: FoodNutrientValueWrite[],
    fallbackMessage = "Не удалось сохранить нутриенты",
  ) => api.put<FoodRecord>(`/foods/${id}/nutrient-values`, body, fallbackMessage),
};

export const nutrientsApi = {
  list: (fallbackMessage = "Не удалось загрузить справочник нутриентов") =>
    api.get<NutrientRecord[]>("/nutrients", fallbackMessage),
};

export const guidelinesApi = {
  active: (fallbackMessage = "Не удалось загрузить опубликованную редакцию FEDIAF") =>
    api.get<ActiveGuidelineRecord>("/guidelines/active", fallbackMessage),
  contextOptions: (
    species: Exclude<Species, "other">,
    fallbackMessage = "Не удалось загрузить клинические варианты FEDIAF",
  ) => api.get<GuidelineContextOptionsRecord>(
    `/guidelines/context-options?${new URLSearchParams({ species }).toString()}`,
    fallbackMessage,
  ),
};

export const assessmentsApi = {
  suggestions: (animal: AssessmentAnimal, fallbackMessage = "Не удалось подобрать контекст FEDIAF") =>
    api.post<AssessmentSuggestionsRecord>("/assessments/suggestions", { animal }, fallbackMessage),
  energyEstimate: (
    body: EnergyEstimateRequestPayload,
    fallbackMessage = "Не удалось рассчитать энергетический сценарий",
  ) => api.post<EnergyEstimateRecord>("/assessments/energy-estimate", body, fallbackMessage),
  create: (body: AssessmentRequestPayload, fallbackMessage = "Не удалось оценить рацион") =>
    api.post<AssessmentRecord>("/assessments", body, fallbackMessage),
};

function dietPlanListUrl(patientId?: string): string {
  if (!patientId) return "/diet-plans";
  const params = new URLSearchParams({ patientId });
  return `/diet-plans?${params.toString()}`;
}

export const dietPlansApi = {
  list: (patientId?: string, fallbackMessage = "Не удалось загрузить планы питания") =>
    api.get<DietPlanSummaryRecord[]>(dietPlanListUrl(patientId), fallbackMessage),
  get: (id: string, fallbackMessage = "План питания не найден") =>
    api.get<DietPlanRecord>(`/diet-plans/${id}`, fallbackMessage),
  create: (body: DietPlanWrite, fallbackMessage = "Не удалось сохранить план") =>
    api.post<DietPlanRecord>("/diet-plans", body, fallbackMessage),
  update: (id: string, body: DietPlanWrite, fallbackMessage = "Не удалось пересчитать и сохранить план") =>
    api.patch<DietPlanRecord>(`/diet-plans/${id}`, body, fallbackMessage),
};
