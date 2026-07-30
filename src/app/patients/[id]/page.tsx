import { AppShell } from "@/components/app-shell";
import { PatientsModule } from "@/components/modules/patients";

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell>
      <PatientsModule patientId={id} />
    </AppShell>
  );
}
