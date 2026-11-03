"use client";

import { accountRequest } from "@/features/authentication/api";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, registerAuthRecovery } from "@/shared/api/client";
import type { components } from "@vetdietderm/api-contract";

export type UserProfile = components["schemas"]["UserProfileRead"];
export type AuthStatus = "checking" | "authenticated" | "unauthenticated";
interface AuthContextValue {
  status: AuthStatus;
  error: string | null;
  user: UserProfile | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}
const AuthContext = React.createContext<AuthContextValue | null>(null);


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("checking");
  const [user, setUser] = React.useState<UserProfile | null>(null);
  const profileVersion = React.useRef(0);
  const [error, setError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();
  const identity = React.useRef("");
  const bootstrap = React.useRef<Promise<void> | null>(null);
  const clear = React.useCallback(() => {
    profileVersion.current += 1;
    queryClient.clear();
    identity.current = "";
    setUser(null);
    setStatus("unauthenticated");
  }, [queryClient]);
  const showSessionError = React.useCallback((cause: unknown) => {
    if (cause instanceof ApiError && (cause.status === 429 || cause.status === 503)) setError(cause.message);
    else if (!(cause instanceof ApiError && cause.status === 401))
      setError("Не удалось проверить сессию. Проверьте соединение и повторите вход.");
  }, []);
  const reload = React.useCallback(async () => {
    const version = ++profileVersion.current;
    const profile = await accountRequest<UserProfile>("/me");
    if (version !== profileVersion.current) return;
    const next = `${profile.user_id}:${profile.organization?.org_id ?? ""}:${profile.organization?.org_role ?? ""}`;
    if (identity.current !== next) queryClient.clear();
    identity.current = next;
    setUser(profile);
    setStatus("authenticated");
    setError(null);
  }, [queryClient]);
  React.useEffect(() => registerAuthRecovery({
    // The BFF has already refreshed and retried once. A 401 is terminal.
    recover: async () => false,
    onUnauthenticated: clear,
  }), [clear]);
  React.useEffect(() => {
    if (!bootstrap.current) bootstrap.current = reload().catch((cause) => {
      clear();
      showSessionError(cause);
    });
  }, [clear, reload, showSessionError]);
  // Revalidate after another tab logs out, changes membership, or signs in.
  React.useEffect(() => {
    const check = () => { void reload().catch((cause) => {
      if (cause instanceof ApiError && cause.status === 401) clear();
    }); };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [reload, clear]);
  const login = React.useCallback(async (email: string, password: string) => {
    await accountRequest("/auth/login", "POST", { email, password });
    await reload();
  }, [reload]);
  const logout = React.useCallback(async () => {
    await accountRequest("/auth/logout", "POST");
    clear();
  }, [clear]);
  return <AuthContext.Provider value={{ status, user, error, login, logout, reload }}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
