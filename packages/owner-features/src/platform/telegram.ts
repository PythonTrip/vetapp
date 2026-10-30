import type { OwnerPlatform } from "../platform";

/** Host capabilities only. Telegram identity never grants an owner session. */
export interface TelegramBridge {
  ready: () => void;
  expand: () => void;
}

export function createTelegramPlatform(options: {
  bridge: TelegramBridge;
  navigate: OwnerPlatform["navigate"];
  /** Save an already authenticated download; never expose a session in a URL. */
  saveFile: OwnerPlatform["saveFile"];
}): OwnerPlatform & { initialize: () => void } {
  return {
    kind: "telegram",
    navigate: options.navigate,
    saveFile: options.saveFile,
    initialize() { options.bridge.ready(); options.bridge.expand(); },
  };
}
