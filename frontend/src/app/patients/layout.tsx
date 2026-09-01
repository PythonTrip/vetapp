import { AppShell } from "@/components/app-shell";

export default function PatientsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
