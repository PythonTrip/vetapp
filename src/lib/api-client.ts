export interface ApiErrorPayload {
  error?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type JsonRequestInit = Omit<RequestInit, "body"> & {
  body?: unknown;
};

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();

  const text = await response.text();
  return text || undefined;
}

export async function apiRequest<T>(
  input: string,
  { body, headers, ...init }: JsonRequestInit = {},
  fallbackMessage = "Request failed",
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: body === undefined
      ? headers
      : { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await readPayload(response);

  if (!response.ok) {
    const errorPayload = payload && typeof payload === "object"
      ? payload as ApiErrorPayload
      : undefined;
    throw new ApiError(
      errorPayload?.error || fallbackMessage,
      response.status,
      errorPayload?.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(url: string, fallbackMessage?: string) =>
    apiRequest<T>(url, undefined, fallbackMessage),
  post: <T>(url: string, body: unknown, fallbackMessage?: string) =>
    apiRequest<T>(url, { method: "POST", body }, fallbackMessage),
  patch: <T>(url: string, body: unknown, fallbackMessage?: string) =>
    apiRequest<T>(url, { method: "PATCH", body }, fallbackMessage),
  delete: <T = void>(url: string, fallbackMessage?: string) =>
    apiRequest<T>(url, { method: "DELETE" }, fallbackMessage),
};
