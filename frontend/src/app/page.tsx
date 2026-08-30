import Link from "next/link";
import { Calculator, CalendarDays, PawPrint, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";

export default function Home() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <PawPrint className="h-3.5 w-3.5" />
            VetDietDerm
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Рабочее место специалиста
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Пациенты, расписание, приёмы и диетология на одном стеке. Расчёты носят информационный
            характер и не заменяют клиническое решение.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/patients"
            className="rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
          >
            <Users className="mb-3 h-5 w-5 text-primary" />
            <h2 className="font-semibold">Пациенты</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Карточки, приёмы, галерея и коммуникации.
            </p>
          </Link>
          <Link
            href="/schedule"
            className="rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
          >
            <CalendarDays className="mb-3 h-5 w-5 text-primary" />
            <h2 className="font-semibold">Расписание</h2>
            <p className="mt-1 text-sm text-muted-foreground">Записи на день и статусы визита.</p>
          </Link>
          <Link
            href="/nutrition"
            className="rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
          >
            <Calculator className="mb-3 h-5 w-5 text-primary" />
            <h2 className="font-semibold">Питание</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Рацион, каталог кормов и оценка по FEDIAF 2025.
            </p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
