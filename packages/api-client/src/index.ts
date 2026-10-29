import createClient from "openapi-fetch";
import type { paths } from "@vetdietderm/api-contract";

export type { paths, components, operations } from "@vetdietderm/api-contract";

export type Audience = "staff" | "owner";
export type Workspace = "personal" | "organization";
export interface AuthAdapter<A extends Audience> {
  readonly audience: A;
  /** Native only: credentials from this audience's secure storage. */
  headers?: () => HeadersInit | Promise<HeadersInit>;
  recover?: () => Promise<boolean>;
  onUnauthenticated?: () => void;
}

type Options<A extends Audience> = {
  audience: A;
  auth: AuthAdapter<NoInfer<A>>;
  fetch?: typeof globalThis.fetch;
  workspace?: () => Workspace;
} & (
  | { platform: "web"; baseUrl?: "/api" }
  | { platform: "native"; baseUrl: string }
);

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiConnectionError extends Error {
  constructor(message = "API unavailable") {
    super(message);
    this.name = "ApiConnectionError";
  }
}

function errorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Request failed";
  const record = payload as Record<string, unknown>;
  if (record.error && typeof record.error === "object" && "message" in record.error && typeof record.error.message === "string") return record.error.message;
  if (typeof record.detail === "string") return record.detail;
  if (Array.isArray(record.detail)) {
    return record.detail.map(item => typeof item?.msg === "string" ? item.msg : "").filter(Boolean).join(". ") || "Request failed";
  }
  if (record.detail && typeof record.detail === "object" && "message" in record.detail && typeof record.detail.message === "string") return record.detail.message;
  return typeof record.error === "string" ? record.error : "Request failed";
}

/** Each instance owns its credentials and recovery flight. No global auth state. */
export function createApiClient<A extends Audience>(options: Options<A>) {
  if (options.auth.audience !== options.audience) throw new Error("Auth audience mismatch");
  const web = options.platform === "web";
  if (web && options.auth.headers) throw new Error("Web authentication uses HttpOnly cookies");
  const baseUrl = web ? (options.baseUrl ?? "/api") : options.baseUrl.replace(/\/+$/, "");
  if (!web) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("Native API baseUrl must be an HTTPS URL without credentials, query or fragment");
    }
  }
  const basePath = web ? baseUrl : new URL(baseUrl).pathname.replace(/\/$/, "");
  const transport = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  let recovery: Promise<boolean> | undefined;
  async function recover(): Promise<boolean> {
    if (!options.auth.recover) return false;
    if (!recovery) {
      recovery = Promise.resolve().then(() => options.auth.recover!()).catch(() => false).finally(() => { recovery = undefined; });
    }
    return recovery;
  }
  const client = createClient<paths>({
    baseUrl,
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      // Reject path traversal or caller-supplied baseUrl overrides before credentials.
      const expectedOrigin = web ? globalThis.location?.origin : new URL(baseUrl).origin;
      if (url.origin !== expectedOrigin || !url.pathname.startsWith(`${basePath}/`)) {
        throw new Error("Request escaped the configured API base URL");
      }
      const path = url.pathname.slice(basePath.length);
      const ownerRoute = ["/owner", "/v1/owner", "/v1/auth/owner"].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
      if (ownerRoute !== (options.audience === "owner")) throw new Error("API route audience mismatch");
      // Keep a pristine request for one retry, including PUT/POST bodies.
      const execute = async () => {
        const headers = new Headers(request.headers);
        if (headers.has("Authorization") || headers.has("Cookie")) throw new Error("Supply credentials through the auth adapter");
        if (!web && options.auth.headers) {
          const authHeaders = new Headers(await options.auth.headers());
          const cookie = authHeaders.get("Cookie");
          const cookieName = options.audience === "staff" ? "vetapp_session" : "vetapp_owner_session";
          if (cookie && (cookie.split(";").some(part => part.trim().split("=")[0] !== cookieName) || authHeaders.has("Authorization"))) {
            throw new Error("Credentials must belong to one audience and one authentication scheme");
          }
          authHeaders.forEach((value, key) => headers.set(key, value));
        }
        headers.set("X-Vetapp-CSRF", "1");
        if (options.audience === "staff") headers.set("X-Vetapp-Workspace", options.workspace?.() ?? "personal");
        else headers.delete("X-Vetapp-Workspace");
        try {
          return await transport(new Request(request.clone(), {
            headers, credentials: web ? "same-origin" : "omit", cache: "no-store", redirect: "error",
          }));
        } catch (error) {
          if (request.signal.aborted) throw error;
          throw new ApiConnectionError();
        }
      };
      let response = await execute();
      if (response.status === 401 && options.auth.recover && await recover()) response = await execute();
      if (response.status === 401) options.auth.onUnauthenticated?.();
      return response;
    },
  });
  client.use({
    async onResponse({ response }) {
      if (response.ok) return;
      const payload: unknown = await response.clone().json().catch(() => undefined);
      const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : undefined;
      const error = record?.error && typeof record.error === "object" ? record.error as Record<string, unknown> : undefined;
      throw new ApiError(errorMessage(payload), response.status, error?.details ?? record?.details ?? record?.detail,
        typeof error?.code === "string" ? error.code : undefined);
    },
  });
  return client;
}

/** Unwrap a successful JSON response; HTTP errors are thrown by the client. */
export function dataOf<T>(result: { data?: T }): T {
  if (result.data === undefined) throw new Error("Expected an API response body");
  return result.data;
}

/** Multipart serializer for the API's file-upload bodies; fetch sets the boundary. */
export function multipartBody(body: Record<string, string | number | boolean | Blob | null | undefined>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value != null) form.append(key, value instanceof Blob ? value : String(value));
  }
  return form;
}
