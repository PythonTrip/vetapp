import * as React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { ApiError, api, setInstanceToken } from "@/lib/api-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function AuthStatus({ route = "patients" }: { route?: string }) {
  const { status } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{status}</span>
      <span data-testid="route">{route}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bootstraps an existing authenticated session exactly once", async () => {
    setInstanceToken("valid-token");
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { status: "ok" }));

    render(
      <React.StrictMode>
        <AuthProvider>
          <AuthStatus />
        </AuthProvider>
      </React.StrictMode>,
    );

    expect(screen.getByTestId("auth-status")).toHaveTextContent("checking");
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("http://127.0.0.1:8000/ready");
  });

  it("finishes bootstrap as unauthenticated without a session request when no token exists", async () => {
    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not repeat bootstrap when protected route content changes", async () => {
    setInstanceToken("valid-token");
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { status: "ok" }));

    const view = render(
      <AuthProvider>
        <AuthStatus route="patients" />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"));

    view.rerender(
      <AuthProvider>
        <AuthStatus route="nutrition" />
      </AuthProvider>,
    );

    expect(screen.getByTestId("route")).toHaveTextContent("nutrition");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("recovers after 401 and retries the original request once", async () => {
    setInstanceToken("valid-token");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const callsForUrl = vi.mocked(fetch).mock.calls.filter(([candidate]) => String(candidate) === url).length;
      if (url.endsWith("/ready")) return jsonResponse(200, { status: "ok" });
      if (url.endsWith("/patients") && callsForUrl === 1) {
        return jsonResponse(401, { detail: "Неверный пароль" });
      }
      return jsonResponse(200, []);
    });

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"));

    await expect(api.get("/patients")).resolves.toEqual([]);
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).endsWith("/ready"))).toHaveLength(2);
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).endsWith("/patients"))).toHaveLength(2);
    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
  });

  it("ends the session when recovery after 401 fails", async () => {
    setInstanceToken("expired-token");
    let readyCalls = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).endsWith("/ready")) {
        readyCalls += 1;
        return readyCalls === 1
          ? jsonResponse(200, { status: "ok" })
          : jsonResponse(401, { detail: "Неверный пароль" });
      }
      return jsonResponse(401, { detail: "Неверный пароль" });
    });

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"));

    await expect(api.get("/patients")).rejects.toMatchObject({ status: 401 } satisfies Partial<ApiError>);
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated"));
    expect(sessionStorage.getItem("vetdietderm.instance_bearer")).toBeNull();
  });

  it("uses one single-flight recovery request for parallel 401 responses", async () => {
    setInstanceToken("valid-token");
    const endpointCalls = new Map<string, number>();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/ready")) return jsonResponse(200, { status: "ok" });
      const count = (endpointCalls.get(url) ?? 0) + 1;
      endpointCalls.set(url, count);
      return count === 1
        ? jsonResponse(401, { detail: "Неверный пароль" })
        : jsonResponse(200, { url });
    });

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"));

    await act(async () => {
      await Promise.all([api.get("/patients"), api.get("/appointments")]);
    });

    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).endsWith("/ready"))).toHaveLength(2);
    expect(endpointCalls.get("http://127.0.0.1:8000/patients")).toBe(2);
    expect(endpointCalls.get("http://127.0.0.1:8000/appointments")).toBe(2);
  });
});
