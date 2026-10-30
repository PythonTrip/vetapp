"use client";
import { useMemo, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { OwnerPlatformProvider } from "@vetdietderm/owner-features/platform";
import { createBrowserPlatform } from "@vetdietderm/owner-features/platform/browser";
import { createTelegramPlatform, type TelegramBridge } from "@vetdietderm/owner-features/platform/telegram";
export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [bridge, setBridge] = useState<TelegramBridge | null>(null);
  const platform = useMemo(() => {
    const browser = createBrowserPlatform((path, replace) => {
      if (replace) router.replace(path); else router.push(path);
    });
    return bridge ? createTelegramPlatform({ bridge, navigate: browser.navigate, saveFile: async (blob, filename) => {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else await browser.saveFile(blob, filename);
    } }) : browser;
  }, [router, bridge]);
  return <><Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => {
    const telegram = (window as Window & { Telegram?: { WebApp?: TelegramBridge } }).Telegram?.WebApp;
    if (telegram?.initData) { telegram.ready(); telegram.expand(); setBridge(telegram); }
  }} /><OwnerPlatformProvider value={platform}>{children}</OwnerPlatformProvider></>;
}
