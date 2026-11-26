import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAuthRecovery } from "@/shared/api/client";
import { visitQuestionnairesApi } from "@/features/appointments/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("questionnaire feature on the generated client", () => {
  it("uses the same-origin proxy with cookies, CSRF and a typed PUT", async () => {
    const slot = { uuid: "slot", visit_type: "primary", updated_at: "2026-10-29T00:00:00Z", questions: [] };
    const requests: Request[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: Request) => {
      requests.push(request);
      return Response.json(request.method === "GET" ? [slot] : slot);
    }));
    expect(await visitQuestionnairesApi.list()).toEqual([slot]);
    expect(await visitQuestionnairesApi.save("primary", [])).toEqual(slot);
    expect(new URL(requests[0].url).pathname).toBe("/api/visit-questionnaires");
    const request = requests[1];
    expect(new URL(request.url).origin).toBe(location.origin);
    expect(new URL(request.url).pathname).toBe("/api/visit-questionnaires/primary");
    expect(request.method).toBe("PUT");
    expect(request.credentials).toBe("same-origin");
    expect(request.headers.get("X-Vetapp-CSRF")).toBe("1");
    expect(request.headers.has("X-Vetapp-Workspace")).toBe(false);
    expect(request.headers.has("Authorization")).toBe(false);
    expect(await request.json()).toEqual({ questions: [] });
  });

  it("runs staff recovery once on a clinical 401", async () => {
    const recover = vi.fn(async () => false);
    const clear = vi.fn();
    const unregister = registerAuthRecovery({ recover, onUnauthenticated: clear });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail: "expired" }, { status: 401 })));
    try {
      await expect(visitQuestionnairesApi.list()).rejects.toMatchObject({ status: 401, message: "expired" });
      expect(recover).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });
});
