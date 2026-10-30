import * as React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientsApi, patientsApi, type PatientRecord } from "@/features/patients/api";
import { PatientsWorkspace } from "./patients";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/features/owner-cabinet/components/registration-queue", () => ({ RegistrationQueue: () => <div>Очередь регистраций</div> }));
vi.mock("@/features/owner-cabinet/components/visit-request-queue", () => ({ VisitRequestQueue: () => <div>Очередь визитов</div> }));
vi.mock("@/features/encounters/components/encounter-panel", () => ({ EncounterPanel: ({ patient }: { patient: PatientRecord }) => <div>Приёмы: {patient.uuid}</div> }));
vi.mock("@/features/encounters/components/dermatology-gallery", () => ({ DermatologyGallery: ({ patientId }: { patientId: string }) => <div>Галерея: {patientId}</div> }));
vi.mock("@/features/encounters/components/communication-log", () => ({ CommunicationLog: ({ patientId }: { patientId: string }) => <div>Контакты: {patientId}</div> }));
vi.mock("@/features/owner-cabinet/components/patient-chat", () => ({ PatientChat: ({ patientId }: { patientId: string }) => <div>Чат: {patientId}</div> }));
vi.mock("@/features/nutrition/components/patient-nutrition", () => ({ PatientNutrition: ({ patient }: { patient: PatientRecord }) => <div>Питание: {patient.uuid}</div> }));

const patient = {
  uuid: "patient-1", name: "Рекс", species: "dog", breed: "", sex: "unspecified",
  body_weight_kg: 12, expected_adult_weight_kg: null, birth_date: null,
  life_stage: null, activity: null, bcs: null, neutered: false, pregnant: false,
  lactating: false, lactation_week: null, litter_size: null, allergies: [],
  chronic_conditions: [], feeding_notes: null,
  client: { uuid: "client-1", name: "Владелец", phone: null, email: null },
} as PatientRecord;

function mount(initialTab?: string) {
  vi.spyOn(clientsApi, "list").mockResolvedValue([]);
  vi.spyOn(patientsApi, "list").mockResolvedValue([patient]);
  vi.spyOn(patientsApi, "get").mockResolvedValue(patient);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PatientsWorkspace initialPatientId={patient.uuid} initialTab={initialTab} /></QueryClientProvider>);
}

afterEach(() => { vi.restoreAllMocks(); replace.mockClear(); });

describe("patient screen composition", () => {
  it.each([
    ["encounters", "Приёмы", "Приёмы: patient-1"],
    ["gallery", "Галерея", "Галерея: patient-1"],
    ["comms", "Коммуникации", "Контакты: patient-1"],
    ["nutrition", "Питание", "Питание: patient-1"],
  ])("preserves the %s deep link and passes the selected patient to its feature", async (tab, label, content) => {
    mount(tab);
    expect(await screen.findByText(content)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
    if (tab === "comms") expect(screen.getByText("Чат: patient-1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Редактировать" })).not.toBeInTheDocument();
  });

  it("keeps the patient card and both owner queues in the default view", async () => {
    mount();
    expect(await screen.findByText("Основные данные")).toBeInTheDocument();
    expect(screen.getByText("Очередь регистраций")).toBeInTheDocument();
    expect(screen.getByText("Очередь визитов")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Карточка" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Приёмы: patient-1")).not.toBeInTheDocument();
  });

  it("still normalizes an unknown tab to the existing card URL", async () => {
    mount("unknown");
    await screen.findByText("Основные данные");
    expect(replace).toHaveBeenCalledWith("/patients/patient-1?tab=card", { scroll: false });
  });
});
