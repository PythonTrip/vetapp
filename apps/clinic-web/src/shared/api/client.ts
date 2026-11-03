export { ApiError, ApiConnectionError } from "@vetdietderm/api-client";
import { createApiClient } from "@vetdietderm/api-client";
import { createHttpClient } from "@vetdietderm/api-client/http";

const http = createHttpClient({ audience: "staff" });
export const { api, apiRequest, apiBlob, apiUpload, registerAuthRecovery } = http;
export function getApiBaseUrl() { return "/api"; }
export const staffContractClient = createApiClient({ platform: "web", audience: "staff", auth: { audience: "staff", recover: http.recoverSession } });
