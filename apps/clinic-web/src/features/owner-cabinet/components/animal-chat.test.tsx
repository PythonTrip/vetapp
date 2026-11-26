import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalChat } from "@/features/owner-cabinet/components/animal-chat";
import { PatientChat } from "@/features/owner-cabinet/components/patient-chat";

let role = "member";
vi.mock("@/features/authentication/auth-provider", () => ({
  useAuth: () => ({ workspace: "organization", user: { organization: { org_role: role } } }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  role = "member";
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const messages = [
  { uuid: "1", author_kind: "owner", author_label: "Владелец", body: "<script>alert(1)</script>", created_at: "2026-10-28T10:00:00Z" },
  { uuid: "2", author_kind: "staff", author_label: "Доктор Иванова", body: "Ответ", created_at: "2026-10-28T10:01:00Z" },
];

describe("animal chat", () => {
  it("renders plain text, retains a failed draft and sends trimmed text", async () => {
    let fail = true;
    const fetcher = vi.fn(async (_url: string, options?: RequestInit) =>
      options?.method === "POST"
        ? fail ? json({ detail: "Не удалось отправить" }, 503) : json(messages[0], 201)
        : json(messages));
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(<AnimalChat path="/patients/patient-1/chat" />);
    await screen.findByText("<script>alert(1)</script>");
    expect(screen.getByRole("button", { name: "Обновить" })).toBeInTheDocument();
    expect(screen.getByText("Доктор Иванова")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    const field = screen.getByLabelText("Сообщение");
    fireEvent.change(field, { target: { value: "  Вопрос  " } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось отправить");
    expect(field).toHaveValue("  Вопрос  ");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(field).toHaveValue(""));
    const request = fetcher.mock.calls.find(([, options]) => options?.method === "POST");
    expect(request?.[0]).toBe("/api/patients/patient-1/chat");
    expect(JSON.parse(request![1]!.body as string)).toEqual({ body: "Вопрос" });
  });

  it("disables blank messages after a successful empty load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([])));
    render(<AnimalChat path="/patients/patient-1/chat" />);
    await screen.findByText("Сообщений пока нет.");
    fireEvent.change(screen.getByLabelText("Сообщение"), { target: { value: " \n " } });
    expect(screen.getByRole("button", { name: "Отправить" })).toBeDisabled();
    expect(screen.getByLabelText("Сообщение")).toHaveAttribute("maxlength", "4000");
  });

  it("hides reply controls for an organization observer", async () => {
    role = "viewer";
    vi.stubGlobal("fetch", vi.fn(async () => json(messages)));
    render(<PatientChat patientId="patient-1" />);
    await screen.findByText("Ответ");
    expect(screen.queryByLabelText("Сообщение")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отправить" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/patients/patient-1/chat", expect.anything());
  });

  it("shows the reply control for an organization member", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([])));
    render(<PatientChat patientId="patient-1" />);
    await screen.findByText("Сообщений пока нет.");
    expect(screen.getByLabelText("Сообщение")).toBeInTheDocument();
  });
});
