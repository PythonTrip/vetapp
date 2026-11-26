"use client";

import { AuthProvider } from "@/features/authentication/auth-provider";
import { InstanceLockScreen } from "@/features/authentication/instance-lock-screen";
import { AppShell } from "@/app/_components/app-shell";

export function SurfaceBoundary({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <InstanceLockScreen>
        <AppShell>{children}</AppShell>
      </InstanceLockScreen>
    </AuthProvider>
  );
}
