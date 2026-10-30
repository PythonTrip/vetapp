// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createWebProxy } from "@vetdietderm/web-proxy";
import { createHttpClient } from "@vetdietderm/api-client/http";

const proxy = createWebProxy({ audience: "owner" });
const context = (segments: string[]) => ({ params: Promise.resolve({ path: segments }) });
afterEach(() => vi.unstubAllGlobals());

describe("independent owner boundary", () => {
  it("rejects staff routes, path traversal and foreign write origins before upstream", async () => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    for (const segments of [["patients"], ["auth-service", "me"], ["owner", "..", "patients"], ["owner", "%2e%2e", "patients"]]) {
      expect((await proxy(new NextRequest("https://owner.example/api/test"), context(segments))).status).toBe(404);
    }
    expect((await proxy(new NextRequest("https://owner.example/api/owner/logout", {
      method: "POST", headers: { origin: "https://clinic.example", "X-Vetapp-CSRF": "1" },
    }), context(["owner", "logout"]))).status).toBe(403);
    expect((await proxy(new NextRequest("https://owner.example/api/owner/logout", {
      method: "POST", headers: { origin: "https://owner.example" },
    }), context(["owner", "logout"]))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards only owner credentials and streams downloads without caching", async () => {
    const upstream = vi.fn(async () => new Response("file bytes", { headers: { "content-type": "application/pdf" } }));
    vi.stubGlobal("fetch", upstream);
    const response = await proxy(new NextRequest("https://owner.example/api/owner/files/file-1", { headers: {
      cookie: "vetapp_session=staff-secret; vetapp_owner_session=owner-secret",
      authorization: "Bearer staff-secret", "X-Vetapp-Workspace": "organization",
    } }), context(["owner", "files", "file-1"]));
    const headers = new Headers(upstream.mock.calls[0][1].headers);
    expect(headers.get("cookie")).toBe("vetapp_owner_session=owner-secret");
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("X-Vetapp-Workspace")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("file bytes");
  });

  it("preserves owner login/logout cookies and multipart bodies", async () => {
    const upstream = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(new Headers(init.headers).get("content-type")).toContain("multipart/form-data");
      expect(await new Response(init.body).text()).toContain("attachment");
      return new Response("{}", { headers: { "set-cookie": "vetapp_owner_session=new; Path=/; HttpOnly; SameSite=Lax" } });
    });
    vi.stubGlobal("fetch", upstream);
    const body = new FormData(); body.append("file", new Blob(["attachment"]), "photo.pdf");
    const response = await proxy(new NextRequest("https://owner.example/api/owner/visits/id/files", {
      method: "POST", body, headers: { origin: "https://owner.example", "X-Vetapp-CSRF": "1" },
    }), context(["owner", "visits", "id", "files"]));
    expect(response.headers.get("set-cookie")).toContain("vetapp_owner_session=new");
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("owner transport cannot call staff APIs or recover a staff identity", async () => {
    const http = createHttpClient({ audience: "owner" });
    const recover = vi.fn(); const clear = vi.fn();
    http.registerAuthRecovery({ recover, onUnauthenticated: clear });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail: "expired" }, { status: 401 })));
    await expect(http.apiRequest("/owner/me")).rejects.toMatchObject({ status: 401 });
    expect(recover).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
    for (const url of ["/patients", "/owner/../patients", "/owner/%2e%2e/patients", "https://external.example/owner/me"]) {
      await expect(http.apiRequest(url)).rejects.toThrow();
    }
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("owner app and shared owner modules have no imports from Clinic UI or Next routing", () => {
    const repo = path.resolve(import.meta.dirname, "../../..");
    function files(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(dir, entry.name);
        return entry.isDirectory() ? files(file) : /\.[jt]sx?$/.test(file) && !file.includes(".test.") ? [file] : [];
      });
    }
    for (const directory of ["apps/owner-web/src", "packages/owner-features/src", "packages/ui/src", "packages/web-proxy/src"]) {
      for (const file of files(path.join(repo, directory))) {
        const source = readFileSync(file, "utf8");
        expect(source, file).not.toMatch(/clinic-web|@\/features|@\/shared|authentication\/auth-provider/);
        if (directory === "packages/owner-features/src") expect(source, file).not.toMatch(/from ["']next\//);
      }
    }
  });
});
