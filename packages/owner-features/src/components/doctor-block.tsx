import type { DoctorPreview } from "../api";

export function DoctorBlock({ doctor }: { doctor: DoctorPreview }) {
  const clinic = doctor.organization_name?.trim();
  return <section className="space-y-2 border-b pb-6" aria-label="Ваша клиника">
    <h2 className="text-sm text-muted-foreground">Ваша клиника</h2>
    <p className="break-words text-xl font-semibold">{clinic || "Название клиники не указано"}</p>
  </section>;
}
