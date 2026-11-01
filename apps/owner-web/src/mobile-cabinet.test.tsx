import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerVisits, type OwnerVisit } from "@vetdietderm/owner-features/api";
import { AnimalVisits, VisitRequestForm } from "@vetdietderm/owner-features/components/visit-request-form";

afterEach(() => { vi.restoreAllMocks(); });
const visit: OwnerVisit = {
  uuid: "visit", owner_animal_uuid: "cat", patient_uuid: null, visit_type: "consultation",
  proposed_starts_at: "2099-11-01T10:00:00Z", confirmed_starts_at: null, duration_min: null,
  status: "requested", rejection_reason: null, answers: [], files: [], created_at: "2026-11-01T10:00:00Z",
};

describe("mobile owner cabinet", () => {
  it("books the pet selected inside the sheet and shows the actual doctor before choosing a time", async () => {
    vi.spyOn(ownerVisits, "questions").mockResolvedValue([]);
    const create = vi.spyOn(ownerVisits, "create").mockResolvedValue(visit);
    const close = vi.fn();
    render(<VisitRequestForm animalId="cat" animalName="Луна" doctorName="Врач кабинета" animals={[{ uuid: "cat", name: "Луна", species: "cat" }, { uuid: "dog", name: "Оскар", species: "dog" }]} onChanged={vi.fn()} onClose={close} />);
    await screen.findByText("Для этого типа визита анкета не требуется.");
    fireEvent.click(screen.getByRole("radio", { name: "Оскар", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(screen.getByRole("heading", { name: "Расскажите о питомце" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(screen.getByRole("heading", { name: "Выберите ветеринара" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Врач кабинета/ })).toBeChecked();
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Предлагаемые дата и время"), { target: { value: "2099-11-01T15:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(screen.getByText("Оскар · Первичный")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    await screen.findByRole("heading", { name: "Заявка отправлена" });
    expect(create).toHaveBeenCalledWith("dog", expect.objectContaining({ proposed_starts_at: new Date("2099-11-01T15:00").toISOString() }));
    expect(create.mock.calls[0][1]).not.toHaveProperty("reason");
    fireEvent.click(screen.getByRole("button", { name: "К консультациям" }));
    expect(close).toHaveBeenCalledWith("dog");
  });

  it("prioritizes a real running consultation and sends its action to the existing chat", async () => {
    vi.spyOn(ownerVisits, "list").mockResolvedValue([visit, { ...visit, uuid: "running", status: "scheduled", encounter_status: "in_progress" }]);
    const chat = vi.fn();
    render(<AnimalVisits animalId="cat" animalName="Луна" doctorName="Врач кабинета" home onChat={chat} />);
    fireEvent.click(await screen.findByRole("button", { name: "Войти в чат" }));
    expect(chat).toHaveBeenCalledOnce();
    expect(screen.getByText("Идёт консультация")).toBeInTheDocument();
    expect(screen.getByText("Ожидает подтверждения")).toBeInTheDocument();
  });

  it("keeps results reachable when the last consultation is completed", async () => {
    vi.spyOn(ownerVisits, "list").mockResolvedValue([{ ...visit, status: "completed" }]);
    const section = vi.fn();
    render(<AnimalVisits animalId="cat" animalName="Луна" home onSection={section} />);
    fireEvent.click(await screen.findByRole("button", { name: "Результаты завершённых приёмов" }));
    expect(section).toHaveBeenCalledWith("results");
    expect(screen.queryByRole("button", { name: "Войти в чат" })).not.toBeInTheDocument();
  });

  it("recovers from a failed home refresh without replacing it with an empty state", async () => {
    const list = vi.spyOn(ownerVisits, "list").mockRejectedValueOnce(new Error("Сеть недоступна")).mockResolvedValue([]);
    render(<AnimalVisits animalId="cat" home />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Сеть недоступна");
    expect(screen.queryByText("Новых консультаций пока нет")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    await screen.findByText("Новых консультаций пока нет");
    expect(list).toHaveBeenCalledTimes(2);
  });
});
