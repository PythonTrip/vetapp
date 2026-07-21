import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-server";

// PATCH /api/communications/[id] — update entry (e.g., toggle follow-up)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    const fields = ["channel", "direction", "duration", "subject", "notes", "followUp"];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.date) data.date = new Date(body.date);
    if (data.duration !== undefined) data.duration = data.duration == null ? null : Number(data.duration);
    if (data.followUp !== undefined) data.followUp = !!data.followUp;

    const log = await db.communicationLog.update({ where: { id }, data });
    return NextResponse.json(log);
  } catch (error) {
    return handleApiError(error, "update communication log");
  }
}

// DELETE /api/communications/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.communicationLog.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
