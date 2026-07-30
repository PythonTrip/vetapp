import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { I18nProvider } from "@/lib/i18n";
import { LegacyTranslationBoundary } from "@/components/legacy-translation-boundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VetDietDerm — менеджер ветеринарных пациентов и приёмов",
  description:
    "Рабочее пространство ветеринарного врача: карточки пациентов, структурированные приёмы, расписание, питание и клиническая история.",
  keywords: ["ветеринария", "пациенты", "приёмы", "диетология", "дерматология", "CRM"],
  authors: [{ name: "VetDietDerm" }],
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>
            <LegacyTranslationBoundary>
              <QueryProvider>
                {children}
                <Toaster />
                <SonnerToaster richColors position="bottom-right" />
              </QueryProvider>
            </LegacyTranslationBoundary>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
