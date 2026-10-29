import { describe, expect, it, vi } from "vitest";
import { ApiConnectionError, ApiError, createApiClient, dataOf, multipartBody } from "./index";

const json = (value: unknown, status = 200) => Response.json(value, { status });
const native = (fetch: typeof globalThis.fetch) => createApiClient({
  platform: "native", baseUrl: "https://api.example.test", audience: "staff",
  auth: { audience: "staff", headers: () => ({ Cookie: "vetapp_session=staff" }) }, fetch,
});

describe("platform API client", () => {
  it("supports v1 audience paths and structured errors without crossing credentials", async () => {
    const requests: Request[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      requests.push(input as Request);
      return json({ error: { code: "conflict", message: "Already linked", details: { field: "email" } } }, 409);
    });
    const owner = createApiClient({
      platform: "native", baseUrl: "https://api.example.test", audience: "owner", fetch,
      auth: { audience: "owner", headers: () => ({ Cookie: "vetapp_owner_session=owner" }) },
    });
    await expect(owner.GET("/v1/owner/me")).rejects.toMatchObject({
      status: 409, code: "conflict", message: "Already linked", details: { field: "email" },
    });
    await expect(owner.POST("/v1/auth/owner/logout")).rejects.toMatchObject({ status: 409 });
    await expect(owner.GET("/v1/staff/patients")).rejects.toThrow("audience mismatch");
    await expect(native(fetch).GET("/v1/owner/me")).rejects.toThrow("audience mismatch");
    await expect(native(fetch).POST("/v1/auth/owner/logout")).rejects.toThrow("audience mismatch");
    expect(requests).toHaveLength(2);
    expect(requests.every(request => request.headers.get("Cookie") === "vetapp_owner_session=owner")).toBe(true);
  });

  it("serializes typed path, query and body, retaining native session and workspace", async () => {
    const requests: Request[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      requests.push(input as Request);
      return json({ questions: [] });
    });
    const client = native(fetch);
    await client.PUT("/visit-questionnaires/{visit_type}", {
      params: { path: { visit_type: "primary" } }, body: { questions: [] },
    });
    const request = requests[0];
    expect(request.url).toBe("https://api.example.test/visit-questionnaires/primary");
    expect(request.method).toBe("PUT");
    expect(await request.json()).toEqual({ questions: [] });
    expect(request.headers.get("Cookie")).toBe("vetapp_session=staff");
    expect(request.headers.get("X-Vetapp-CSRF")).toBe("1");
    expect(request.headers.get("X-Vetapp-Workspace")).toBe("personal");
    expect(request.credentials).toBe("omit");
    expect(request.redirect).toBe("error");
    await client.GET("/patients", { params: { query: { q: "кот & пёс" } } });
    expect(new URL(requests[1].url).searchParams.get("q")).toBe("кот & пёс");
  });

  it("retries once with fresh credentials and the original body", async () => {
    let token = "old";
    const bodies: unknown[] = [];
    const cookies: (string | null)[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request;
      bodies.push(await request.json()); cookies.push(request.headers.get("Cookie"));
      return cookies.length === 1 ? json({ detail: "expired" }, 401) : json({ questions: [] });
    });
    const recover = vi.fn(async () => { token = "new"; return true; });
    const client = createApiClient({
      platform: "native", baseUrl: "https://api.example.test", audience: "staff", fetch,
      auth: { audience: "staff", headers: () => ({ Cookie: `vetapp_session=${token}` }), recover },
    });
    await client.PUT("/visit-questionnaires/{visit_type}", {
      params: { path: { visit_type: "primary" } }, body: { questions: [] },
    });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(bodies).toEqual([{ questions: [] }, { questions: [] }]);
    expect(cookies).toEqual(["vetapp_session=old", "vetapp_session=new"]);
  });

  it("shares recovery only within its instance and never invokes staff recovery for owner 401", async () => {
    let release!: (value: boolean) => void;
    const staffRecover = vi.fn(() => new Promise<boolean>(resolve => { release = resolve; }));
    const staffLogout = vi.fn(); const ownerLogout = vi.fn();
    const fetch = vi.fn(async () => json({ detail: "expired" }, 401));
    const staff = createApiClient({
      platform: "native", baseUrl: "https://api.example.test", audience: "staff", fetch,
      auth: { audience: "staff", recover: staffRecover, onUnauthenticated: staffLogout },
    });
    const owner = createApiClient({
      platform: "native", baseUrl: "https://api.example.test", audience: "owner", fetch,
      auth: { audience: "owner", onUnauthenticated: ownerLogout },
    });
    await expect(owner.GET("/owner/me")).rejects.toMatchObject({ status: 401 });
    expect(staffRecover).not.toHaveBeenCalled(); expect(staffLogout).not.toHaveBeenCalled();
    expect(ownerLogout).toHaveBeenCalledTimes(1);
    const first = staff.GET("/patients"); const second = staff.GET("/patients");
    const settled = Promise.allSettled([first, second]);
    await vi.waitFor(() => expect(staffRecover).toHaveBeenCalledTimes(1));
    release(false);
    expect((await settled).every(result => result.status === "rejected")).toBe(true);
    expect(staffRecover).toHaveBeenCalledTimes(1);
  });

  it("rejects route and credential audience mixing before sending a request", async () => {
    const fetch = vi.fn(async () => json({}));
    await expect(native(fetch).GET("/owner/me")).rejects.toThrow("audience mismatch");
    const owner = createApiClient({
      platform: "native", baseUrl: "https://api.example.test", audience: "owner", fetch,
      auth: { audience: "owner", headers: () => ({ Cookie: "vetapp_session=staff; vetapp_owner_session=owner" }) },
    });
    await expect(owner.GET("/owner/me")).rejects.toThrow("one audience");
    await expect(native(fetch).GET("/patients", { headers: { Authorization: "Bearer wrong" } })).rejects.toThrow("auth adapter");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("terminates after one failed retry and treats recovery failures as terminal", async () => {
    const fetch = vi.fn(async () => json({ detail: "expired" }, 401));
    const clear = vi.fn();
    const options = { platform: "native" as const, baseUrl: "https://api.example.test", audience: "staff" as const, fetch };
    const client = createApiClient({ ...options, auth: { audience: "staff", recover: async () => true, onUnauthenticated: clear } });
    await expect(client.GET("/patients")).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(2); expect(clear).toHaveBeenCalledTimes(1);
    const broken = createApiClient({ ...options, auth: { audience: "staff", recover: () => { throw new Error("storage unavailable"); }, onUnauthenticated: clear } });
    await expect(broken.GET("/patients")).rejects.toMatchObject({ status: 401 });
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("rejects insecure origins and base URL overrides", async () => {
    expect(() => createApiClient({ platform: "native", baseUrl: "http://api.example.test", audience: "staff", auth: { audience: "staff" } })).toThrow("HTTPS");
    const fetch = vi.fn(async () => json({}));
    await expect(native(fetch).GET("/patients", { baseUrl: "https://other.example" })).rejects.toThrow("base URL");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves validation details, non-JSON errors, network failures and aborts", async () => {
    const fetch = vi.fn(async () => json({ detail: [{ msg: "Invalid value", loc: ["body", "questions"] }] }, 422));
    await expect(native(fetch).GET("/patients")).rejects.toMatchObject({
      name: "ApiError", status: 422, message: "Invalid value", details: [{ msg: "Invalid value", loc: ["body", "questions"] }],
    });
    await expect(native(async () => new Response("offline", { status: 502 })).GET("/patients")).rejects.toBeInstanceOf(ApiError);
    await expect(native(async () => { throw new TypeError("offline"); }).GET("/patients")).rejects.toBeInstanceOf(ApiConnectionError);
    const controller = new AbortController(); controller.abort();
    const error = new DOMException("Aborted", "AbortError");
    await expect(native(async () => { throw error; }).GET("/patients", { signal: controller.signal })).rejects.toBe(error);
  });

  it("supports empty responses and binary downloads", async () => {
    const empty = await native(async () => new Response(null, { status: 204 })).DELETE("/appointments/{appointment_id}", { params: { path: { appointment_id: "id" } } });
    expect(empty.data).toBeUndefined();
    const download = await native(async () => new Response("file")).GET("/attachments/{attachment_id}/file", {
      params: { path: { attachment_id: "id" } }, parseAs: "blob",
    });
    expect(await download.data?.text()).toBe("file");
    expect(dataOf({ data: [] })).toEqual([]);
  });

  it("uploads a typed multipart file with isolated owner credentials", async () => {
    let received!: Request;
    const client = createApiClient({
      platform: "native", baseUrl: "https://api.example.test", audience: "owner",
      auth: { audience: "owner", headers: () => ({ Cookie: "vetapp_owner_session=owner" }) },
      fetch: async input => { received = input as Request; return json({ uuid: "file" }); },
    });
    await client.POST("/owner/visits/{request_id}/files", {
      params: { path: { request_id: "visit" } },
      body: { file: new Blob(["photo"], { type: "image/jpeg" }) }, bodySerializer: multipartBody,
    });
    expect(received.headers.get("Cookie")).toBe("vetapp_owner_session=owner");
    expect(received.headers.has("X-Vetapp-Workspace")).toBe(false);
    expect(received.headers.get("Content-Type")).toContain("multipart/form-data; boundary=");
    const file = (await received.formData()).get("file") as Blob;
    expect(await file.text()).toBe("photo");
  });
});
