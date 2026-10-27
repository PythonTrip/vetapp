"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest, registerAuthRecovery, setApiWorkspace, type Workspace } from "@/lib/api-client";

export interface UserProfile {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  organization?: { org_id: string; name: string; org_role: "owner" | "admin" | "member" | "viewer"; status: string } | null;
}
export type AuthStatus = "checking" | "authenticated" | "unauthenticated";
interface AuthContextValue {
  status: AuthStatus;
  error: string | null;
  user: UserProfile | null;
  workspace: Workspace;
  setWorkspace: (workspace: Workspace) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}
const AuthContext = React.createContext<AuthContextValue | null>(null);
export const accountRequest = <T,>(path: string, method = "GET", body?: unknown) =>
  apiRequest<T>(`/auth-service${path}`, { method, body, authRecovery: false });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("checking");
  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [workspace, updateWorkspace] = React.useState<Workspace>("personal");
  const workspaceRef = React.useRef<Workspace>("personal");
  const userRef = React.useRef<UserProfile | null>(null);
  const profileVersion = React.useRef(0);
  const [error, setError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();
  const identity = React.useRef("");
  const bootstrap = React.useRef<Promise<void> | null>(null);
  const clear = React.useCallback(() => {
    profileVersion.current += 1;
    queryClient.clear();
    identity.current = "";
    userRef.current = null;
    workspaceRef.current = "personal";
    setApiWorkspace("personal");
    updateWorkspace("personal");
    setUser(null);
    setStatus("unauthenticated");
  }, [queryClient]);
  const reload = React.useCallback(async () => {
    const version = ++profileVersion.current;
    const profile = await accountRequest<UserProfile>("/me");
    if (version !== profileVersion.current) return;
    let savedWorkspace: string | null = null;
    try { savedWorkspace = sessionStorage.getItem(`vetapp.workspace.${profile.user_id}`); } catch { /* storage may be disabled */ }
    const nextWorkspace = profile.organization?.status === "active" && (
      userRef.current?.user_id === profile.user_id ? workspaceRef.current === "organization" : savedWorkspace === profile.organization.org_id
    ) ? "organization" : "personal";
    workspaceRef.current = nextWorkspace;
    setApiWorkspace(nextWorkspace);
    updateWorkspace(nextWorkspace);
    userRef.current = profile;
    const next = `${profile.user_id}:${profile.organization?.org_id ?? ""}:${profile.organization?.org_role ?? ""}`;
    if (identity.current !== next) queryClient.clear();
    identity.current = next;
    setUser(profile);
    setStatus("authenticated");
    setError(null);
  }, [queryClient]);
  const setWorkspace = React.useCallback((next: Workspace) => {
    if (next === "organization" && userRef.current?.organization?.status !== "active") return;
    workspaceRef.current = next;
    setApiWorkspace(next);
    try { sessionStorage.setItem(`vetapp.workspace.${userRef.current?.user_id}`, next === "organization" ? userRef.current!.organization!.org_id : "personal"); } catch { /* keep selection in memory */ }
    queryClient.clear();
    updateWorkspace(next);
  }, [queryClient]);
  React.useEffect(() => registerAuthRecovery({
    // The BFF has already refreshed and retried once. A 401 is terminal.
    recover: async () => false,
    onUnauthenticated: clear,
  }), [clear]);
  React.useEffect(() => {
    if (!bootstrap.current) bootstrap.current = reload().catch((cause) => {
      clear();
      if (!(cause instanceof ApiError && cause.status === 401))
        setError("Не удалось проверить сессию. Проверьте соединение и повторите вход.");
    });
  }, [clear, reload]);
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
  return <AuthContext.Provider value={{ status, user, workspace, setWorkspace, error, login, logout, reload }}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
