import type { OwnerPlatform } from "../platform";
import { ownerRequest, type OwnerProfile } from "../api";

/** Host capabilities only. Telegram identity never grants an owner session. */
export interface TelegramBridge {
  ready: () => void;
  expand: () => void;
  initData?: string;
}

export function createTelegramPlatform(options: {
  bridge: TelegramBridge;
  navigate: OwnerPlatform["navigate"];
  /** Save an already authenticated download; never expose a session in a URL. */
  saveFile: OwnerPlatform["saveFile"];
}): OwnerPlatform & { initialize: () => void } {
  const loginFlights = new Map<string, Promise<OwnerProfile>>();
  return {
    kind: "telegram",
    navigate: options.navigate,
    saveFile: options.saveFile,
    telegramAuth: options.bridge.initData ? {
      login: (code) => {
        const pending = loginFlights.get(code);
        if (pending) return pending;
        const flight = ownerRequest<OwnerProfile>("/telegram/login", "POST", { code, init_data: options.bridge.initData })
          .finally(() => { loginFlights.delete(code); });
        loginFlights.set(code, flight);
        return flight;
      },
      link: (code, email, password) => ownerRequest<OwnerProfile>("/telegram/link", "POST", { code, init_data: options.bridge.initData, email, password }),
    } : undefined,
    initialize() { options.bridge.ready(); options.bridge.expand(); },
  };
}
