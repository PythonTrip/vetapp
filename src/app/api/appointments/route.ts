import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, parseDate, parseJson } from "@/lib/api-server";
import { z } from "zod";

const appointmentSchema = z.object({
  petId: z.string().min(1),
  date: z.string().min(1),
  duration: z.coerce.number().int().positive().max(24 * 60).default(30),
  type: z.string().min(1).max(100).default("consultation"),
  reason: z.string().max(2_000).default(""),
  status: z.string().min(1).max(100).default("scheduled"),
  notes: z.string().max(20_000).nullish(),
});

// GET /api/appointments - list all appointments (with pet info)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const where: { date?: { gte?: Date; lte?: Date } } = {};
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }

  const appointments = await db.appointment.findMany({
    where,
    include: { pet: true },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(appointments);
}

// POST /api/appointments - create a new appointment
export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, appointmentSchema);
    const appt = await db.appointment.create({
      data: {
        petId: body.petId,
        date: parseDate(body.date),
        duration: body.duration,
        type: body.type,
        reason: body.reason,
        status: body.status,
        notes: body.notes ?? null,
      },
      include: { pet: true },
    });
    return NextResponse.json(appt, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create appointment");
  }
}
