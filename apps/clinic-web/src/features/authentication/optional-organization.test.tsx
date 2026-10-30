import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/authentication/auth-provider";
import { InstanceLockScreen } from "@/features/authentication/instance-lock-screen";
import { OrganizationSettings } from "@/features/authentication/organization-settings";
import { api } from "@/shared/api/client";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const user = { user_id: "personal-user", email: "person@example.com", display_name: "Врач", role: "member" };
function mount(children: React.ReactNode) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={query}><AuthProvider><InstanceLockScreen>{children}</InstanceLockScreen></AuthProvider></QueryClientProvider>);
}
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
describe("optional organization", () => {
  it("opens the application immediately for an account without an organization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json(user)));
    mount(<h1>Пациенты</h1>);
    await screen.findByRole("heading", { name: "Пациенты" });
    expect(screen.queryByRole("button", { name: "Создать организацию" })).not.toBeInTheDocument();
    await api.get("/clients");
    expect(new Headers(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.headers).get("X-Vetapp-Workspace")).toBe("personal");
  });
  it("refreshes settings after creation and keeps personal work available", async () => {
    let created = false;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/organizations") && init?.method === "POST") {
        created = true; return json({ org_id: "new-org", name: "Клиника" });
      }
      if (url.endsWith("/me")) return json({ ...user, organization: created ? { org_id: "new-org", name: "Клиника", org_role: "owner", status: "active" } : null });
      if (url.endsWith("/members")) return json({ members: [{ ...user, org_role: "owner" }] });
      if (url.endsWith("/invites")) return json({ invites: [] });
      return json([]);
    }));
    mount(<><h1>Настройки</h1><OrganizationSettings /></>);
    await screen.findByRole("button", { name: "Создать организацию" });
    fireEvent.change(screen.getByLabelText("Название организации"), { target: { value: "Клиника" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать организацию" }));
    await screen.findByText("Организация создана");
    expect(screen.getByRole("heading", { name: "Настройки" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Клиника" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать организацию" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Личное/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Клиника — общие/ }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Клиника — общие/ })).toBeChecked());
    await api.get("/clients");
    expect(new Headers(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.headers).get("X-Vetapp-Workspace")).toBe("organization");
    fireEvent.click(screen.getByRole("radio", { name: /Личное/ }));
    await api.get("/clients");
    expect(new Headers(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.headers).get("X-Vetapp-Workspace")).toBe("personal");
  });
});
