import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationQueue } from "@/features/owner-cabinet/components/registration-queue";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(canAccept = true) {
  const animal = { uuid: "animal-1", name: "Мурка", species: "cat", breed: "Сибирская", sex: "female", birth_date: "2020-05-10" };
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    let data: unknown = [];
    if (url === "/api/owner-registrations") data = [{ uuid: "registration-1", name: "Анна", email: "anna@example.test", phone: "123",
      doctor_name: "Доктор Иванова", organization_name: "Клиника", can_accept: canAccept, animals: [animal, { ...animal, uuid: "animal-2", name: "Муся" }] }];
    if (url.startsWith("/api/clients")) data = [{ uuid: "client-1", name: "Клиент", phone: "456" }];
    if (url.includes("/registration-1/patients")) data = [{ ...animal, uuid: "patient-1", name: "Старый пациент" }];
    if (options?.method === "POST") data = { uuid: "registration-1", client_uuid: "client-1", status: "accepted" };
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><RegistrationQueue /></QueryClientProvider>);
  return fetcher;
}

describe("registration queue", () => {
  it("shows complete passports and contacts to observers without an accept action", async () => {
    setup(false);
    fireEvent.click(await screen.findByRole("button", { name: "Регистрации · 1" }));
    expect(await screen.findByText("Анна")).toBeInTheDocument();
    expect(screen.getByText("anna@example.test · 123")).toBeInTheDocument();
    expect(screen.getByText("Врач: Доктор Иванова · Клиника")).toBeInTheDocument();
    expect(screen.getAllByText(/Сибирская.*10.05.2020/)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Принять регистрацию" })).not.toBeInTheDocument();
    expect(screen.getByText("Доступен только просмотр.")).toBeInTheDocument();
  });

  it("submits an explicit client and one match, preventing duplicate patient choices", async () => {
    const fetcher = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Регистрации · 1" }));
    fireEvent.click(await screen.findByLabelText("Существующий клиент"));
    fireEvent.change(screen.getByLabelText("Клиент"), { target: { value: "client-1" } });
    await screen.findAllByRole("option", { name: "Старый пациент · Кошка" });
    fireEvent.change(screen.getByLabelText("Сопоставление для Мурка"), { target: { value: "patient-1" } });
    const second = screen.getByLabelText("Сопоставление для Муся") as HTMLSelectElement;
    expect(second.querySelector('option[value="patient-1"]')).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Принять регистрацию" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/owner-registrations/registration-1/accept", expect.objectContaining({ method: "POST" })));
    const request = fetcher.mock.calls.find(([, options]) => options?.method === "POST");
    expect(JSON.parse(request![1]!.body as string)).toEqual({ mode: "link", client_uuid: "client-1", matches: [
      { owner_animal_id: "animal-1", patient_uuid: "patient-1" }, { owner_animal_id: "animal-2", patient_uuid: null },
    ] });
  });
});
