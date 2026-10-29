import type { DoctorPreview } from "@/lib/owner-api";

export function DoctorBlock({ doctor }: { doctor: DoctorPreview }) {
  return <section className="space-y-2 border-b pb-6" aria-label="Ваш врач">
    <h2 className="text-sm text-muted-foreground">Ваш врач</h2>
    <p className="break-words text-xl font-semibold">{doctor.doctor_name}</p>
    {doctor.organization_name && <p className="break-words text-sm text-muted-foreground">{doctor.organization_name}</p>}
  </section>;
}
