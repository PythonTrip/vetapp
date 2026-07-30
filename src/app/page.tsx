import { AppShell } from "@/components/app-shell";
import { DashboardModule } from "@/components/modules/dashboard";

export default function Home() {
  return (
    <AppShell>
      <DashboardModule />
    </AppShell>
  );
}
