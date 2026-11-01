import * as React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatViewport } from "@vetdietderm/owner-features/components/use-chat-viewport";

function Surface({ active = true }: { active?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useChatViewport(ref, active, "telegram");
  return <div ref={ref} data-testid="surface" />;
}
afterEach(() => { vi.unstubAllGlobals(); document.body.style.overflow = ""; });

describe("messages viewport", () => {
  it("follows visual keyboard height and pan, restoring document scrolling on exit", () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 844);
    document.body.style.overflow = "auto";
    const { rerender } = render(<Surface />);
    const surface = screen.getByTestId("surface");
    expect(surface.style.getPropertyValue("--owner-chat-height")).toBe("844px");
    expect(document.body.style.overflow).toBe("hidden");
    act(() => { viewport.height = 420; viewport.offsetTop = 24; viewport.dispatchEvent(new Event("resize")); });
    expect(surface.style.getPropertyValue("--owner-chat-height")).toBe("420px");
    expect(surface.style.getPropertyValue("--owner-chat-top")).toBe("24px");
    expect(surface.dataset.keyboardOpen).toBe("true");
    rerender(<Surface active={false} />);
    expect(document.body.style.overflow).toBe("auto");
    expect(surface.style.getPropertyValue("--owner-chat-height")).toBe("");
    act(() => { viewport.height = 300; viewport.dispatchEvent(new Event("resize")); });
    expect(surface.style.getPropertyValue("--owner-chat-height")).toBe("");
  });

  it("handles Telegram's settled viewport even when the browser viewport remains full height", () => {
    vi.stubGlobal("innerHeight", 844);
    let listener: ((event?: { isStateStable?: boolean }) => void) | undefined;
    const bridge = { viewportStableHeight: 844, viewportHeight: 844, onEvent: vi.fn((_event, handler) => { listener = handler; }), offEvent: vi.fn() };
    vi.stubGlobal("Telegram", { WebApp: bridge });
    const { unmount } = render(<Surface />);
    const surface = screen.getByTestId("surface");
    act(() => { bridge.viewportStableHeight = 390; bridge.viewportHeight = 390; listener?.({ isStateStable: true }); });
    expect(surface.style.getPropertyValue("--owner-chat-height")).toBe("390px");
    expect(surface.dataset.keyboardOpen).toBe("true");
    act(() => { bridge.viewportStableHeight = 844; listener?.({ isStateStable: true }); });
    expect(surface.style.getPropertyValue("--owner-chat-height")).toBe("844px");
    expect(surface.dataset.keyboardOpen).toBe("false");
    unmount();
    expect(bridge.offEvent).toHaveBeenCalledWith("viewportChanged", listener);
  });
});
