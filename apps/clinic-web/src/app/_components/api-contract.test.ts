import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, registerAuthRecovery, setApiWorkspace } from "@/shared/api/client";
import { visitQuestionnairesApi } from "@/features/appointments/api";
import { ownerRequest } from "@/features/owner-cabinet/api";

afterEach(() => { vi.unstubAllGlobals(); setApiWorkspace("personal"); });

describe("questionnaire feature on the generated client", () => {
  it("uses the same-origin proxy with cookies, CSRF, workspace and a typed PUT", async () => {
    const slot = { uuid: "slot", visit_type: "primary", updated_at: "2026-10-29T00:00:00Z", questions: [] };
    const requests: Request[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: Request) => {
      requests.push(request);
      return Response.json(request.method === "GET" ? [slot] : slot);
    }));
    setApiWorkspace("organization");
    expect(await visitQuestionnairesApi.list()).toEqual([slot]);
    expect(await visitQuestionnairesApi.save("primary", [])).toEqual(slot);
    expect(new URL(requests[0].url).pathname).toBe("/api/visit-questionnaires");
    const request = requests[1];
    expect(new URL(request.url).origin).toBe(location.origin);
    expect(new URL(request.url).pathname).toBe("/api/visit-questionnaires/primary");
    expect(request.method).toBe("PUT");
    expect(request.credentials).toBe("same-origin");
    expect(request.headers.get("X-Vetapp-CSRF")).toBe("1");
    expect(request.headers.get("X-Vetapp-Workspace")).toBe("organization");
    expect(request.headers.has("Authorization")).toBe(false);
    expect(await request.json()).toEqual({ questions: [] });
  });

  it("uses existing terminal staff recovery while owner 401 cannot clear it", async () => {
    const recover = vi.fn(async () => false); const clear = vi.fn();
    const unregister = registerAuthRecovery({ recover, onUnauthenticated: clear });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail: "expired" }, { status: 401 })));
    try {
      await expect(ownerRequest("/me")).rejects.toBeInstanceOf(ApiError);
      expect(recover).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
      await expect(visitQuestionnairesApi.list()).rejects.toMatchObject({ status: 401, message: "expired" });
      expect(recover).toHaveBeenCalledTimes(1); expect(clear).toHaveBeenCalledTimes(1);
    } finally { unregister(); }
  });
});
