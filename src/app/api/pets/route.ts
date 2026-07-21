import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/pets - list all pets
export async function GET() {
  const pets = await db.pet.findMany({
    include: {
      consultations: { orderBy: { date: "asc" } },
      photos: { orderBy: { date: "asc" } },
      dietPlans: { orderBy: { createdAt: "desc" } },
      appointments: { orderBy: { date: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(pets);
}

// POST /api/pets - create a new pet
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pet = await db.pet.create({
      data: {
        name: body.name,
        species: body.species ?? "dog",
        breed: body.breed ?? "",
        birthDate: new Date(body.birthDate),
        sex: body.sex ?? "male",
        neutered: body.neutered ?? false,
        ownerName: body.ownerName ?? "",
        ownerEmail: body.ownerEmail ?? null,
        ownerPhone: body.ownerPhone ?? null,
        ownerContact:
          [body.ownerEmail, body.ownerPhone].filter(Boolean).join(" · ") ||
          (body.ownerContact ?? ""),
        currentWeight: Number(body.currentWeight) || 0,
        targetWeight: body.targetWeight ? Number(body.targetWeight) : null,
        bcs: Number(body.bcs) || 5,
        lifeStage: body.lifeStage ?? "adult",
        activityLevel: body.activityLevel ?? "moderate",
        allergies: JSON.stringify(body.allergies ?? []),
        chronicConditions: JSON.stringify(body.chronicConditions ?? []),
        feeding: body.feeding ? JSON.stringify(body.feeding) : null,
        notes: body.notes ?? null,
      },
      include: { consultations: true, photos: true, dietPlans: true, appointments: true },
    });
    return NextResponse.json(pet, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
