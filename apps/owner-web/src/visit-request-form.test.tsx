import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerVisits, type OwnerVisit, type VisitQuestion } from "@vetdietderm/owner-features/api";
import { AnimalVisits, VisitRequestForm } from "@vetdietderm/owner-features/components/visit-request-form";
import { AnimalList } from "@vetdietderm/owner-features/components/animal-list";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
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
  it.each([
    { paid: false, active: false }, { paid: true, active: false },
    { paid: false, active: true }, { paid: true, active: true },
  ])("shows completed charges on home with paid=$paid and active=$active", async ({ paid, active }) => {
    vi.spyOn(ownerVisits, "list").mockResolvedValue([
      ...(active ? [{ ...visit, uuid: "upcoming", reason: "Новый вопрос" }] : []),
      { ...visit, uuid: "charged", status: "completed", read_only: true, amount_rub: "1500.50", paid },
      { ...visit, uuid: "no-charge", status: "completed", reason: "Без суммы", amount_rub: null },
    ]);
    render(<AnimalVisits animalId="animal-1" animalName="Мурка" home />);
    expect(await screen.findByText(`${paid ? "Оплачено" : "К оплате"}: 1500.50 руб.`)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Мурка · Визит" })).toBeVisible();
    expect(screen.queryByText("Новых консультаций пока нет")).not.toBeInTheDocument();
    expect(screen.queryByText(/Без суммы/)).not.toBeInTheDocument();
    if (active) expect(screen.getByRole("heading", { name: "Мурка · Новый вопрос" })).toBeVisible();
  });

  it("prioritizes the running visit and opens the selected pet's dialogue", async () => {
    vi.spyOn(ownerVisits, "list").mockResolvedValue([
      { ...visit, uuid: "future", status: "scheduled", confirmed_starts_at: "2026-11-10T10:00:00Z", duration_min: 30 },
      { ...visit, uuid: "running", status: "scheduled", encounter_status: "in_progress", confirmed_starts_at: "2026-11-01T10:00:00Z", duration_min: 45 },
    ]);
    const onChat = vi.fn();
    render(<AnimalVisits animalId="animal-1" animalName="Мурка" doctorName="Доктор Иванова" onChat={onChat} />);
    fireEvent.click(await screen.findByRole("button", { name: "Открыть консультацию" }));
    expect(onChat).toHaveBeenCalledOnce();
    expect(screen.getAllByText("Доктор Иванова")).toHaveLength(2);
    expect(screen.getByText("45 мин")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map(el => el.textContent)).toEqual(["Сейчас идёт консультация", "Предстоящие и заявки"]);
    expect(screen.queryByText(/^Подтверждено:/)).not.toBeInTheDocument();
  });
  it("requires the problem, accepts partial answers and sends no type", async () => {
    vi.spyOn(ownerVisits, "questions").mockResolvedValue(questions);
    const create = vi.spyOn(ownerVisits, "create").mockResolvedValue(visit);
    const onClose = vi.fn();
    render(<VisitRequestForm animalId="animal-1" onChanged={vi.fn()} onClose={onClose} />);
    await screen.findByLabelText("Что беспокоит?");
    expect(screen.queryByLabelText("Тип визита")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Опишите проблему *"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeDisabled();
    expect(screen.getByLabelText("Опишите проблему *")).toHaveAttribute("maxlength", "4000");
    fireEvent.change(screen.getByLabelText("Опишите проблему *"), { target: { value: "Питомец плохо ест" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(screen.getByLabelText("Что беспокоит?")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Предлагаемые дата и время"), { target: { value: "2026-11-01T10:00" } });
    fireEvent.change(screen.getByLabelText("Что беспокоит?"), { target: { value: "Зуд" } });
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Проверьте перед отправкой" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    await screen.findByRole("heading", { name: "Заявка отправлена" });
    expect(create).toHaveBeenCalledWith("animal-1", {
      reason: "Питомец плохо ест", proposed_starts_at: new Date("2026-11-01T10:00").toISOString(),
      answers: [{ question_id: "q1", value: "Зуд" }],
    });
    expect(screen.queryByLabelText(/Длительность|Подтвержд/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "К консультациям" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("submits a published questionnaire with no answers and reviews only the problem", async () => {
    vi.spyOn(ownerVisits, "questions").mockResolvedValue(questions);
    const create = vi.spyOn(ownerVisits, "create").mockResolvedValue({ ...visit, visit_type: null });
    render(<VisitRequestForm animalId="animal-1" onChanged={vi.fn()} onClose={vi.fn()} />);
    await screen.findByLabelText("Что беспокоит?");
    fireEvent.change(screen.getByLabelText("Опишите проблему *"), { target: { value: "  Хромает  " } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(screen.getByText("Все вопросы необязательны")).toBeVisible();
    expect(screen.getByLabelText("Что беспокоит?")).not.toBeRequired();
    fireEvent.change(screen.getByLabelText("Что беспокоит?"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.change(screen.getByLabelText("Предлагаемые дата и время"), { target: { value: "2026-11-01T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(screen.getByText("Хромает", { selector: "p" })).toBeVisible();
    expect(screen.getByLabelText("Что беспокоит?")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    await screen.findByRole("heading", { name: "Заявка отправлена" });
    expect(create).toHaveBeenCalledWith("animal-1", {
      reason: "Хромает", proposed_starts_at: new Date("2026-11-01T10:00").toISOString(), answers: [],
    });
  });

  it("labels historical cards and home rows with the problem or fallback", async () => {
    vi.spyOn(ownerVisits, "list").mockResolvedValue([
      { ...visit, uuid: "first", reason: "Болит лапа", visit_type: null },
      { ...visit, uuid: "second", reason: null, visit_type: "supervision" },
    ]);
    const { rerender } = render(<AnimalVisits animalId="animal-1" animalName="Мурка" home />);
    expect(await screen.findByRole("heading", { name: "Мурка · Болит лапа" })).toBeInTheDocument();
    expect(screen.getByText("Заявка")).toBeInTheDocument();
    expect(screen.queryByText("Курирование")).not.toBeInTheDocument();
    rerender(<AnimalVisits animalId="animal-1" animalName="Мурка" />);
    expect(screen.getByRole("heading", { name: "Болит лапа · Мурка" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Заявка · Мурка" })).toBeInTheDocument();
  });

  it("retries failed files without duplicating the request or successful files", async () => {
    vi.spyOn(ownerVisits, "questions").mockResolvedValue([]);
    const create = vi.spyOn(ownerVisits, "create").mockResolvedValue(visit);
    const upload = vi.spyOn(ownerVisits, "upload").mockResolvedValueOnce({ uuid: "f1", content_type: "image/jpeg", byte_size: 1, created_at: visit.created_at }).mockRejectedValueOnce(new Error("Ошибка загрузки")).mockResolvedValue({ uuid: "f2", content_type: "application/pdf", byte_size: 1, created_at: visit.created_at });
    const onClose = vi.fn();
    render(<VisitRequestForm animalId="animal-1" onChanged={vi.fn()} onClose={onClose} />);
    await screen.findByText("В анкете клиники пока нет вопросов. Можно продолжить без ответов.");
    fireEvent.change(screen.getByLabelText("Опишите проблему *"), { target: { value: "Питомец плохо ест" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    const first = new File(["a"], "a.jpg", { type: "image/jpeg" });
    const second = new File(["b"], "b.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Предлагаемые дата и время"), { target: { value: "2026-11-01T10:00" } });
    fireEvent.change(screen.getByLabelText("Фото и документы"), { target: { files: [first, second] } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Заявка создана");
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку файлов" }));
    await screen.findByRole("heading", { name: "Заявка отправлена" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls.map(([, file]) => file.name)).toEqual(["a.jpg", "b.pdf", "b.pdf"]);
  });

  it("keeps the review and entered data when submitting the request fails", async () => {
    vi.spyOn(ownerVisits, "questions").mockResolvedValue([]);
    vi.spyOn(ownerVisits, "create").mockRejectedValue(new Error("Не удалось связаться с сервером"));
    const onClose = vi.fn();
    render(<VisitRequestForm animalId="animal-1" animalName="Мурка" onChanged={vi.fn()} onClose={onClose} />);
    await screen.findByText("В анкете клиники пока нет вопросов. Можно продолжить без ответов.");
    fireEvent.change(screen.getByLabelText("Опишите проблему *"), { target: { value: "Питомец плохо ест" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.change(screen.getByLabelText("Предлагаемые дата и время"), { target: { value: "2026-11-02T12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось связаться с сервером");
    expect(screen.getByRole("heading", { name: "Проверьте перед отправкой" })).toBeInTheDocument();
    expect(screen.getByLabelText("Предлагаемые дата и время")).toHaveValue("2026-11-02T12:00");
    expect(screen.queryByRole("heading", { name: "Заявка отправлена" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows rejection and withdrawn labels and keeps file download available", async () => {
    vi.spyOn(ownerVisits, "list").mockResolvedValue([
      { ...visit, status: "rejected", rejection_reason: "Другое время", files: [{ uuid: "f1", content_type: "image/jpeg", byte_size: 4, created_at: visit.created_at }] },
      { ...visit, uuid: "visit-2", status: "withdrawn" },
    ]);
    render(<AnimalVisits animalId="animal-1" />);
    expect(await screen.findByText("Отклонён")).toBeInTheDocument();
    expect(screen.getByText("Заявка отозвана")).toBeInTheDocument();
    expect(screen.getByText("Причина отказа: Другое время")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Материалы к заявке · 1"));
    expect(screen.getByRole("button", { name: "Скачать файл 1 · Фото" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Отозвать заявку|Отменить визит/ })).not.toBeInTheDocument();
  });

  it("resets result context when switching pets and ignores the previous pet's late response", async () => {
    const animals = [{ uuid: "a", name: "Мурка", species: "cat", breed: "" }, { uuid: "b", name: "Тузик", species: "dog", breed: "" }];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(animals)));
    let finishFirst!: (value: OwnerVisit[]) => void;
    vi.spyOn(ownerVisits, "list").mockImplementation(id => id === "a" ? new Promise(resolve => { finishFirst = resolve; }) : Promise.resolve([{ ...visit, status: "completed", reason: "Только Тузик", result_files: [] }]));
    render(<AnimalList linked section="results" />);
    await screen.findByLabelText("Питомец");
    await vi.waitFor(() => expect(ownerVisits.list).toHaveBeenCalledWith("a"));
    fireEvent.change(screen.getByLabelText("Питомец"), { target: { value: "b" } });
    expect(await screen.findByText("Только Тузик")).toBeInTheDocument();
    finishFirst([{ ...visit, status: "completed", reason: "Чужой результат Мурки" }]);
    await Promise.resolve();
    expect(screen.queryByText("Чужой результат Мурки")).not.toBeInTheDocument();
    expect(screen.getByText("Только Тузик")).toBeInTheDocument();
  });
});
