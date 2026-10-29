import type { components, paths } from "@vetdietderm/api-contract";
import { ApiError, ApiConnectionError, createApiClient, dataOf } from "@vetdietderm/api-client";
export { ApiError, ApiConnectionError } from "@vetdietderm/api-client";
import type { Workspace } from "@vetdietderm/api-client";
export type { Workspace } from "@vetdietderm/api-client";
type Schemas = components["schemas"];

export function getApiBaseUrl(): string {
  return "/api";
}

export type BookableVisitType = Schemas["QuestionnaireRead"]["visit_type"];
export type VisitQuestionKind = Schemas["QuestionKind"];
export type VisitQuestionWrite = Schemas["QuestionWrite"];
export type VisitQuestionnaire = Schemas["QuestionnaireRead"];
export const visitQuestionnairesApi = {
  list: async () => dataOf(await staffContractClient.GET("/visit-questionnaires")),
  save: async (type: BookableVisitType, questions: VisitQuestionWrite[]) =>
    dataOf(await staffContractClient.PUT("/visit-questionnaires/{visit_type}", {
      params: { path: { visit_type: type } }, body: { questions },
    })),
};
let workspace: Workspace = "personal";
export function setApiWorkspace(value: Workspace): void { workspace = value; }

export interface ApiErrorPayload {
  error?: string;
  detail?: unknown;
  details?: unknown;
}

type JsonRequestInit = Omit<RequestInit, "body"> & {
  body?: unknown;
  authRecovery?: boolean;
};

interface AuthRecoveryHandlers {
  recover: () => Promise<boolean>;
  onUnauthenticated: () => void;
}

let authRecoveryHandlers: AuthRecoveryHandlers | null = null;
let recoveryFlight: Promise<boolean> | null = null;

// Same-origin cookies remain in the browser; the package never reads them.
const staffContractClient = createApiClient({
  platform: "web", audience: "staff", workspace: () => workspace,
  auth: {
    audience: "staff",
    recover: recoverSession,
  },
});

export function registerAuthRecovery(handlers: AuthRecoveryHandlers): () => void {
  authRecoveryHandlers = handlers;
  return () => {
    if (authRecoveryHandlers === handlers) authRecoveryHandlers = null;
  };
}

function resolveUrl(input: string): string {
  if (/^https?:/.test(input) || input.startsWith("//")) throw new Error("Only relative API paths are supported");
  const path = input.startsWith("/") ? input : `/${input}`;
  return `${getApiBaseUrl()}${path}`;
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as ApiErrorPayload;
    if (Array.isArray(record.detail)) {
      const messages = record.detail.map((item) => item && typeof item.msg === "string" ? item.msg : "").filter(Boolean);
      if (messages.length) return messages.join(". ");
    }
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

function authenticatedHeaders(headers?: HeadersInit): Headers {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("X-Vetapp-CSRF", "1");
  requestHeaders.set("X-Vetapp-Workspace", workspace);
  return requestHeaders;
}

async function fetchResponse(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(resolveUrl(input), { ...init, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiConnectionError("API unavailable");
  }
}

async function recoverSession(): Promise<boolean> {
  if (!authRecoveryHandlers) {
    return false;
  }
  if (!recoveryFlight) {
    const handlers = authRecoveryHandlers;
    recoveryFlight = handlers.recover()
      .catch(() => false)
      .then((recovered) => {
        if (!recovered) handlers.onUnauthenticated();
        return recovered;
      })
      .finally(() => {
        recoveryFlight = null;
      });
  }
  return recoveryFlight;
}

async function fetchWithAuthRecovery(
  input: string,
  init: RequestInit,
  allowRecovery: boolean,
): Promise<Response> {
  const execute = () => fetchResponse(input, {
    ...init,
    headers: authenticatedHeaders(init.headers),
  });
  const response = await execute();
  if (response.status !== 401 || !allowRecovery) return response;
  return await recoverSession() ? execute() : response;
}

function apiError(response: Response, payload: unknown, fallbackMessage: string): ApiError {
  const record = payload && typeof payload === "object" ? payload as ApiErrorPayload : undefined;
  return new ApiError(
    messageFromPayload(payload, fallbackMessage),
    response.status,
    record?.details ?? (record?.detail && typeof record.detail === "object" ? record.detail : undefined),
  );
}

export async function apiRequest<T>(
  input: string,
  { body, headers, authRecovery = true, ...init }: JsonRequestInit = {},
  fallbackMessage = "Request failed",
): Promise<T> {
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }
  const response = await fetchWithAuthRecovery(input, {
    ...init,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  }, authRecovery);

  const payload = await readPayload(response);

  if (!response.ok) throw apiError(response, payload, fallbackMessage);

  return payload as T;
}

export async function apiUpload<T>(
  input: string,
  body: FormData,
  fallbackMessage = "Request failed",
  authRecovery = true,
): Promise<T> {
  const response = await fetchWithAuthRecovery(input, { method: "POST", body }, authRecovery);

  const payload = await readPayload(response);
  if (!response.ok) throw apiError(response, payload, fallbackMessage);
  return payload as T;
}

export async function apiBlob(
  input: string,
  fallbackMessage = "Request failed",
  authRecovery = true,
): Promise<Blob> {
  const response = await fetchWithAuthRecovery(input, {}, authRecovery);

  if (!response.ok) {
    const payload = await readPayload(response);
    throw apiError(response, payload, fallbackMessage);
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

export type Species = Schemas["Species"];
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

export type ClientRecord = Schemas["ClientRead"];

export type Sex = Schemas["Sex"];

export type PatientRecord = Schemas["PatientRead"];

export type ClientWrite = Schemas["ClientCreate"];

export type PatientWrite = Schemas["PatientCreate"];

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

export type PatientPatch = Schemas["PatientUpdate"];

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

export type EncounterSpecialty = Schemas["EncounterSpecialty"];
export type EncounterType = Schemas["EncounterType"];
export type EncounterStatus = Schemas["EncounterStatus"];
export type AttachmentKind = Schemas["AttachmentKind"];
export type AppointmentStatus = Schemas["AppointmentStatus"];
export type VisitType = Schemas["AppointmentRead"]["visit_type"];
export type CommunicationChannel = Schemas["CommunicationChannel"];
export type CommunicationDirection = Schemas["CommunicationDirection"];
export type EncounterTemplateScope = Schemas["TemplateScope"];
export type EncounterTemplateSection = Schemas["TemplateSection"];
export type ClinicalCatalogKind = Schemas["ClinicalCatalogKind"];
export type ClinicalCatalogScope = Schemas["ClinicalCatalogScope"];

export type PrescriptionItem = Schemas["PrescriptionItem"];

export type AnamnesisData = Schemas["AnamnesisData"];

export type EncounterRecord = Schemas["EncounterRead"];

export type EncounterWrite = Schemas["EncounterWrite"];

export type AttachmentRecord = Schemas["AttachmentRead"];

export type AttachmentPatch = Schemas["AttachmentUpdate"];

export type AppointmentRecord = Schemas["AppointmentRead"];

export type AppointmentWrite = Schemas["AppointmentWrite"];
export type AppointmentPatch = Schemas["AppointmentUpdate"];

export type CommunicationRecord = Schemas["CommunicationRead"];

export type CommunicationWrite = Schemas["CommunicationWrite"];

export type EncounterTemplateRecord = Schemas["EncounterTemplateRead"];

export type EncounterTemplateWrite = Schemas["EncounterTemplateWrite"];

export type ClinicalCatalogItemRecord = Schemas["ClinicalCatalogItemRead"];

export type ClinicalCatalogItemWrite = Schemas["ClinicalCatalogItemWrite"];

export const encountersApi = {
  get: (id: string, fallbackMessage = "Не удалось загрузить приём") =>
    api.get<EncounterRecord>(`/encounters/${id}`, fallbackMessage),
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

function clinicalCatalogListUrl(doctorName?: string): string {
  if (!doctorName?.trim()) return "/clinical-catalog";
  const params = new URLSearchParams({ doctorName: doctorName.trim() });
  return `/clinical-catalog?${params.toString()}`;
}

export const clinicalCatalogApi = {
  list: (doctorName?: string, fallbackMessage = "Не удалось загрузить клинические пункты") =>
    api.get<ClinicalCatalogItemRecord[]>(clinicalCatalogListUrl(doctorName), fallbackMessage),
  create: (body: ClinicalCatalogItemWrite, fallbackMessage = "Не удалось создать клинический пункт") =>
    api.post<ClinicalCatalogItemRecord>("/clinical-catalog", body, fallbackMessage),
  update: (
    id: string,
    body: Partial<ClinicalCatalogItemWrite>,
    fallbackMessage = "Не удалось сохранить клинический пункт",
  ) => api.patch<ClinicalCatalogItemRecord>(`/clinical-catalog/${id}`, body, fallbackMessage),
  delete: (id: string, fallbackMessage = "Не удалось удалить клинический пункт") =>
    api.delete(`/clinical-catalog/${id}`, fallbackMessage),
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
  get: (id: string, fallbackMessage = "Не удалось загрузить запись") =>
    api.get<AppointmentRecord>(`/appointments/${id}`, fallbackMessage),
  list: (
    params?: { patientId?: string; from?: string; to?: string },
    fallbackMessage = "Не удалось загрузить расписание",
  ) => api.get<AppointmentRecord[]>(appointmentListUrl(params), fallbackMessage),
  create: (body: AppointmentWrite, fallbackMessage = "Не удалось создать запись") =>
    api.post<AppointmentRecord>("/appointments", body, fallbackMessage),
  update: (id: string, body: AppointmentPatch, fallbackMessage = "Не удалось сохранить запись") =>
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
