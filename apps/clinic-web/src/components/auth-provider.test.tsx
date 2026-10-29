import * as React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api-client";
const profile = { user_id: "a", email: "a@example.com", organization: { org_id: "org-a", org_role: "member" } };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function State() { const { status } = useAuth(); return <span data-testid="status">{status}</span>; }
function mount(client = new QueryClient()) {
  render(<React.StrictMode><QueryClientProvider client={client}><AuthProvider><State /></AuthProvider></QueryClientProvider></React.StrictMode>);
  return client;
}
describe("BFF session provider", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());
  it("bootstraps once with a same-origin cookie and no browser tokens", async () => {
    vi.mocked(fetch).mockResolvedValue(json(200, profile));
    mount();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/auth-service/me");
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });
  it("treats BFF 401 as terminal and clears cached clinical data", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(200, profile));
    const client = mount();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    client.setQueryData(["patients"], ["private"]);
    vi.mocked(fetch).mockResolvedValue(json(401, { detail: "expired" }));
    await act(async () => { await expect(api.get("/patients")).rejects.toThrow("expired"); });
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    expect(client.getQueryData(["patients"])).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not authenticate an expired cookie", async () => {
    vi.mocked(fetch).mockResolvedValue(json(401, { detail: "expired" }));
    mount();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
  });
});
