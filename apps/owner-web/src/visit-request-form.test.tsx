import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerVisits, type OwnerVisit, type VisitQuestion } from "@vetdietderm/owner-features/api";
import { AnimalVisits, VisitRequestForm } from "@vetdietderm/owner-features/components/visit-request-form";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const questions: VisitQuestion[] = [
  { uuid: "q1", position: 0, label: "Что беспокоит?", kind: "text", options: [] },
  { uuid: "q2", position: 1, label: "Есть зуд?", kind: "binary", options: [] },
];
const visit: OwnerVisit = {
  uuid: "visit-1", owner_animal_uuid: "animal-1", patient_uuid: null, visit_type: "primary",
  proposed_starts_at: "2026-11-01T10:00:00Z", confirmed_starts_at: null, duration_min: null,
  status: "requested", rejection_reason: null, answers: [], files: [], created_at: "2026-10-28T10:00:00Z",
};

describe("owner visit request", () => {
  it("requires every answer, offers exactly four types and sends only the proposed time", async () => {
    vi.spyOn(ownerVisits, "questions").mockResolvedValue(questions);
    const create = vi.spyOn(ownerVisits, "create").mockResolvedValue(visit);
    const onClose = vi.fn();
    render(<VisitRequestForm animalId="animal-1" onChanged={vi.fn()} onClose={onClose} />);
    await screen.findByLabelText("Что беспокоит? *");
    expect(Array.from((screen.getByLabelText("Тип визита") as HTMLSelectElement).options).map(option => option.text)).toEqual(["Первичный", "Повторный", "Консультация", "Курирование"]);
    fireEvent.change(screen.getByLabelText("Предлагаемые дата и время"), { target: { value: "2026-11-01T10:00" } });
    fireEvent.change(screen.getByLabelText("Что беспокоит? *"), { target: { value: "Зуд" } });
    expect(screen.getByRole("button", { name: "Отправить заявку" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Есть зуд? *"), { target: { value: "no" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith("animal-1", {
      visit_type: "primary", proposed_starts_at: new Date("2026-11-01T10:00").toISOString(),
      answers: [{ question_id: "q1", value: "Зуд" }, { question_id: "q2", value: "no" }],
    });
    expect(screen.queryByLabelText(/Длительность|Подтвержд/)).not.toBeInTheDocument();
  });

  it("retries failed files without duplicating the request or successful files", async () => {
    vi.spyOn(ownerVisits, "questions").mockResolvedValue([]);
    const create = vi.spyOn(ownerVisits, "create").mockResolvedValue(visit);
    const upload = vi.spyOn(ownerVisits, "upload").mockResolvedValueOnce({ uuid: "f1", content_type: "image/jpeg", byte_size: 1, created_at: visit.created_at }).mockRejectedValueOnce(new Error("Ошибка загрузки")).mockResolvedValue({ uuid: "f2", content_type: "application/pdf", byte_size: 1, created_at: visit.created_at });
    const onClose = vi.fn();
    render(<VisitRequestForm animalId="animal-1" onChanged={vi.fn()} onClose={onClose} />);
    await screen.findByText("Для этого типа визита анкета не требуется.");
    const first = new File(["a"], "a.jpg", { type: "image/jpeg" });
    const second = new File(["b"], "b.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Предлагаемые дата и время"), { target: { value: "2026-11-01T10:00" } });
    fireEvent.change(screen.getByLabelText("Фото и документы"), { target: { files: [first, second] } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Заявка создана");
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку файлов" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(create).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls.map(([, file]) => file.name)).toEqual(["a.jpg", "b.pdf", "b.pdf"]);
  });

  it("shows rejection and withdrawn labels and keeps file download available", async () => {
    vi.spyOn(ownerVisits, "list").mockResolvedValue([
      { ...visit, status: "rejected", rejection_reason: "Другое время", files: [{ uuid: "f1", content_type: "image/jpeg", byte_size: 4, created_at: visit.created_at }] },
      { ...visit, uuid: "visit-2", status: "withdrawn" },
    ]);
    render(<AnimalVisits animalId="animal-1" />);
    expect(await screen.findByText("Первичный · Отклонён")).toBeInTheDocument();
    expect(screen.getByText("Первичный · Отозван")).toBeInTheDocument();
    expect(screen.getByText("Причина отказа: Другое время")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скачать файл 1 · Фото" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Отозвать заявку|Отменить визит/ })).not.toBeInTheDocument();
  });
});
