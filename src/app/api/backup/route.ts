import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/backup — full JSON backup of all data
// Returns: { meta: {...}, pets: [...], customTemplates: [...], customHandouts: [...], communications: [...] }
export async function GET() {
  const [pets, customTemplates, customHandouts, communications, shareTokens] = await Promise.all([
    db.pet.findMany({
      include: {
        consultations: { orderBy: { date: "asc" } },
        photos: { orderBy: { date: "asc" } },
        dietPlans: { orderBy: { createdAt: "desc" } },
        appointments: { orderBy: { date: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.customTemplate.findMany({ orderBy: { updatedAt: "desc" } }),
    db.customHandout.findMany({ orderBy: { updatedAt: "desc" } }),
    db.communicationLog.findMany({ orderBy: { date: "desc" } }),
    db.shareToken.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const backup = {
    meta: {
      version: "1.2",
      exportedAt: new Date().toISOString(),
      app: "VetDietDerm",
      counts: {
        pets: pets.length,
        consultations: pets.reduce((acc, p) => acc + p.consultations.length, 0),
        photos: pets.reduce((acc, p) => acc + p.photos.length, 0),
        dietPlans: pets.reduce((acc, p) => acc + p.dietPlans.length, 0),
        appointments: pets.reduce((acc, p) => acc + p.appointments.length, 0),
        customTemplates: customTemplates.length,
        customHandouts: customHandouts.length,
        communications: communications.length,
        shareTokens: shareTokens.length,
      },
    },
    pets,
    customTemplates,
    customHandouts,
    communications,
    // Note: share tokens are excluded from backup for security — they're transient
  };

  return NextResponse.json(backup, {
    headers: {
      "Content-Disposition": `attachment; filename="vetdietderm-backup-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
