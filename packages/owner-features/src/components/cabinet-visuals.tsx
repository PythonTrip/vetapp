import type { CSSProperties } from "react";

export type CabinetIconName = "home" | "paw" | "chat" | "profile" | "calendar" | "file" | "arrow" | "close" | "back" | "check" | "doctor" | "attach" | "send" | "moon" | "sun" | "plus" | "edit";
const paths: Record<CabinetIconName, React.ReactNode> = {
  attach: <path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2a2 2 0 0 1 3 3L6 15" />,
  send: <><path d="m3 3 18 9-18 9 4-9Zm4 9h14" /></>,
  moon: <path d="M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
  plus: <path d="M12 4v16M4 12h16" />,
  edit: <><path d="m15 3 6 6L9 21H3v-6Zm-2 2 6 6" /></>,
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
  paw: <><ellipse cx="8" cy="6" rx="2" ry="2.5" /><ellipse cx="16" cy="6" rx="2" ry="2.5" /><ellipse cx="4" cy="11" rx="1.5" ry="2" /><ellipse cx="20" cy="11" rx="1.5" ry="2" /><path d="M6 18c0-3 4-6 6-6s6 3 6 6c0 4-4 2-6 2s-6 2-6-2Z" /></>,
  chat: <path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-1l-6 2 2-6a9 9 0 1 1 17-4Z" />,
  profile: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-3a8 8 0 0 1 16 0v3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6m10-6v6M3 11h18" /></>,
  file: <><path d="M14 2H5v20h14V7Zm0 0v6h5M8 12h8m-8 4h8" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  back: <path d="m15 5-7 7 7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
  doctor: <><path d="M5 3v5a5 5 0 0 0 10 0V3M3 3h4m6 0h4m-7 10v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="11" r="2" /></>,
};
export function CabinetIcon({ name, size = 22 }: { name: CabinetIconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function PetAvatar({ name, small = false, photoUrl }: { name: string; small?: boolean; photoUrl?: string | null }) {
  return <span className={`pet-avatar${small ? " pet-avatar-small" : ""}`} aria-hidden="true">{photoUrl ? <img src={photoUrl} alt="" /> : <><CabinetIcon name="paw" size={small ? 20 : 28} /><b>{name.trim().slice(0, 1).toLocaleUpperCase("ru")}</b></>}</span>;
}

export function PetPattern() {
  const style = { "--pattern-ink": "var(--accent)" } as CSSProperties;
  return <div className="pet-pattern" style={style} aria-hidden="true"><svg viewBox="0 0 364 112" preserveAspectRatio="none">
    <path d="M-18 22C20 1 15 51 51 38S73-4 115 7s-13 55 19 59 28-59 70-47-5 54 20 75 64-3 94-20 61-18 66 6" fill="none" stroke="var(--pattern-ink)" strokeWidth="25" strokeLinecap="round" opacity=".82" />
    <path d="M-11 85C32 43 72 122 109 84S158 36 199 62 275 142 302 86 352 9 380 26" fill="none" stroke="var(--primary-foreground)" strokeWidth="14" strokeLinecap="round" opacity=".46" />
    <path d="M37-10q-4 34 22 32M167-10q-20 35-5 53M335 127q-25-34-5-54" fill="none" stroke="var(--pattern-ink)" strokeWidth="12" strokeLinecap="round" opacity=".58" />
    <circle cx="279" cy="33" r="9" fill="var(--primary-foreground)" opacity=".5" />
  </svg></div>;
}
