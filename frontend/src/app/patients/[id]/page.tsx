import { AppShell } from "@/components/app-shell";
import { PatientDetail } from "@/components/modules/patient-detail";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <PatientDetail patientId={id} />
    </AppShell>
  );
}
