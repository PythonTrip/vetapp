import { PatientsWorkspace } from "@/components/modules/patients";

export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <PatientsWorkspace initialPatientId={id} initialTab={typeof tab === "string" ? tab : undefined} />;
}
