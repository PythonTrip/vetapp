import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TelegramWebLogin } from "@vetdietderm/owner-features/components/telegram-web-login";
import { JoinForm } from "@vetdietderm/owner-features/components/join-form";
import { CabinetHome } from "@vetdietderm/owner-features/components/cabinet-home";
import { OwnerPlatformProvider } from "@vetdietderm/owner-features/platform";
import { createTelegramPlatform } from "@vetdietderm/owner-features/platform/telegram";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/cabinet"); });
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
  await screen.findByRole("heading", { name: "Привет!" });
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/telegram/login"))!;
  expect(JSON.parse(call[1]!.body as string)).toEqual({ init_data: "raw-signed-data" });
  fireEvent.click(screen.getByRole("link", { name: "Профиль", exact: true }));
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
  fireEvent.click(await screen.findByRole("link", { name: "Профиль" }));
  const password = await screen.findByLabelText("Подтвердите пароль кабинета для привязки Telegram");
  fireEvent.change(password, { target: { value: "owner secret password" } });
  fireEvent.click(screen.getByRole("button", { name: "Привязать Telegram" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Telegram уже привязан");
  expect(password).toHaveValue("");
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/telegram/link"))!;
  expect(JSON.parse(call[1]!.body as string)).toEqual({ init_data: "raw-signed-data", email: profile.email, password: "owner secret password" });
  expect(screen.getByRole("heading", { name: "Привет!" })).toBeInTheDocument();
});

it("displays the reopen instruction when Telegram data expires and preserves password login", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json({ detail: url.endsWith("/telegram/login")
    ? "Данные Telegram устарели. Откройте Mini App заново" : "expired" }, { status: 401 })));
  render(<OwnerPlatformProvider value={makePlatform()}><CabinetHome /></OwnerPlatformProvider>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Откройте Mini App заново");
  expect(screen.getByLabelText("Пароль")).toBeEnabled();
});


it("starts without contacts or a doctor and adds optional credentials to the same cabinet", async () => {
  const quick = { ...profile, email: "", phone: "", doctor_name: "", telegram_linked: true, has_password: false };
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("/me")) return Response.json({ detail: "expired" }, { status: 401 });
    if (url.endsWith("/telegram/login")) return Response.json(quick);
    if (url.endsWith("/credentials")) return Response.json({ ...quick, email: "later@example.com", has_password: true });
    return Response.json([]);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<React.StrictMode><OwnerPlatformProvider value={makePlatform()}><CabinetHome /></OwnerPlatformProvider></React.StrictMode>);
  await screen.findByRole("heading", { name: "Привет!" });
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/telegram/login"))).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Добавить животное" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Привязать Telegram" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Профиль" }));
  expect(screen.getByLabelText("Электронная почта")).not.toBeRequired();
  fireEvent.click(screen.getByText("Добавить вход по почте"));
  fireEvent.change(screen.getByLabelText("Почта для входа"), { target: { value: "later@example.com" } });
  fireEvent.change(screen.getByLabelText("Новый пароль"), { target: { value: "new password for owner" } });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить почту и пароль" }));
  await screen.findByText("Вход по почте настроен");
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/credentials"))!;
  expect(JSON.parse(call[1]!.body as string)).toEqual({ email: "later@example.com", password: "new password for owner" });
  expect(screen.queryByLabelText("Новый пароль")).not.toBeInTheDocument();
});


it("posts the signed web widget callback to the owner server", async () => {
  const onLogin = vi.fn(); const onError = vi.fn();
  const signed = { id: 123, first_name: "Анна", auth_date: 1234567890, hash: "a".repeat(64) };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/config") ? { bot_username: "test_bot" } : profile)));
  // Inspect our integration without executing Telegram's remote script in happy-dom.
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    const element = create(tag, options);
    if (tag === "script") element.setAttribute("type", "application/json");
    return element;
  }) as typeof document.createElement);
  render(<TelegramWebLogin onLogin={onLogin} onError={onError} />);
  await waitFor(() => expect(document.querySelector("script[data-telegram-login]")).not.toBeNull());
  const script = document.querySelector("script[data-telegram-login]")!;
  expect(script.getAttribute("data-telegram-login")).toBe("test_bot");
  const callback = script.getAttribute("data-onauth")!.split("(")[0];
  await (window as unknown as Record<string, (user: unknown) => Promise<void>>)[callback](signed);
  expect(onLogin).toHaveBeenCalledWith(profile);
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/telegram/widget"))!;
  expect(JSON.parse(call[1]!.body as string)).toEqual(signed);
  expect(onError).not.toHaveBeenCalled();
});

it("joins the previewed doctor in Telegram without asking for credentials", async () => {
  const platform = makePlatform();
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("/join/doctor-code")) return Response.json({ doctor_name: "Доктор", organization_name: null });
    if (url.endsWith("/me")) return Response.json({ detail: "expired" }, { status: 401 });
    return Response.json({ ...profile, doctor_name: "", email: "", telegram_linked: true, has_password: false });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<OwnerPlatformProvider value={platform}><JoinForm code="doctor-code" /></OwnerPlatformProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Продолжить с Telegram" }));
  await waitFor(() => expect(platform.navigate).toHaveBeenCalledWith("/cabinet", true));
  expect(screen.queryByLabelText("Пароль")).not.toBeInTheDocument();
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/connect-doctor"))).toBe(true);
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/register"))).toBe(false);
});
