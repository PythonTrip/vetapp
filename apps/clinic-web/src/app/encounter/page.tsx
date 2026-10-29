import { Suspense } from "react";
import { EncounterWorkspace } from "@/components/clinical/encounter-workspace";
import { Skeleton } from "@/components/ui/skeleton";

function EncounterFallback() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-[640px] w-full" />
    </div>
  );
}

export default async function EncounterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const appointmentId = typeof params.appointmentId === "string" ? params.appointmentId : undefined;
  const patientId = typeof params.patientId === "string" ? params.patientId : undefined;
  const encounterId = typeof params.encounterId === "string" ? params.encounterId : undefined;

  return (
    <Suspense fallback={<EncounterFallback />}>
      <EncounterWorkspace
        initialAppointmentId={appointmentId}
        initialPatientId={patientId}
        initialEncounterId={encounterId}
      />
    </Suspense>
  );
}
