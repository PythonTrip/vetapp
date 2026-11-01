"use client";

import * as React from "react";

type ViewportEvent = { isStateStable?: boolean };
type TelegramViewport = {
  viewportHeight?: number;
  viewportStableHeight?: number;
  onEvent?: (event: "viewportChanged", callback: (event?: ViewportEvent) => void) => void;
  offEvent?: (event: "viewportChanged", callback: (event?: ViewportEvent) => void) => void;
};

/** Only the messages surface follows the keyboard's visible viewport. */
export function useChatViewport(ref: React.RefObject<HTMLDivElement | null>, active: boolean, host: string) {
  React.useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const viewport = window.visualViewport;
    const telegram = (window as Window & { Telegram?: { WebApp?: TelegramViewport } }).Telegram?.WebApp;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const positive = (value?: number) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
    let hostHeight = positive(telegram?.viewportStableHeight) ?? positive(telegram?.viewportHeight);
    let fullHeight = Math.max(window.innerHeight, hostHeight ?? 0);
    const update = () => {
      const height = Math.min(positive(viewport?.height) ?? window.innerHeight, hostHeight ?? Infinity, window.innerHeight);
      fullHeight = Math.max(fullHeight, height);
      root.style.setProperty("--owner-chat-height", `${height}px`);
      root.style.setProperty("--owner-chat-top", `${Math.max(0, viewport?.offsetTop ?? 0)}px`);
      root.dataset.keyboardOpen = String(fullHeight - height > 120);
      root.dataset.compactViewport = String(height < 480);
    };
    const hostResize = (event?: ViewportEvent) => {
      // VisualViewport follows keyboard animation; Telegram supplies its settled size.
      if (event?.isStateStable === false) return;
      hostHeight = positive(telegram?.viewportStableHeight) ?? positive(telegram?.viewportHeight);
      update();
    };
    const rotate = () => { fullHeight = window.innerHeight; hostResize(); };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", rotate);
    telegram?.onEvent?.("viewportChanged", hostResize);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", rotate);
      telegram?.offEvent?.("viewportChanged", hostResize);
      document.body.style.overflow = previousOverflow;
      root.style.removeProperty("--owner-chat-height");
      root.style.removeProperty("--owner-chat-top");
      delete root.dataset.keyboardOpen;
      delete root.dataset.compactViewport;
    };
  }, [active, host, ref]);
}
