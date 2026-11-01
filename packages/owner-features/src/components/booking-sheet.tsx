"use client";

import * as React from "react";
import { CabinetIcon } from "./cabinet-visuals";

/** Native modal provides focus containment, background inertness and Escape support. */
export function BookingSheet({ children, onClose, busy = false }: { children: React.ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="booking-sheet" aria-label="Запись к ветеринару" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="booking-sheet-content" data-owner-cabinet>
      <div className="sheet-handle" aria-hidden="true" />
      <button type="button" className="sheet-close" aria-label="Закрыть запись" disabled={busy} onClick={onClose}><CabinetIcon name="close" /></button>
      {children}
    </div>
  </dialog>;
}
