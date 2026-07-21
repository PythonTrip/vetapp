import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const f of ["duration", "type", "reason", "status", "notes"]) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.date) data.date = new Date(body.date);
    if (data.duration) data.duration = Number(data.duration);

    const appt = await db.appointment.update({
      where: { id },
      data,
      include: { pet: true },
    });
    return NextResponse.json(appt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.appointment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
