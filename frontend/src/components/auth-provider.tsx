"use client";

import * as React from "react";
import {
  ApiConnectionError,
  ApiError,
  apiRequest,
  clearInstanceToken,
  getInstanceToken,
  registerAuthRecovery,
  setInstanceToken,
} from "@/lib/api-client";

export type AuthStatus = "checking" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  error: string | null;
  login: (password: string) => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

async function verifyCurrentSession(): Promise<void> {
  await apiRequest<{ status: string }>(
    "/ready",
    { authRecovery: false },
    "Неверный пароль",
  );
}

function authErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 401) {
    return cause.message || "Неверный пароль";
  }
  if (cause instanceof ApiConnectionError) {
    return "Не удалось связаться с API. Проверьте, что сервер запущен.";
  }
  return "Не удалось проверить доступ к API.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("checking");
  const [error, setError] = React.useState<string | null>(null);
  const bootstrap = React.useRef<Promise<AuthStatus> | null>(null);

  const markUnauthenticated = React.useCallback(() => {
    clearInstanceToken();
    setStatus("unauthenticated");
  }, []);

  const recover = React.useCallback(async () => {
    if (!getInstanceToken()) return false;
    try {
      await verifyCurrentSession();
      setError(null);
      return true;
    } catch (cause) {
      setError(authErrorMessage(cause));
      return false;
    }
  }, []);

  React.useEffect(
    () => registerAuthRecovery({ recover, onUnauthenticated: markUnauthenticated }),
    [markUnauthenticated, recover],
  );

  React.useEffect(() => {
    let active = true;
    if (!bootstrap.current) {
      bootstrap.current = (async () => {
        if (!getInstanceToken()) return "unauthenticated";
        try {
          await verifyCurrentSession();
          return "authenticated";
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) clearInstanceToken();
          setError(authErrorMessage(cause));
          return "unauthenticated";
        }
      })();
    }
    void bootstrap.current.then((nextStatus) => {
      if (active) setStatus(nextStatus);
    });
    return () => {
      active = false;
    };
  }, []);

  const login = React.useCallback(async (password: string) => {
    setInstanceToken(password);
    setError(null);
    try {
      await verifyCurrentSession();
      setStatus("authenticated");
    } catch (cause) {
      clearInstanceToken();
      setStatus("unauthenticated");
      setError(authErrorMessage(cause));
      throw cause;
    }
  }, []);

  const value = React.useMemo(() => ({ status, error, login }), [error, login, status]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
