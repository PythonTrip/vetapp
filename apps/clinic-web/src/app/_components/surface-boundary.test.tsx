import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SurfaceBoundary } from "@/app/_components/surface-boundary";

vi.mock("next/navigation", () => ({
  usePathname: () => "/patients",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mount(content: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SurfaceBoundary>{content}</SurfaceBoundary>
    </QueryClientProvider>,
  );
}

describe("staff surface boundary", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("requires the staff identity to render clinical children", async () => {
    vi.mocked(fetch).mockResolvedValue(json(401, { detail: "Войдите в аккаунт" }));
    mount(<h1>Закрытые пациенты</h1>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Войти", exact: true })).toBeEnabled());
    expect(screen.queryByText("Закрытые пациенты")).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/auth-service/me");
  });
});
