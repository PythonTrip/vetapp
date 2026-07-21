import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const f of [
      "type", "chiefComplaint", "notes", "transcript", "vasScore", "weight", "status",
      "specialty", "anamnesis", "physicalExam", "followUpPlan", "templateKey", "templateName",
    ]) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.anamnesisData !== undefined) data.anamnesisData = body.anamnesisData ? JSON.stringify(body.anamnesisData) : null;
    if (body.diagnoses !== undefined) data.diagnoses = JSON.stringify(body.diagnoses ?? []);
    if (body.prescriptions !== undefined) data.prescriptions = JSON.stringify(body.prescriptions ?? []);
    if (body.templateVersion !== undefined) data.templateVersion = body.templateVersion == null ? null : Number(body.templateVersion);
    if (body.followUpDate !== undefined) data.followUpDate = body.followUpDate ? new Date(body.followUpDate) : null;
    if (body.status === "completed") data.completedAt = new Date();
    if (body.status && body.status !== "completed") data.completedAt = null;
    if (body.date) data.date = new Date(body.date);
    const c = await db.consultation.update({ where: { id }, data });
    return NextResponse.json(c);
  } catch (error) {
    return handleApiError(error, "update consultation");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.consultation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
