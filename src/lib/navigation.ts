"use client";

import { useRouter } from "next/navigation";

export type AppSection = "dashboard" | "projects" | "nutrition" | "knowledge" | "settings";

export const SECTION_PATHS: Record<AppSection, string> = {
  dashboard: "/",
  projects: "/projects",
  nutrition: "/nutrition",
  knowledge: "/knowledge",
  settings: "/settings",
};

export function sectionFromPathname(pathname: string): AppSection {
  if (pathname === "/") return "dashboard";
  if (pathname === "/projects" || pathname.startsWith("/projects/")) return "projects";
  if (pathname === "/nutrition" || pathname.startsWith("/nutrition/")) return "nutrition";
  if (pathname === "/knowledge" || pathname.startsWith("/knowledge/")) return "knowledge";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  return "dashboard";
}

export function projectIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function useAppNavigation() {
  const router = useRouter();

  return {
    goToSection(section: AppSection) {
      router.push(SECTION_PATHS[section]);
    },
    openProject(id: string) {
      router.push(`/projects/${encodeURIComponent(id)}`);
    },
    showProjects() {
      router.push("/projects");
    },
  };
}
