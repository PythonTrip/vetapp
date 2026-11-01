"use client";
import * as React from "react";

export function ConnectionStatus() {
  const [offline, setOffline] = React.useState(false);
  React.useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return offline ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Нет подключения. Данные могут быть устаревшими. После восстановления связи обновите раздел; неотправленные изменения ещё не сохранены.</p> : null;
}
