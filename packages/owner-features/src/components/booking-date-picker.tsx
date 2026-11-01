"use client";

import * as React from "react";
import { Input } from "@vetdietderm/ui/input";

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** These are date preferences, never a claim about the doctor's availability. */
export function BookingDatePicker({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [days] = React.useState(() => Array.from({ length: 6 }, (_, index) => {
    const day = new Date(); day.setDate(day.getDate() + index + 1); return day;
  }));
  const date = value.split("T")[0];
  return <div className="space-y-4">
    <fieldset className="booking-days"><legend className="booking-label">Предпочтительная дата</legend><div>{days.map(day => <button type="button" key={localDate(day)} aria-pressed={date === localDate(day)} aria-label={day.toLocaleDateString("ru", { day: "numeric", month: "long" })} onClick={() => onChange(`${localDate(day)}T${value.split("T")[1] || "09:00"}`)}><small>{day.toLocaleDateString("ru", { weekday: "short" })}</small><strong>{day.getDate()}</strong><small>{day.toLocaleDateString("ru", { month: "short" })}</small></button>)}</div></fieldset>
    <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium">Предлагаемые дата и время</label><Input id={id} type="datetime-local" required className="min-w-0 max-w-full" value={value} onChange={event => onChange(event.target.value)} /></div>
    <p className="text-sm text-muted-foreground">Выберите время или другую дату в поле выше. Часовой пояс — вашего устройства. Время предварительное: врач подтвердит его после рассмотрения заявки.</p>
  </div>;
}
