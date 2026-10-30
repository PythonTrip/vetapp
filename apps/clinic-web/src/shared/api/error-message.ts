import { ApiConnectionError, ApiError } from "@/shared/api/client";


export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiConnectionError) {
    return "Не удалось связаться с API. Проверьте, что сервер запущен.";
  }
  if (error instanceof ApiError) {
    if (error.status === 401) return "Нет доступа. Обновите страницу и войдите снова.";
    if (error.status === 422) return error.message.trim() || "Проверьте введённые данные.";
    return error.message.trim() || "Не удалось выполнить запрос.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Не удалось выполнить запрос.";
}
