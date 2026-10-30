import { ApiError, ApiConnectionError, type Audience, type Workspace } from "./index";

export function createHttpClient(options: { audience: Audience }) {
  function getApiBaseUrl(): string {
    return "/api";
  }

  let workspace: Workspace = "personal";

  function setApiWorkspace(value: Workspace): void { workspace = value; }

  interface ApiErrorPayload {
    error?: string;
    detail?: unknown;
    details?: unknown;
  }

  type JsonRequestInit = Omit<RequestInit, "body"> & {
    body?: unknown;
    authRecovery?: boolean;
  };

  interface AuthRecoveryHandlers {
    recover: () => Promise<boolean>;
    onUnauthenticated: () => void;
  }

  let authRecoveryHandlers: AuthRecoveryHandlers | null = null;

  let recoveryFlight: Promise<boolean> | null = null;

  function registerAuthRecovery(handlers: AuthRecoveryHandlers): () => void {
    authRecoveryHandlers = handlers;
    return () => {
      if (authRecoveryHandlers === handlers) authRecoveryHandlers = null;
    };
  }

  function resolveUrl(input: string): string {
    if (/^https?:/.test(input) || input.startsWith("//")) throw new Error("Only relative API paths are supported");
    const path = input.startsWith("/") ? input : `/${input}`;
    if (options.audience === "owner" && (!path.startsWith("/owner/") || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(path) || path.includes("\\"))) throw new Error("Owner API route required");
    return `${getApiBaseUrl()}${path}`;
  }

  function messageFromPayload(payload: unknown, fallback: string): string {
    if (payload && typeof payload === "object") {
      const record = payload as ApiErrorPayload;
      if (Array.isArray(record.detail)) {
        const messages = record.detail.map((item) => item && typeof item.msg === "string" ? item.msg : "").filter(Boolean);
        if (messages.length) return messages.join(". ");
      }
      if (typeof record.detail === "string" && record.detail.trim()) return record.detail;
      if (
        record.detail
        && typeof record.detail === "object"
        && "message" in record.detail
        && typeof record.detail.message === "string"
        && record.detail.message.trim()
      ) return record.detail.message;
      if (typeof record.error === "string" && record.error.trim()) return record.error;
    }
    return fallback;
  }

  async function readPayload(response: Response): Promise<unknown> {
    if (response.status === 204) return undefined;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) return response.json();

    const text = await response.text();
    return text || undefined;
  }

  function authenticatedHeaders(headers?: HeadersInit): Headers {
    const requestHeaders = new Headers(headers);
    requestHeaders.set("X-Vetapp-CSRF", "1");
    if (options.audience === "staff") requestHeaders.set("X-Vetapp-Workspace", workspace);
    else requestHeaders.delete("X-Vetapp-Workspace");
    return requestHeaders;
  }

  async function fetchResponse(input: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(resolveUrl(input), { ...init, credentials: "same-origin", cache: "no-store" });
    } catch {
      throw new ApiConnectionError("API unavailable");
    }
  }

  async function recoverSession(): Promise<boolean> {
    if (!authRecoveryHandlers) {
      return false;
    }
    if (!recoveryFlight) {
      const handlers = authRecoveryHandlers;
      recoveryFlight = handlers.recover()
        .catch(() => false)
        .then((recovered) => {
          if (!recovered) handlers.onUnauthenticated();
          return recovered;
        })
        .finally(() => {
          recoveryFlight = null;
        });
    }
    return recoveryFlight;
  }

  async function fetchWithAuthRecovery(
    input: string,
    init: RequestInit,
    allowRecovery: boolean,
  ): Promise<Response> {
    const execute = () => fetchResponse(input, {
      ...init,
      headers: authenticatedHeaders(init.headers),
    });
    const response = await execute();
    if (response.status !== 401 || !allowRecovery || options.audience === "owner") return response;
    return await recoverSession() ? execute() : response;
  }

  function apiError(response: Response, payload: unknown, fallbackMessage: string): ApiError {
    const record = payload && typeof payload === "object" ? payload as ApiErrorPayload : undefined;
    return new ApiError(
      messageFromPayload(payload, fallbackMessage),
      response.status,
      record?.details ?? (record?.detail && typeof record.detail === "object" ? record.detail : undefined),
    );
  }

  async function apiRequest<T>(
    input: string,
    { body, headers, authRecovery = true, ...init }: JsonRequestInit = {},
    fallbackMessage = "Request failed",
  ): Promise<T> {
    const requestHeaders = new Headers(headers);
    if (body !== undefined && !requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", "application/json");
    }
    const response = await fetchWithAuthRecovery(input, {
      ...init,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    }, authRecovery);

    const payload = await readPayload(response);

    if (!response.ok) throw apiError(response, payload, fallbackMessage);

    return payload as T;
  }

  async function apiUpload<T>(
    input: string,
    body: FormData,
    fallbackMessage = "Request failed",
    authRecovery = true,
  ): Promise<T> {
    const response = await fetchWithAuthRecovery(input, { method: "POST", body }, authRecovery);

    const payload = await readPayload(response);
    if (!response.ok) throw apiError(response, payload, fallbackMessage);
    return payload as T;
  }

  async function apiBlob(
    input: string,
    fallbackMessage = "Request failed",
    authRecovery = true,
  ): Promise<Blob> {
    const response = await fetchWithAuthRecovery(input, {}, authRecovery);

    if (!response.ok) {
      const payload = await readPayload(response);
      throw apiError(response, payload, fallbackMessage);
    }
    return response.blob();
  }

  const api = {
    get: <T>(url: string, fallbackMessage?: string) =>
      apiRequest<T>(url, undefined, fallbackMessage),
    post: <T>(url: string, body: unknown, fallbackMessage?: string) =>
      apiRequest<T>(url, { method: "POST", body }, fallbackMessage),
    patch: <T>(url: string, body: unknown, fallbackMessage?: string) =>
      apiRequest<T>(url, { method: "PATCH", body }, fallbackMessage),
    put: <T>(url: string, body: unknown, fallbackMessage?: string) =>
      apiRequest<T>(url, { method: "PUT", body }, fallbackMessage),
    delete: <T = void>(url: string, fallbackMessage?: string) =>
      apiRequest<T>(url, { method: "DELETE" }, fallbackMessage),
  };

  return { api, apiRequest, apiBlob, apiUpload, setApiWorkspace, registerAuthRecovery, recoverSession };
}
