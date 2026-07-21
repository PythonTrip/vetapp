import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, parseDate, parseJson } from "@/lib/api-server";
import { z } from "zod";

const appointmentUpdateSchema = z.object({
  date: z.string().min(1).optional(),
  duration: z.coerce.number().int().positive().max(24 * 60).optional(),
  type: z.string().min(1).max(100).optional(),
  reason: z.string().max(2_000).optional(),
  status: z.string().min(1).max(100).optional(),
  notes: z.string().max(20_000).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await parseJson(req, appointmentUpdateSchema);
    const data: Record<string, unknown> = {};
    for (const f of ["duration", "type", "reason", "status", "notes"]) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.date) data.date = parseDate(body.date);

    const appt = await db.appointment.update({
      where: { id },
      data,
      include: { pet: true },
    });
    return NextResponse.json(appt);
  } catch (error) {
    return handleApiError(error, "update appointment");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.appointment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
