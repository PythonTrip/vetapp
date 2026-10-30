"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { OwnerPlatformProvider } from "@vetdietderm/owner-features/platform";
import { createBrowserPlatform } from "@vetdietderm/owner-features/platform/browser";
export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const platform = useMemo(() => createBrowserPlatform((path, replace) => {
    if (replace) router.replace(path); else router.push(path);
  }), [router]);
  return <OwnerPlatformProvider value={platform}>{children}</OwnerPlatformProvider>;
}
