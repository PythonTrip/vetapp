"use client";

import { createContext, useContext, type ComponentProps } from "react";
import { createBrowserPlatform } from "./platform/browser";

export interface OwnerPlatform {
  readonly kind: "browser" | "telegram";
  navigate: (path: string, replace?: boolean) => void;
  saveFile: (blob: Blob, filename: string) => Promise<void>;
}

const PlatformContext = createContext<OwnerPlatform>(createBrowserPlatform());
export const OwnerPlatformProvider = PlatformContext.Provider;
export function useOwnerPlatform() { return useContext(PlatformContext); }

export function OwnerLink({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  const platform = useOwnerPlatform();
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || props.target || props.download) return;
    if (!href.startsWith("/") || href.startsWith("//")) return;
    event.preventDefault();
    platform.navigate(href);
  }} />;
}
