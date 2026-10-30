import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StaffVisit } from "@/features/owner-cabinet/api";
import { RegistrationQueue } from "@/features/owner-cabinet/components/registration-queue";
import { VisitRequestQueue } from "@/features/owner-cabinet/components/visit-request-queue";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(patch: Partial<StaffVisit> = {}, fail = false, withRegistrations = false) {
  const visit: StaffVisit = {
    uuid: "visit-1", owner_animal_uuid: "animal-1", patient_uuid: null,
    registration_uuid: "registration-1", registration_status: "pending", owner_name: "Анна", animal_name: "Мурка", can_write: true,
    visit_type: "supervision", status: "requested", proposed_starts_at: "2026-11-01T10:00:00Z", confirmed_starts_at: null,
    duration_min: null, rejection_reason: null, created_at: "2026-10-28T10:00:00Z",
    answers: [
      { question_id: "q1", label: "Есть зуд?", kind: "binary", value: "no", options: [] },
      { question_id: "q2", label: "Симптомы", kind: "multi_select", value: ["itch", "red"], options: [{ value: "itch", label: "Зуд" }, { value: "red", label: "Покраснение" }] },
      { question_id: "q3", label: "Начало", kind: "date", value: "2026-10-27", options: [] },
    ],
    files: [{ uuid: "file-1", content_type: "application/pdf", byte_size: 4, created_at: "2026-10-28T10:00:00Z" }], ...patch,
  };
  const animal = { uuid: "animal-1", name: "Мурка", species: "cat", breed: "", sex: "female", birth_date: null };
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    let data: unknown = [];
    if (url === "/api/visit-requests?status=requested") data = [visit, ...(["scheduled", "rejected", "withdrawn", "cancelled", "completed", "no_show"] as const).map(status => ({ ...visit, uuid: status, status, animal_name: `Скрытый ${status}` }))];
    if (url === "/api/owner-registrations") data = [{ uuid: "registration-1", name: "Анна", email: "anna@example.test", phone: "123", doctor_name: "Врач", organization_name: "Клиника", can_accept: visit.can_write, animals: [animal, { ...animal, uuid: "animal-2", name: "Муся" }] }];
    if (url.startsWith("/api/clients")) data = [{ uuid: "client-1", name: "Клиент", phone: "456" }];
    if (url.includes("/registration-1/patients")) data = [{ ...animal, uuid: "patient-1", name: "Старый пациент" }];
    if (url.endsWith("/files/file-1")) return new Response("file", { headers: { "Content-Type": "application/pdf" } });
    if (options?.method === "POST") {
      if (fail) return new Response(JSON.stringify({ detail: "Время занято" }), { status: 409, headers: { "Content-Type": "application/json" } });
      visit.status = url.endsWith("/confirm") ? "scheduled" : "rejected";
      data = visit;
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}>{withRegistrations && <RegistrationQueue />}<VisitRequestQueue /></QueryClientProvider>);
  return { fetcher, invalidate };
}

async function openQueue() {
  fireEvent.click(await screen.findByRole("button", { name: "Запросы визитов · 1" }));
  await screen.findByText("Мурка · Анна");
}

describe("clinician visit queue", () => {
  it("shows snapshots and downloads for observers, hides every write action and non-requested status", async () => {
    const { fetcher } = setup({ can_write: false }, false, true);
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(await screen.findByRole("button", { name: "Регистрации · 1" }));
    expect(await screen.findByText("Анна")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Принять регистрацию" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await openQueue();
    expect(screen.getByText("Курирование")).toBeInTheDocument();
    expect(screen.getByText(/^Предложено:/)).toBeInTheDocument();
    expect(screen.getByText("Есть зуд?")).toBeInTheDocument();
    expect(screen.getByText("Нет")).toBeInTheDocument();
    expect(screen.getByText("Зуд, Покраснение")).toBeInTheDocument();
    expect(screen.getByText("27.10.2026")).toBeInTheDocument();
    expect(screen.queryByText(/Скрытый/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Подтвердить|Отклонить|Принять/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Скачать файл 1 · PDF" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(fetcher).toHaveBeenCalledWith("/api/visit-requests/visit-1/files/file-1", expect.anything());
    expect(createUrl).toHaveBeenCalled(); expect(revokeUrl).toHaveBeenCalledWith("blob:file");
  });

  it("confirms a pending registration with all animals and refreshes dependent lists", async () => {
    const { fetcher, invalidate } = setup();
    await openQueue();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить", exact: true }));
    await screen.findByLabelText("Новый клиент");
    fireEvent.change(screen.getByLabelText("Дата и время визита"), { target: { value: "2026-11-02T14:15" } });
    fireEvent.change(screen.getByLabelText("Длительность, мин"), { target: { value: "45" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Подтвердить визит" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить визит" }));
    await screen.findByText("Нет запросов, ожидающих подтверждения");
    const post = fetcher.mock.calls.find(([, options]) => options?.method === "POST");
    expect(post?.[0]).toBe("/api/visit-requests/visit-1/confirm");
    expect(JSON.parse(post![1]!.body as string)).toEqual({ starts_at: new Date("2026-11-02T14:15").toISOString(), duration_min: 45, registration: { mode: "create", client_uuid: null, matches: [{ owner_animal_id: "animal-1", patient_uuid: null }, { owner_animal_id: "animal-2", patient_uuid: null }] } });
    for (const key of ["visit-requests", "owner-registrations", "patients", "appointments"]) expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
  });

  it("links a pending owner and submits explicit animal matches without duplicates", async () => {
    const { fetcher } = setup(); await openQueue();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить", exact: true }));
    fireEvent.click(await screen.findByLabelText("Существующий клиент"));
    expect(screen.getByRole("button", { name: "Подтвердить визит" })).toBeDisabled();
    await screen.findByRole("option", { name: "Клиент · 456" });
    fireEvent.change(screen.getByLabelText("Клиент"), { target: { value: "client-1" } });
    await screen.findAllByRole("option", { name: "Старый пациент · Кошка" });
    fireEvent.change(screen.getByLabelText("Сопоставление для Мурка"), { target: { value: "patient-1" } });
    expect(screen.getByLabelText("Сопоставление для Муся").querySelector('option[value="patient-1"]')).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить визит" }));
    await screen.findByText("Нет запросов, ожидающих подтверждения");
    const post = fetcher.mock.calls.find(([, options]) => options?.method === "POST");
    expect(JSON.parse(post![1]!.body as string).registration).toEqual({ mode: "link", client_uuid: "client-1", matches: [{ owner_animal_id: "animal-1", patient_uuid: "patient-1" }, { owner_animal_id: "animal-2", patient_uuid: null }] });
  });

  it("confirms an accepted registration using time and duration only", async () => {
    const { fetcher } = setup({ registration_status: "accepted" }); await openQueue();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить", exact: true }));
    expect(screen.queryByLabelText("Новый клиент")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить визит" }));
    await screen.findByText("Нет запросов, ожидающих подтверждения");
    const post = fetcher.mock.calls.find(([, options]) => options?.method === "POST");
    expect(Object.keys(JSON.parse(post![1]!.body as string)).sort()).toEqual(["duration_min", "starts_at"]);
    expect(fetcher.mock.calls.some(([url]) => url === "/api/owner-registrations")).toBe(false);
  });

  it.each(["confirm", "reject"] as const)("retains the row and API message on failed %s", async action => {
    setup({ registration_status: "accepted" }, true); await openQueue();
    fireEvent.click(screen.getByRole("button", { name: action === "confirm" ? "Подтвердить" : "Отклонить", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: action === "confirm" ? "Подтвердить визит" : "Отклонить визит" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Время занято");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("heading", { name: "Мурка · Анна" })).toBeInTheDocument();
  });

  it("rejects with a reason and removes the row", async () => {
    const { fetcher } = setup(); await openQueue();
    fireEvent.click(screen.getByRole("button", { name: "Отклонить", exact: true }));
    fireEvent.change(screen.getByLabelText("Причина отказа (необязательно)"), { target: { value: "  Выберите другой день  " } });
    fireEvent.click(screen.getByRole("button", { name: "Отклонить визит" }));
    await screen.findByText("Нет запросов, ожидающих подтверждения");
    const posts = fetcher.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(posts).toHaveLength(1); expect(posts[0][0]).toBe("/api/visit-requests/visit-1/reject");
    expect(JSON.parse(posts[0][1]!.body as string)).toEqual({ reason: "Выберите другой день" });
  });
});
