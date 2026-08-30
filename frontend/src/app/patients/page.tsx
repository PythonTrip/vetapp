import { AppShell } from "@/components/app-shell";
import { PatientsModule } from "@/components/modules/patients";

export default function PatientsPage() {
  return (
    <AppShell>
      <PatientsModule />
    </AppShell>
  );
}
