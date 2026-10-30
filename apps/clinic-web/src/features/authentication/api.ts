import { apiRequest } from "@/shared/api/client";

export const accountRequest = <T,>(path: string, method = "GET", body?: unknown) =>
  apiRequest<T>(`/auth-service${path}`, { method, body, authRecovery: false });
