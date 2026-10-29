import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Страница не найдена</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Этот раздел прототипа больше не входит в рабочее место.
      </p>
      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        На главную
      </Link>
    </div>
  );
}
