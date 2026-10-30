import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CabinetHome } from "@vetdietderm/owner-features/components/cabinet-home";
import { JoinForm } from "@vetdietderm/owner-features/components/join-form";
import { AnimalForm } from "@vetdietderm/owner-features/components/animal-form";
import { AnimalFiles } from "@vetdietderm/owner-features/components/animal-files";
import { OwnerPlatformProvider } from "@vetdietderm/owner-features/platform";
import { createTelegramPlatform } from "@vetdietderm/owner-features/platform/telegram";
import type { OwnerPlatform } from "@vetdietderm/owner-features/platform";

const json = (value: unknown, status = 200) => Response.json(value, { status });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("owner scenarios in the independent host", () => {
  it("signs in with owner cookies, restores profile and logs out without staff bootstrapping", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      requests.push(url);
      expect(init.credentials).toBe("same-origin");
      expect(new Headers(init.headers).get("X-Vetapp-CSRF")).toBe("1");
      expect(new Headers(init.headers).has("X-Vetapp-Workspace")).toBe(false);
      if (url.endsWith("/me")) return json({ detail: "expired" }, 401);
      if (url.endsWith("/login")) return json({ uuid: "owner", name: "Анна", email: "owner@example.com", phone: "123", linked: false, doctor_name: "Доктор Иванова" });
      return json([]);
    }));
    render(<CabinetHome />);
    await screen.findByRole("heading", { name: "Войти в кабинет" });
    fireEvent.change(screen.getByLabelText("Электронная почта"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "long owner password" } });
    fireEvent.click(screen.getByRole("button", { name: "Войти", exact: true }));
    await screen.findByRole("heading", { name: "Мой кабинет" });
    expect(screen.getByText("Доктор Иванова")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Выйти из кабинета" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Выйти из кабинета" }));
    await screen.findByRole("heading", { name: "Войти в кабинет" });
    expect(requests).toContain("/api/owner/logout");
    expect(requests.every(url => url.startsWith("/api/owner/"))).toBe(true);
  });

  it("previews the inviting doctor and registers through the same modules on Telegram", async () => {
    const navigate = vi.fn(); const ready = vi.fn(); const expand = vi.fn();
    const platform = createTelegramPlatform({ bridge: { ready, expand }, navigate, saveFile: vi.fn() });
    platform.initialize();
    expect(ready).toHaveBeenCalledOnce(); expect(expand).toHaveBeenCalledOnce();
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => init.method === "POST" ? json({ uuid: "owner" }) : json({ doctor_name: "Пригласивший врач", organization_name: null }));
    vi.stubGlobal("fetch", fetcher);
    render(<OwnerPlatformProvider value={platform}><JoinForm code="doctor-code" /></OwnerPlatformProvider>);
    await screen.findByText("Пригласивший врач");
    fireEvent.change(screen.getByLabelText("Ваше имя"), { target: { value: "Анна" } });
    fireEvent.change(screen.getByLabelText("Электронная почта"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Телефон"), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "long owner password" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать кабинет" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/cabinet", true));
    const request = fetcher.mock.calls.find(([, init]) => init.method === "POST");
    expect(request?.[0]).toBe("/api/owner/register");
    expect(JSON.parse(request![1].body as string).code).toBe("doctor-code");
    expect(fetcher.mock.calls.every(([url]) => url.startsWith("/api/owner/"))).toBe(true);
  });

  it("edits only the passport fields through the owner endpoint", async () => {
    const saved = vi.fn();
    const fetcher = vi.fn(async () => json({ uuid: "animal", name: "Барсик", species: "cat" }));
    vi.stubGlobal("fetch", fetcher);
    render(<AnimalForm animal={{ uuid: "animal", name: "Мурзик", species: "cat", sex: "male", breed: "", birth_date: null }} onSaved={saved} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Кличка"), { target: { value: "Барсик" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить животное" }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/owner/animals/animal");
    expect(init?.method).toBe("PATCH");
    expect(Object.keys(JSON.parse(init!.body as string)).sort()).toEqual(["birth_date", "breed", "name", "sex", "species"]);
  });

  it("hands an authenticated attachment to the platform adapter", async () => {
    const saveFile = vi.fn();
    const platform: OwnerPlatform = { kind: "telegram", navigate: vi.fn(), saveFile };
    const fetcher = vi.fn(async (url: string) => url.endsWith("/files")
      ? json([{ uuid: "file", caption: "Рекомендации", content_type: "application/pdf", byte_size: 4, created_at: "2026-10-30T10:00:00Z" }])
      : new Response("pdf!", { headers: { "Content-Type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetcher);
    render(<OwnerPlatformProvider value={platform}><AnimalFiles animalId="animal" linked /></OwnerPlatformProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Скачать", exact: true }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), "Рекомендации.pdf"));
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/owner/animals/animal/files", "/api/owner/files/file"]);
  });
});
