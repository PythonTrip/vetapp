import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CabinetHome } from "@vetdietderm/owner-features/components/cabinet-home";
import { OwnerPlatformProvider } from "@vetdietderm/owner-features/platform";
import { createTelegramPlatform } from "@vetdietderm/owner-features/platform/telegram";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const profile = { uuid: "owner", name: "Анна", email: "owner@example.com", phone: "123", linked: false, doctor_name: "Доктор", organization_name: null };
const makePlatform = () => createTelegramPlatform({
  bridge: { ready: vi.fn(), expand: vi.fn(), initData: "raw-signed-data" }, navigate: vi.fn(), saveFile: vi.fn(),
});

it("sends only raw initData for Telegram login and requires an explicit new login after logout", async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("/me")) return Response.json({ detail: "expired" }, { status: 401 });
    if (url.endsWith("/telegram/login")) return Response.json(profile);
    return Response.json([]);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<OwnerPlatformProvider value={makePlatform()}><CabinetHome /></OwnerPlatformProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Войти через Telegram" }));
  await screen.findByRole("heading", { name: "Мой кабинет" });
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/telegram/login"))!;
  expect(JSON.parse(call[1]!.body as string)).toEqual({ init_data: "raw-signed-data" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Выйти из кабинета" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Выйти из кабинета" }));
  await screen.findByRole("button", { name: "Войти через Telegram" });
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/telegram/login"))).toHaveLength(1);
});

it("confirms owner credentials for linking and surfaces conflict and expired-initData errors", async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("/me")) return Response.json(profile);
    if (url.endsWith("/telegram/link")) return Response.json({ detail: "Telegram уже привязан к другому аккаунту" }, { status: 409 });
    return Response.json([]);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<OwnerPlatformProvider value={makePlatform()}><CabinetHome /></OwnerPlatformProvider>);
  const password = await screen.findByLabelText("Подтвердите пароль кабинета для привязки Telegram");
  fireEvent.change(password, { target: { value: "owner secret password" } });
  fireEvent.click(screen.getByRole("button", { name: "Привязать Telegram" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Telegram уже привязан");
  expect(password).toHaveValue("");
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/telegram/link"))!;
  expect(JSON.parse(call[1]!.body as string)).toEqual({ init_data: "raw-signed-data", email: profile.email, password: "owner secret password" });
  expect(screen.getByRole("heading", { name: "Мой кабинет" })).toBeInTheDocument();
});

it("displays the reopen instruction when Telegram data expires and preserves password login", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json({ detail: url.endsWith("/telegram/login")
    ? "Данные Telegram устарели. Откройте Mini App заново" : "expired" }, { status: 401 })));
  render(<OwnerPlatformProvider value={makePlatform()}><CabinetHome /></OwnerPlatformProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Войти через Telegram" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Откройте Mini App заново");
  expect(screen.getByLabelText("Пароль")).toBeEnabled();
});
