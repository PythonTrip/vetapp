"use client";

import { Check, Languages, MonitorCog, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n, type Locale } from "@/lib/i18n";

export function SettingsModule() {
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Settings className="h-3.5 w-3.5" />
          {t("settings.eyebrow")}
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("settings.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("settings.description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Languages className="h-4 w-4 text-primary" />
            {t("settings.languageTitle")}
          </CardTitle>
          <CardDescription>{t("settings.languageDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <LanguageCard
            code="ru"
            title="Русский"
            active={locale === "ru"}
            currentLabel={t("settings.current")}
            onClick={() => setLocale("ru")}
          />
          <LanguageCard
            code="en"
            title="English"
            active={locale === "en"}
            currentLabel={t("settings.current")}
            onClick={() => setLocale("en")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorCog className="h-4 w-4 text-primary" />
            {t("settings.appearanceTitle")}
          </CardTitle>
          <CardDescription>{t("settings.appearanceDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setTheme("light")}
            className={cn("h-auto justify-start gap-3 p-4", theme === "light" && "border-primary bg-primary/5")}
          >
            <Sun className="h-5 w-5" />
            <span className="font-semibold">{t("theme.light")}</span>
            {theme === "light" && <Check className="ml-auto h-4 w-4 text-primary" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setTheme("dark")}
            className={cn("h-auto justify-start gap-3 p-4", theme === "dark" && "border-primary bg-primary/5")}
          >
            <Moon className="h-5 w-5" />
            <span className="font-semibold">{t("theme.dark")}</span>
            {theme === "dark" && <Check className="ml-auto h-4 w-4 text-primary" />}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function LanguageCard({
  code,
  title,
  active,
  currentLabel,
  onClick,
}: {
  code: Locale;
  title: string;
  active: boolean;
  currentLabel: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={cn("h-auto justify-start gap-3 p-4", active && "border-primary bg-primary/5")}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-xs font-bold uppercase">
        {code}
      </span>
      <span className="flex flex-col items-start">
        <span className="font-semibold">{title}</span>
        {active && <span className="text-[11px] text-primary">{currentLabel}</span>}
      </span>
      {active && <Check className="ml-auto h-4 w-4 text-primary" />}
    </Button>
  );
}
