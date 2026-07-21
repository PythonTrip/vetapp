import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/pets/[id]/consultations - add a consultation entry
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const consultation = await db.consultation.create({
      data: {
        petId: id,
        date: body.date ? new Date(body.date) : new Date(),
        type: body.type ?? "note",
        chiefComplaint: body.chiefComplaint ?? null,
        notes: body.notes ?? "",
        transcript: body.transcript ?? null,
        vasScore: body.vasScore ?? null,
        weight: body.weight ?? null,
        status: body.status ?? "completed",
        specialty: body.specialty ?? null,
        anamnesis: body.anamnesis ?? null,
        anamnesisData: body.anamnesisData ? JSON.stringify(body.anamnesisData) : null,
        physicalExam: body.physicalExam ?? null,
        diagnoses: JSON.stringify(body.diagnoses ?? []),
        prescriptions: JSON.stringify(body.prescriptions ?? []),
        followUpPlan: body.followUpPlan ?? null,
        followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
        templateKey: body.templateKey ?? null,
        templateName: body.templateName ?? null,
        templateVersion: body.templateVersion != null ? Number(body.templateVersion) : null,
        completedAt: body.status === "completed" ? new Date() : null,
      },
    });
    // If weight provided, also update the pet's currentWeight
    if (body.weight) {
      await db.pet.update({ where: { id }, data: { currentWeight: Number(body.weight) } });
    }
    return NextResponse.json(consultation, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
// force recompile
