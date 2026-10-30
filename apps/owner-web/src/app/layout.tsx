import type { Metadata } from "next";
import "./globals.css";
import { PlatformProvider } from "./platform-provider";
export const metadata: Metadata = {
  title: "VetDietDerm — кабинет владельца",
  description: "Животные, переписка с врачом и заявки на визит",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ru"><body className="bg-background text-foreground antialiased">
    <PlatformProvider><main className="min-h-dvh px-4 py-8 sm:py-12"><div className="mx-auto w-full max-w-lg space-y-8">{children}</div></main></PlatformProvider>
  </body></html>;
}
