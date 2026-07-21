import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/custom-handouts/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    const fields = ["title", "description", "prompt", "category", "icon"];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    const handout = await db.customHandout.update({ where: { id }, data });
    return NextResponse.json(handout);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/custom-handouts/[id] — idempotent
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.customHandout.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
