import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-server";

// GET /api/pets/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pet = await db.pet.findUnique({
    where: { id },
    include: {
      consultations: { orderBy: { date: "asc" } },
      photos: { orderBy: { date: "asc" } },
      dietPlans: { orderBy: { createdAt: "desc" } },
      appointments: { orderBy: { date: "asc" } },
    },
  });
  if (!pet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(pet);
}

// PATCH /api/pets/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    const fields = [
      "name", "species", "breed", "sex", "neutered", "ownerName", "ownerContact",
      "ownerEmail", "ownerPhone",
      "currentWeight", "targetWeight", "bcs", "lifeStage", "activityLevel", "notes",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    // Keep the combined ownerContact in sync whenever email/phone are edited
    if (body.ownerEmail !== undefined || body.ownerPhone !== undefined) {
      data.ownerContact = [body.ownerEmail, body.ownerPhone].filter(Boolean).join(" · ");
    }
    if (body.birthDate) data.birthDate = new Date(body.birthDate);
    if (body.allergies !== undefined) data.allergies = JSON.stringify(body.allergies ?? []);
    if (body.chronicConditions !== undefined) data.chronicConditions = JSON.stringify(body.chronicConditions ?? []);
    if (body.feeding !== undefined) data.feeding = body.feeding ? JSON.stringify(body.feeding) : null;
    // normalize numerics
    if (data.currentWeight) data.currentWeight = Number(data.currentWeight);
    if (data.targetWeight) data.targetWeight = Number(data.targetWeight);
    if (data.bcs) data.bcs = Number(data.bcs);

    const pet = await db.pet.update({
      where: { id },
      data,
      include: { consultations: true, photos: true, dietPlans: true, appointments: true },
    });
    return NextResponse.json(pet);
  } catch (error) {
    return handleApiError(error, "update pet");
  }
}

// DELETE /api/pets/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.pet.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    // Already deleted — treat as success (idempotent)
    return NextResponse.json({ ok: true });
  }
}
