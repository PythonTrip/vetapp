"use client";

import { useRouter } from "next/navigation";

export type AppSection = "dashboard" | "patients" | "nutrition" | "knowledge" | "settings";

export const SECTION_PATHS: Record<AppSection, string> = {
  dashboard: "/",
  patients: "/patients",
  nutrition: "/nutrition",
  knowledge: "/knowledge",
  settings: "/settings",
};

export function sectionFromPathname(pathname: string): AppSection {
  if (pathname === "/") return "dashboard";
  if (
    pathname === "/patients" ||
    pathname.startsWith("/patients/") ||
    pathname === "/projects" ||
    pathname.startsWith("/projects/")
  ) return "patients";
  if (pathname === "/nutrition" || pathname.startsWith("/nutrition/")) return "nutrition";
  if (pathname === "/knowledge" || pathname.startsWith("/knowledge/")) return "knowledge";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  return "dashboard";
}

export function useAppNavigation() {
  const router = useRouter();

  return {
    goToSection(section: AppSection) {
      router.push(SECTION_PATHS[section]);
    },
    openPatient(id: string) {
      router.push(`/patients/${encodeURIComponent(id)}`);
    },
    showPatients() {
      router.push("/patients");
    },
  };
}
