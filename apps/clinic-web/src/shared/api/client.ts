export { ApiError, ApiConnectionError } from "@vetdietderm/api-client";
export type { Workspace } from "@vetdietderm/api-client";
import { createApiClient } from "@vetdietderm/api-client";
import { createHttpClient } from "@vetdietderm/api-client/http";
import type { Workspace } from "@vetdietderm/api-client";

const http = createHttpClient({ audience: "staff" });
export const { api, apiRequest, apiBlob, apiUpload, registerAuthRecovery } = http;
let workspace: Workspace = "personal";
export function setApiWorkspace(value: Workspace) { workspace = value; http.setApiWorkspace(value); }
export function getApiBaseUrl() { return "/api"; }
export const staffContractClient = createApiClient({ platform: "web", audience: "staff", workspace: () => workspace, auth: { audience: "staff", recover: http.recoverSession } });
