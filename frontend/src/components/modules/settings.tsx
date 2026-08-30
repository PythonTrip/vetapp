"use client";

import { Check, MonitorCog, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SettingsModule() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Settings className="h-3.5 w-3.5" />
          Настройки приложения
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Настройки</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Оформление интерфейса. Предпочтение сохраняется на этом устройстве.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorCog className="h-4 w-4 text-primary" />
            Оформление
          </CardTitle>
          <CardDescription>Выберите светлую или тёмную цветовую схему.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setTheme("light")}
            className={cn("h-auto justify-start gap-3 p-4", theme === "light" && "border-primary bg-primary/5")}
          >
            <Sun className="h-5 w-5" />
            <span className="font-semibold">Светлая</span>
            {theme === "light" && <Check className="ml-auto h-4 w-4 text-primary" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setTheme("dark")}
            className={cn("h-auto justify-start gap-3 p-4", theme === "dark" && "border-primary bg-primary/5")}
          >
            <Moon className="h-5 w-5" />
            <span className="font-semibold">Тёмная</span>
            {theme === "dark" && <Check className="ml-auto h-4 w-4 text-primary" />}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
