"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/features/authentication/auth-provider";
import { InstanceLockScreen } from "@/features/authentication/instance-lock-screen";
import { AppShell } from "@/app/_components/app-shell";

export function SurfaceBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/join" || pathname.startsWith("/join/") || pathname === "/cabinet") {
    return <main className={pathname === "/cabinet" ? "owner-app min-h-dvh" : "min-h-dvh bg-background px-4 py-6 sm:py-10"}><div className={pathname === "/cabinet" ? "owner-app-content" : "mx-auto w-full max-w-3xl space-y-6"}>{children}</div></main>;
  }
  return <AuthProvider><InstanceLockScreen><AppShell>{children}</AppShell></InstanceLockScreen></AuthProvider>;
}
