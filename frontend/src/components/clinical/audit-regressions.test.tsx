import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appointmentsApi, patientsApi, encountersApi, clinicalCatalogApi, encounterTemplatesApi, type PatientRecord, type AppointmentRecord, type EncounterRecord } from "@/lib/api-client";
import { EncounterWorkspace } from "./encounter-workspace";
import { ScheduleBoard } from "./schedule-board";

vi.mock("./clinical-form-builder", () => ({ ClinicalFormBuilder: () => null }));
vi.mock("./plan-editor", () => ({ PlanEditor: () => null }));
afterEach(() => vi.restoreAllMocks());
const patient = { uuid: "older-patient", name: "Older patient", species: "dog", client: { name: "Owner" } } as PatientRecord;
const appointment = { uuid: "recent-slot", patient_uuid: patient.uuid, patient, encounter_uuid: "linked-visit", starts_at: "2026-09-05T10:00:00Z", visit_type: "consultation", status: "scheduled", duration_min: 30 } as AppointmentRecord;
function setup(element: React.ReactNode) {
  vi.spyOn(appointmentsApi, "list").mockResolvedValue([]);
  vi.spyOn(patientsApi, "list").mockImplementation(async (q) => q === "Older" ? [patient] : []);
  vi.spyOn(patientsApi, "get").mockResolvedValue(patient);
  vi.spyOn(encountersApi, "list").mockResolvedValue([]);
  vi.spyOn(clinicalCatalogApi, "list").mockResolvedValue([]);
  vi.spyOn(encounterTemplatesApi, "list").mockResolvedValue([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

describe("audit clinical regressions", () => {
  it("does not offer an editable blank visit when the linked encounter fails to load", async () => {
    vi.spyOn(appointmentsApi, "get").mockResolvedValue(appointment);
    vi.spyOn(encountersApi, "get").mockRejectedValue(new Error("Visit unavailable"));
    setup(<EncounterWorkspace initialAppointmentId={appointment.uuid} />);
    await waitFor(() => expect(encountersApi.get).toHaveBeenCalled());
    expect(screen.queryByLabelText("Жалоба")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Завершить приём" })).toBeDisabled();
  });
  it("opens a linked encounter even when appointment and patient lists omit the target", async () => {
    vi.spyOn(appointmentsApi, "get").mockResolvedValue(appointment);
    vi.spyOn(encountersApi, "get").mockResolvedValue({ uuid: "linked-visit", patient_uuid: patient.uuid, specialty: "general", type: "appointment", status: "draft", chief_complaint: "Persisted complaint", occurred_at: appointment.starts_at, diagnoses: [], vas_score: null } as unknown as EncounterRecord);
    setup(<EncounterWorkspace initialAppointmentId={appointment.uuid} />);
    expect(await screen.findByDisplayValue("Persisted complaint")).toBeInTheDocument();
    expect(appointmentsApi.get).toHaveBeenCalledWith(appointment.uuid);
    expect(encountersApi.get).toHaveBeenCalledWith("linked-visit");
  });
  it("searches the server for no-appointment patients", async () => {
    setup(<EncounterWorkspace />);
    fireEvent.change(screen.getByRole("textbox", { name: "Поиск пациента" }), { target: { value: "Older" } });
    await waitFor(() => expect(patientsApi.list).toHaveBeenCalledWith("Older"));
  });
  it("searches the server in the booking dialog", async () => {
    setup(<ScheduleBoard />);
    fireEvent.click(screen.getByRole("button", { name: "Новая запись" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Поиск пациента" }), { target: { value: "Older" } });
    await waitFor(() => expect(patientsApi.list).toHaveBeenCalledWith("Older"));
  });
});
