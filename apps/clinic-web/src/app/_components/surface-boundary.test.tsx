import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SurfaceBoundary } from "@/app/_components/surface-boundary";
import { CabinetHome } from "@/features/owner-cabinet/components/cabinet-home";

let pathname = "/cabinet";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function mount(content: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}><SurfaceBoundary>{content}</SurfaceBoundary></QueryClientProvider>);
}

describe("owner and staff surface boundary", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());
  it("shows the owner sign-in without bootstrapping the staff identity", async () => {
    pathname = "/cabinet";
    vi.mocked(fetch).mockResolvedValue(json(401, { detail: "Войдите в кабинет владельца" }));
    mount(<CabinetHome />);
    await screen.findByRole("heading", { name: "Войти в кабинет" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/owner/me");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
  it("renders join links outside the staff gate", () => {
    pathname = "/join/test-code";
    mount(<h1>Присоединиться к врачу</h1>);
    expect(screen.getByRole("heading", { name: "Присоединиться к врачу" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
  it("requires the staff identity to render clinical children", async () => {
    pathname = "/patients";
    vi.mocked(fetch).mockResolvedValue(json(401, { detail: "Войдите в аккаунт" }));
    mount(<h1>Закрытые пациенты</h1>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Войти", exact: true })).toBeEnabled());
    expect(screen.queryByText("Закрытые пациенты")).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/auth-service/me");
  });
});
