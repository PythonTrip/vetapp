import { apiRequest } from "@/lib/api-client";
import type { Sex, Species } from "@/lib/api-client";

export interface DoctorPreview { doctor_name: string; organization_name: string | null }
export interface OwnerProfile extends DoctorPreview { uuid: string; name: string; email: string; phone: string }
export interface OwnerContact { name: string; email: string; phone: string }
export interface AnimalPassport { uuid: string; name: string; species: Species; breed: string; sex: Sex; birth_date: string | null }

// Owner 401s must never invoke staff recovery or clear the staff session.
export const ownerRequest = <T,>(path: string, method = "GET", body?: unknown) =>
  apiRequest<T>(`/owner${path}`, { method, body, authRecovery: false }, "Не удалось выполнить запрос. Повторите попытку.");

export function ownerError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Не удалось выполнить запрос";
}
