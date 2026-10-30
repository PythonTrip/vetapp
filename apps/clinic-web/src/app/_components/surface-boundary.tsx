"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/features/authentication/auth-provider";
import { InstanceLockScreen } from "@/features/authentication/instance-lock-screen";
import { AppShell } from "@/app/_components/app-shell";

export function SurfaceBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/join" || pathname.startsWith("/join/") || pathname === "/cabinet") {
    return <main className="min-h-dvh bg-background px-4 py-8 sm:py-12"><div className="mx-auto w-full max-w-lg space-y-8">{children}</div></main>;
  }
  return <AuthProvider><InstanceLockScreen><AppShell>{children}</AppShell></InstanceLockScreen></AuthProvider>;
}
