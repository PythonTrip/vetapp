const TOKEN_KEY = "vetdietderm.instance_bearer";

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  return raw.replace(/\/$/, "");
}

export function getInstanceToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setInstanceToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearInstanceToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export interface ApiErrorPayload {
  error?: string;
  detail?: unknown;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export class ApiConnectionError extends Error {
  constructor(message = "API unavailable") {
    super(message);
    this.name = "ApiConnectionError";
  }
}

type JsonRequestInit = Omit<RequestInit, "body"> & {
  body?: unknown;
};

function resolveUrl(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) return input;
  const path = input.startsWith("/") ? input : `/${input}`;
  return `${getApiBaseUrl()}${path}`;
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as ApiErrorPayload;
    if (typeof record.detail === "string" && record.detail.trim()) return record.detail;
    if (
      record.detail
      && typeof record.detail === "object"
      && "message" in record.detail
      && typeof record.detail.message === "string"
      && record.detail.message.trim()
    ) return record.detail.message;
    if (typeof record.error === "string" && record.error.trim()) return record.error;
  }
  return fallback;
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();

  const text = await response.text();
  return text || undefined;
}

export async function apiRequest<T>(
  input: string,
  { body, headers, ...init }: JsonRequestInit = {},
  fallbackMessage = "Request failed",
): Promise<T> {
  const token = getInstanceToken();
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(resolveUrl(input), {
      ...init,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiConnectionError("API unavailable");
  }

  const payload = await readPayload(response);

  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as ApiErrorPayload : undefined;
    throw new ApiError(
      messageFromPayload(payload, fallbackMessage),
      response.status,
      record?.details ?? (record?.detail && typeof record.detail === "object" ? record.detail : undefined),
    );
  }

  return payload as T;
}

export async function apiUpload<T>(
  input: string,
  body: FormData,
  fallbackMessage = "Request failed",
): Promise<T> {
  const token = getInstanceToken();
  const requestHeaders = new Headers();
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(resolveUrl(input), {
      method: "POST",
      headers: requestHeaders,
      body,
    });
  } catch {
    throw new ApiConnectionError("API unavailable");
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as ApiErrorPayload : undefined;
    throw new ApiError(
      messageFromPayload(payload, fallbackMessage),
      response.status,
      record?.details ?? (record?.detail && typeof record.detail === "object" ? record.detail : undefined),
    );
  }
  return payload as T;
}

export async function apiBlob(input: string, fallbackMessage = "Request failed"): Promise<Blob> {
  const token = getInstanceToken();
  const requestHeaders = new Headers();
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(resolveUrl(input), { headers: requestHeaders });
  } catch {
    throw new ApiConnectionError("API unavailable");
  }

  if (!response.ok) {
    const payload = await readPayload(response);
    throw new ApiError(messageFromPayload(payload, fallbackMessage), response.status);
  }
  return response.blob();
}

export const api = {
  get: <T>(url: string, fallbackMessage?: string) =>
    apiRequest<T>(url, undefined, fallbackMessage),
  post: <T>(url: string, body: unknown, fallbackMessage?: string) =>
    apiRequest<T>(url, { method: "POST", body }, fallbackMessage),
  patch: <T>(url: string, body: unknown, fallbackMessage?: string) =>
    apiRequest<T>(url, { method: "PATCH", body }, fallbackMessage),
  put: <T>(url: string, body: unknown, fallbackMessage?: string) =>
    apiRequest<T>(url, { method: "PUT", body }, fallbackMessage),
  delete: <T = void>(url: string, fallbackMessage?: string) =>
    apiRequest<T>(url, { method: "DELETE" }, fallbackMessage),
};

export type Species = "dog" | "cat" | "other";
export type FoodType = "commercial" | "ingredient" | "supplement";
export type FeedForm = "dry" | "wet" | "unknown";
export type WeightBasis = "current" | "target_override";
export type NutrientCategory = "main" | "mineral" | "vitamin" | "amino_acid" | "fatty_acid";
export type NutrientValueStatus =
  | "measured"
  | "calculated"
  | "estimated"
  | "trace"
  | "not_detected"
  | "unknown";

export interface NutrientRecord {
  uuid: string;
  code: string;
  name: string;
  category: NutrientCategory;
  base_unit: string;
  sort_order: number;
  is_active: boolean;
}

export interface FoodSummaryRecord {
  uuid: string;
  name: string;
  type: FoodType;
  feed_form: FeedForm;
  category: string | null;
  subcategory: string | null;
  created_at: string;
  updated_at: string;
}

export interface FoodCategoryGroupRecord {
  category: string | null;
  subcategories: Array<string | null>;
}

export interface FoodCategoryPair {
  category: string | null;
  subcategory: string | null;
  allSubcategories?: boolean;
}

export type FoodMatrixSortDirection = "asc" | "desc";

export interface FoodMatrixValueRecord {
  code: string;
  value: number | null;
}

export interface FoodMatrixRowRecord extends FoodSummaryRecord {
  nutrient_values: FoodMatrixValueRecord[];
}

export interface FoodMatrixPageRecord {
  items: FoodMatrixRowRecord[];
  total: number;
}

export interface FoodMatrixParams {
  q: string;
  categoryPairs: FoodCategoryPair[];
  nutrientCategory: NutrientCategory;
  sort: string;
  sortDir: FoodMatrixSortDirection;
  offset?: number;
  limit?: number;
}

export interface FoodNutrientValueRecord {
  uuid: string;
  code: string;
  value: number | null;
  basis: string;
  value_status: NutrientValueStatus;
  source_uuid: string | null;
}

export interface FoodRecord extends FoodSummaryRecord {
  nutrient_values: FoodNutrientValueRecord[];
}

export interface FoodWrite {
  name: string;
  type: FoodType;
  feed_form: FeedForm;
  category?: string | null;
  subcategory?: string | null;
}

export interface FoodNutrientValueWrite {
  code: string;
  value: number | null;
  value_status: NutrientValueStatus;
}

export interface ClientRecord {
  uuid: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientRecord {
  uuid: string;
  client_uuid: string;
  client: ClientRecord;
  name: string;
  species: Species;
  breed: string;
  body_weight_kg: number | null;
  expected_adult_weight_kg: number | null;
  birth_date: string | null;
  life_stage: string | null;
  activity: string | null;
  neutered: boolean;
  pregnant: boolean;
  lactating: boolean;
  lactation_week: number | null;
  litter_size: number | null;
  bcs: number | null;
  allergies: string[];
  chronic_conditions: string[];
  feeding_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientWrite {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface PatientWrite {
  client_uuid: string;
  name: string;
  species: Species;
  breed?: string;
  body_weight_kg?: number | null;
  expected_adult_weight_kg?: number | null;
  birth_date?: string | null;
  life_stage?: string | null;
  activity?: string | null;
  neutered?: boolean;
  pregnant?: boolean;
  lactating?: boolean;
  lactation_week?: number | null;
  litter_size?: number | null;
  bcs?: number | null;
  allergies?: string[];
  chronic_conditions?: string[];
  feeding_notes?: string | null;
}

export type AssessmentStatus =
  | "met"
  | "below_minimum"
  | "above_maximum"
  | "not_established"
  | "not_applicable"
  | "insufficient_context"
  | "missing_product_data";

export interface AssessmentAnimal {
  species: Species;
  current_body_weight_kg: number | null;
  target_body_weight_kg: number | null;
  expected_mature_weight_kg: number | null;
  age_months: number | null;
  life_stage: string | null;
  activity: string | null;
  neutered: boolean;
  pregnant: boolean;
  lactating: boolean;
  lactation_week: number | null;
  litter_size: number | null;
  bcs: number | null;
}

export interface AssessmentSuggestionOption {
  code: string;
  name_ru: string;
}

export interface AssessmentFormulaOption extends AssessmentSuggestionOption {
  required_animal_fields: string[];
  result_kind: "point" | "range";
  allowed_weight_bases: WeightBasis[];
}

export interface AssessmentContextSuggestion {
  code: string;
  reason: string;
}

export interface AssessmentSizeClassOption extends AssessmentSuggestionOption {
  min_adult_weight_kg: number | null;
  max_adult_weight_kg: number | null;
}

export interface GuidelineEditionRecord {
  code: string;
  source_checksum: string;
  source_title: string;
  source_url: string;
  clinical_warning_ru: string;
}

export interface ActiveGuidelineRecord extends GuidelineEditionRecord {
  edition_uuid: string;
  standard_code: string;
  import_version: number;
  publication_date: string | null;
  language: string;
  published_at: string;
}

export interface GuidelineContextOptionsRecord {
  edition_code: string;
  profile_options: AssessmentSuggestionOption[];
  energy_formula_options: AssessmentFormulaOption[];
  size_class_options: AssessmentSizeClassOption[];
}

export interface AssessmentSuggestionsRecord {
  edition: GuidelineEditionRecord;
  profile_options: AssessmentSuggestionOption[];
  energy_formula_options: AssessmentFormulaOption[];
  size_class_options: AssessmentSizeClassOption[];
  energy_suggestion: AssessmentContextSuggestion | null;
  nutrient_standard_suggestion: AssessmentContextSuggestion | null;
  suggested_profile_code: string | null;
  suggested_energy_formula_code: string | null;
  suggested_size_class_code: string | null;
  confidence: string;
  confidence_ru: string;
}

export interface AssessmentRequestPayload {
  animal: AssessmentAnimal;
  feed_form: FeedForm;
  therapeutic_goal: boolean;
  rer_factor: number;
  energy_adjustment_percent: number;
  ration_species_mismatch_confirmed: boolean;
  components: { food_uuid: string; grams: number }[];
}

export type EnergyEstimateValue =
  | { kind: "point"; kcal_day: number }
  | { kind: "range"; min_kcal_day: number; max_kcal_day: number };

export interface EnergyEstimateRequestPayload {
  animal: AssessmentAnimal;
  energy_adjustment_percent: number;
}

export interface EnergyEstimateRecord {
  energy_formula_code: string | null;
  value: EnergyEstimateValue | null;
  inputs: Record<string, number>;
  source: { edition: string; table: string | null; page: number | null };
  warnings: string[];
  missing_fields: string[];
  weight_basis: WeightBasis;
  size_class_code: string | null;
  base_mer_value: { kind: "point"; kcal_day: number } | null;
  multiplier_value:
    | { kind: "point"; factor: number }
    | { kind: "range"; min_factor: number; max_factor: number }
    | null;
  reference_energy_kcal: number | null;
  range_working_point_rule: "midpoint" | null;
  energy_adjustment_percent: number;
  working_energy_kcal: number | null;
}

export interface AssessmentEnergyRecord {
  energy_formula_code: string | null;
  reference_energy_kcal: number | null;
  reference_energy_min_kcal: number | null;
  reference_energy_max_kcal: number | null;
  range_working_point_rule: "midpoint" | null;
  energy_adjustment_percent: number;
  working_energy_kcal: number | null;
  rer_kcal_day: number | null;
  rer_factor: number;
  rer_factor_kcal_day: number | null;
  complete: boolean;
  missing_fields: string[];
  explanation_ru: string | null;
}

export interface AssessmentRowRecord {
  code: string;
  name: string;
  unit: string;
  derived: boolean;
  ration_per_1000_kcal_me: number | null;
  ration_daily_amount: number | null;
  target: {
    minimum: number | null;
    maximum: number | null;
    unit: string;
    basis: string;
    source_value_text: string | null;
  } | null;
  status: AssessmentStatus;
  completeness: {
    complete_components: number;
    total_components: number;
    missing_food_names: string[];
  };
  source: {
    title: string;
    url: string;
    page: number | null;
    table: string | null;
    row: string | null;
  };
  note_ru: string | null;
}

export interface AssessmentRecord {
  engine_id: string;
  edition: GuidelineEditionRecord;
  context: {
    nutrient_profile_code: string | null;
    energy_formula_code: string | null;
    size_class_code: string | null;
    weight_basis: WeightBasis;
    feed_form: FeedForm;
    therapeutic_goal: boolean;
    ration_species_mismatch_confirmed: boolean;
  };
  energy: AssessmentEnergyRecord;
  coverage: {
    expected_atomic_count: number;
    complete_atomic_count: number;
    percent: number;
    below_threshold: boolean;
  };
  rows: AssessmentRowRecord[];
  met_count: number;
  below_minimum_count: number;
  above_maximum_count: number;
  unevaluable_count: number;
  overall: "adequate" | "inadequate" | "indeterminate";
  input_hash: string | null;
  normative_comparison_performed: boolean;
  gate: { code: string; explanation_ru: string } | null;
}

export interface DietPlanRationComponent {
  food_uuid: string;
  grams: number;
  food_name: string;
  food_type: FoodType;
  feed_form: FeedForm;
}

export interface DietPlanSummaryRecord {
  uuid: string;
  name: string;
  patient_uuid: string | null;
  patient: { uuid: string; name: string } | null;
  engine_id: string;
  edition_code: string;
  edition_source_checksum: string;
  created_at: string;
  updated_at: string;
}

export interface DietPlanRecord extends DietPlanSummaryRecord {
  ration: DietPlanRationComponent[];
  assessment_snapshot: {
    request: AssessmentRequestPayload;
    assessment: AssessmentRecord;
    nutrient_profile_code: string | null;
    energy_formula_code: string | null;
  };
  notes: string | null;
}

export interface DietPlanWrite {
  name: string;
  patient_uuid: string | null;
  notes: string | null;
  assessment_request: AssessmentRequestPayload;
}

export type PatientPatch = Partial<Omit<PatientWrite, "client_uuid">> & {
  client_uuid?: string;
};

function searchUrl(path: string, q: string): string {
  const params = new URLSearchParams();
  params.set("q", q);
  return `${path}?${params.toString()}`;
}

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

export const clientsApi = {
  list: (q = "", fallbackMessage = "Не удалось загрузить клиентов") =>
    api.get<ClientRecord[]>(searchUrl("/clients", q), fallbackMessage),
  get: (id: string, fallbackMessage = "Клиент не найден") =>
    api.get<ClientRecord>(`/clients/${id}`, fallbackMessage),
  create: (body: ClientWrite, fallbackMessage = "Не удалось создать клиента") =>
    api.post<ClientRecord>("/clients", body, fallbackMessage),
  update: (id: string, body: ClientWrite, fallbackMessage = "Не удалось сохранить клиента") =>
    api.patch<ClientRecord>(`/clients/${id}`, body, fallbackMessage),
};

export const patientsApi = {
  list: (q = "", fallbackMessage = "Не удалось загрузить пациентов") =>
    api.get<PatientRecord[]>(searchUrl("/patients", q), fallbackMessage),
  get: (id: string, fallbackMessage = "Пациент не найден") =>
    api.get<PatientRecord>(`/patients/${id}`, fallbackMessage),
  create: (body: PatientWrite, fallbackMessage = "Не удалось создать пациента") =>
    api.post<PatientRecord>("/patients", body, fallbackMessage),
  update: (id: string, body: PatientPatch, fallbackMessage = "Не удалось сохранить пациента") =>
    api.patch<PatientRecord>(`/patients/${id}`, body, fallbackMessage),
};

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

export type EncounterSpecialty = "dermatology" | "nutrition" | "general";
export type EncounterType = "appointment" | "note" | "diagnostic" | "treatment";
export type EncounterStatus = "draft" | "in_progress" | "completed";
export type AttachmentKind = "lesion_photo" | "document";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";
export type VisitType = "consultation" | "recheck" | "procedure" | "telemedicine";
export type CommunicationChannel = "phone" | "email" | "text" | "video" | "in_person";
export type CommunicationDirection = "inbound" | "outbound";
export type EncounterTemplateScope = "standard" | "clinic" | "doctor";
export type EncounterTemplateSection = "anamnesis" | "exam" | "plan";

export interface PrescriptionItem {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface AnamnesisData {
  specialty: EncounterSpecialty;
  answers: Record<string, string | string[]>;
  free_text?: string | null;
}

export interface EncounterRecord {
  uuid: string;
  patient_uuid: string;
  specialty: EncounterSpecialty;
  type: EncounterType;
  status: EncounterStatus;
  chief_complaint: string | null;
  anamnesis: string | null;
  anamnesis_data: AnamnesisData | null;
  exam: string | null;
  plan: string | null;
  diagnoses: string[];
  prescriptions: PrescriptionItem[];
  vas_score: number | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export interface EncounterWrite {
  specialty: EncounterSpecialty;
  type: EncounterType;
  status: EncounterStatus;
  chief_complaint?: string | null;
  anamnesis?: string | null;
  anamnesis_data?: AnamnesisData | null;
  exam?: string | null;
  plan?: string | null;
  diagnoses?: string[];
  prescriptions?: PrescriptionItem[];
  vas_score?: number | null;
  occurred_at?: string | null;
}

export interface AttachmentRecord {
  uuid: string;
  patient_uuid: string;
  encounter_uuid: string | null;
  kind: AttachmentKind;
  caption: string | null;
  body_region: string | null;
  vas_score: number | null;
  content_type: string;
  byte_size: number;
  created_at: string;
  updated_at: string;
}

export interface AttachmentPatch {
  encounter_uuid?: string | null;
  kind?: AttachmentKind;
  caption?: string | null;
  body_region?: string | null;
  vas_score?: number | null;
}

export interface AppointmentRecord {
  uuid: string;
  patient_uuid: string;
  encounter_uuid: string | null;
  starts_at: string;
  duration_min: number;
  visit_type: VisitType;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  patient: PatientRecord;
}

export interface AppointmentWrite {
  patient_uuid: string;
  encounter_uuid?: string | null;
  starts_at: string;
  duration_min: number;
  visit_type: VisitType;
  status: AppointmentStatus;
  notes?: string | null;
}

export interface CommunicationRecord {
  uuid: string;
  patient_uuid: string;
  client_uuid: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  subject: string | null;
  body: string | null;
  occurred_at: string;
  follow_up_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunicationWrite {
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  subject?: string | null;
  body?: string | null;
  occurred_at?: string | null;
  follow_up_at?: string | null;
}

export interface EncounterTemplateRecord {
  uuid: string;
  scope: EncounterTemplateScope;
  section: EncounterTemplateSection;
  specialty: EncounterSpecialty;
  title: string;
  body: string;
  doctor_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EncounterTemplateWrite {
  scope: Exclude<EncounterTemplateScope, "standard">;
  section: EncounterTemplateSection;
  specialty: EncounterSpecialty;
  title: string;
  body: string;
  doctor_name?: string | null;
}

export const encountersApi = {
  list: (patientId: string, fallbackMessage = "Не удалось загрузить приёмы") =>
    api.get<EncounterRecord[]>(`/patients/${patientId}/encounters`, fallbackMessage),
  create: (patientId: string, body: EncounterWrite, fallbackMessage = "Не удалось создать приём") =>
    api.post<EncounterRecord>(`/patients/${patientId}/encounters`, body, fallbackMessage),
  update: (id: string, body: Partial<EncounterWrite>, fallbackMessage = "Не удалось сохранить приём") =>
    api.patch<EncounterRecord>(`/encounters/${id}`, body, fallbackMessage),
  delete: (id: string, fallbackMessage = "Не удалось удалить приём") =>
    api.delete(`/encounters/${id}`, fallbackMessage),
};

function encounterTemplateListUrl(doctorName?: string): string {
  if (!doctorName?.trim()) return "/encounter-templates";
  const params = new URLSearchParams({ doctorName: doctorName.trim() });
  return `/encounter-templates?${params.toString()}`;
}

export const encounterTemplatesApi = {
  list: (doctorName?: string, fallbackMessage = "Не удалось загрузить шаблоны") =>
    api.get<EncounterTemplateRecord[]>(encounterTemplateListUrl(doctorName), fallbackMessage),
  create: (body: EncounterTemplateWrite, fallbackMessage = "Не удалось создать шаблон") =>
    api.post<EncounterTemplateRecord>("/encounter-templates", body, fallbackMessage),
  update: (
    id: string,
    body: Partial<EncounterTemplateWrite>,
    fallbackMessage = "Не удалось сохранить шаблон",
  ) => api.patch<EncounterTemplateRecord>(`/encounter-templates/${id}`, body, fallbackMessage),
  delete: (id: string, fallbackMessage = "Не удалось удалить шаблон") =>
    api.delete(`/encounter-templates/${id}`, fallbackMessage),
};

export const attachmentsApi = {
  list: (patientId: string, fallbackMessage = "Не удалось загрузить галерею") =>
    api.get<AttachmentRecord[]>(`/patients/${patientId}/attachments`, fallbackMessage),
  upload: (patientId: string, body: FormData, fallbackMessage = "Не удалось загрузить файл") =>
    apiUpload<AttachmentRecord>(`/patients/${patientId}/attachments`, body, fallbackMessage),
  file: (id: string, fallbackMessage = "Не удалось открыть файл") =>
    apiBlob(`/attachments/${id}/file`, fallbackMessage),
  update: (id: string, body: AttachmentPatch, fallbackMessage = "Не удалось сохранить подпись") =>
    api.patch<AttachmentRecord>(`/attachments/${id}`, body, fallbackMessage),
  delete: (id: string, fallbackMessage = "Не удалось удалить файл") =>
    api.delete(`/attachments/${id}`, fallbackMessage),
};

function appointmentListUrl(params?: { patientId?: string; from?: string; to?: string }): string {
  const search = new URLSearchParams();
  if (params?.patientId) search.set("patientId", params.patientId);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  return query ? `/appointments?${query}` : "/appointments";
}

export const appointmentsApi = {
  list: (
    params?: { patientId?: string; from?: string; to?: string },
    fallbackMessage = "Не удалось загрузить расписание",
  ) => api.get<AppointmentRecord[]>(appointmentListUrl(params), fallbackMessage),
  create: (body: AppointmentWrite, fallbackMessage = "Не удалось создать запись") =>
    api.post<AppointmentRecord>("/appointments", body, fallbackMessage),
  update: (id: string, body: Partial<AppointmentWrite>, fallbackMessage = "Не удалось сохранить запись") =>
    api.patch<AppointmentRecord>(`/appointments/${id}`, body, fallbackMessage),
  delete: (id: string, fallbackMessage = "Не удалось удалить запись") =>
    api.delete(`/appointments/${id}`, fallbackMessage),
};

export const communicationsApi = {
  list: (patientId: string, fallbackMessage = "Не удалось загрузить журнал") =>
    api.get<CommunicationRecord[]>(`/patients/${patientId}/communications`, fallbackMessage),
  create: (patientId: string, body: CommunicationWrite, fallbackMessage = "Не удалось сохранить контакт") =>
    api.post<CommunicationRecord>(`/patients/${patientId}/communications`, body, fallbackMessage),
  update: (
    id: string,
    body: Partial<CommunicationWrite>,
    fallbackMessage = "Не удалось сохранить контакт",
  ) => api.patch<CommunicationRecord>(`/communications/${id}`, body, fallbackMessage),
  delete: (id: string, fallbackMessage = "Не удалось удалить запись журнала") =>
    api.delete(`/communications/${id}`, fallbackMessage),
};
