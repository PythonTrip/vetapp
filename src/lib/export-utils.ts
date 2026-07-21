// CSV export utilities for VetDietDerm
import type { PetWithRelations } from "@/lib/types";

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPatientsCSV(pets: PetWithRelations[]) {
  const headers = [
    "Name", "Species", "Breed", "Birth Date", "Age", "Sex", "Neutered",
    "Owner", "Contact", "Current Weight (kg)", "Target Weight (kg)", "BCS (1-9)",
    "Life Stage", "Activity Level", "Notes", "Consultations Count",
    "Photos Count", "Diet Plans Count", "Last Visit Date", "Last VAS",
  ];

  const rows = pets.map((p) => {
    const lastConsult = p.consultations.at(-1);
    const ageMs = Date.now() - new Date(p.birthDate).getTime();
    const ageYears = (ageMs / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1);
    return [
      p.name, p.species, p.breed, new Date(p.birthDate).toLocaleDateString(),
      `${ageYears} yr`, p.sex, p.neutered ? "Yes" : "No",
      p.ownerName, p.ownerContact, p.currentWeight, p.targetWeight ?? "", p.bcs,
      p.lifeStage, p.activityLevel, p.notes ?? "",
      p.consultations.length, p.photos.length, p.dietPlans.length,
      lastConsult ? new Date(lastConsult.date).toLocaleDateString() : "",
      lastConsult?.vasScore ?? "",
    ].map(escapeCsv).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  downloadCsv(`vetdietderm-patients-${new Date().toISOString().split("T")[0]}.csv`, csv);
}

export function exportConsultationsCSV(pets: PetWithRelations[]) {
  const headers = [
    "Pet Name", "Species", "Breed", "Date", "Type", "Chief Complaint",
    "VAS (1-10)", "Weight (kg)", "Notes Excerpt",
  ];

  const rows = pets.flatMap((p) =>
    p.consultations.map((c) => [
      p.name, p.species, p.breed,
      new Date(c.date).toLocaleDateString(),
      c.type, c.chiefComplaint ?? "",
      c.vasScore ?? "", c.weight ?? "",
      c.notes.slice(0, 200).replace(/\n/g, " "),
    ].map(escapeCsv).join(","))
  );

  const csv = [headers.join(","), ...rows].join("\n");
  downloadCsv(`vetdietderm-consultations-${new Date().toISOString().split("T")[0]}.csv`, csv);
}
