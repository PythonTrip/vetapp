import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { AuthProvider } from "@/components/auth-provider";
import { InstanceLockScreen } from "@/components/instance-lock-screen";
import { AppShell } from "@/components/app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VetDietDerm — рабочее место ветеринарного нутрициолога",
  description:
    "Рабочее место ветеринарного нутрициолога: пациенты, рацион и оценка по FEDIAF 2025.",
  keywords: ["ветеринария", "нутрициология", "FEDIAF", "пациенты", "рацион"],
  authors: [{ name: "VetDietDerm" }],
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              <InstanceLockScreen>
                <AppShell>{children}</AppShell>
              </InstanceLockScreen>
              <Toaster />
              <SonnerToaster richColors position="bottom-right" />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
