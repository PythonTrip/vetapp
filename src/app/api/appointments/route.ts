import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
    const body = await req.json();
    const appt = await db.appointment.create({
      data: {
        petId: body.petId,
        date: new Date(body.date),
        duration: Number(body.duration) || 30,
        type: body.type ?? "consultation",
        reason: body.reason ?? "",
        status: body.status ?? "scheduled",
        notes: body.notes ?? null,
      },
      include: { pet: true },
    });
    return NextResponse.json(appt, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
