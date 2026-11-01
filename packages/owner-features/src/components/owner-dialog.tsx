"use client";
import * as React from "react";
import { CabinetIcon } from "./cabinet-visuals";

export function OwnerDialog({ children, onClose, title, busy = false }: { children: React.ReactNode; onClose: () => void; title: string; busy?: boolean }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const dialog = ref.current; const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal(); return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="owner-dialog" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><div data-owner-cabinet><button className="owner-icon-button owner-dialog-close" aria-label="Закрыть" disabled={busy} onClick={onClose}><CabinetIcon name="close" /></button>{children}</div></dialog>;
}
