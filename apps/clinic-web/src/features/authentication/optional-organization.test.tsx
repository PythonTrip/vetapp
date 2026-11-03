import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/authentication/auth-provider";
import { InstanceLockScreen } from "@/features/authentication/instance-lock-screen";
import { OrganizationSettings } from "@/features/authentication/organization-settings";
import { api } from "@/shared/api/client";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const user = { user_id: "clinic-user", email: "person@example.com", display_name: "Врач", role: "member" };
const clinic = { org_id: "clinic-1", name: "Клиника", org_role: "owner", status: "active" };
function mount(children: React.ReactNode) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={query}><AuthProvider><InstanceLockScreen>{children}</InstanceLockScreen></AuthProvider></QueryClientProvider>);
}
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
describe("clinic settings", () => {
  it("opens the clinic without a workspace switch or create-organization step", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json({ ...user, organization: clinic })));
    mount(<h1>Пациенты</h1>);
    await screen.findByRole("heading", { name: "Пациенты" });
    expect(screen.queryByRole("button", { name: "Создать организацию" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await api.get("/clients");
    expect(new Headers(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.headers).has("X-Vetapp-Workspace")).toBe(false);
  });
  it("lets an owner rename the clinic and keeps the name read-only for a member", async () => {
    const calls: Array<{ url: string; method: string; body: string | null; workspace: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : null, workspace: headers.get("X-Vetapp-Workspace") });
      if (url.endsWith("/me")) return json({ ...user, organization: clinic });
      if (url.endsWith("/members")) return json({ members: [{ ...user, org_role: "owner" }] });
      if (url.endsWith("/invites")) return json({ invites: [] });
      return json({ ...clinic, name: "Новая клиника" });
    }));
    mount(<OrganizationSettings />);
    expect(await screen.findByRole("heading", { name: "Клиника" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать организацию" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Организация необязательна/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Название клиники"), { target: { value: "Новая клиника" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить", exact: true }));
    await screen.findByText("Название сохранено");
    const saved = calls.find(call => call.method === "PATCH" && call.url.endsWith("/organizations/clinic-1"));
    expect(saved?.body).toBe(JSON.stringify({ name: "Новая клиника" }));
    expect(calls.every(call => call.workspace === null)).toBe(true);

    cleanup();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/me")) return json({ ...user, organization: { ...clinic, org_role: "member" } });
      if (url.endsWith("/members")) return json({ members: [{ ...user, org_role: "member" }] });
      return json({ invites: [] });
    }));
    mount(<OrganizationSettings />);
    expect(await screen.findByRole("heading", { name: "Клиника" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Название клиники")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сохранить", exact: true })).not.toBeInTheDocument();
  });
});
