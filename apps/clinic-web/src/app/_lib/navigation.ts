"use client";

export type AppSection = "patients" | "schedule" | "encounter" | "nutrition" | "settings";

export function sectionFromPathname(pathname: string): AppSection | null {
  if (pathname === "/patients" || pathname.startsWith("/patients/")) return "patients";
  if (pathname === "/schedule" || pathname.startsWith("/schedule/")) return "schedule";
  if (pathname === "/encounter" || pathname.startsWith("/encounter/")) return "encounter";
  if (pathname === "/nutrition" || pathname.startsWith("/nutrition/")) return "nutrition";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  return null;
}
