import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/share-tokens/[id] — update label or revoke
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.label !== undefined) data.label = body.label;
    if (body.revoked !== undefined) data.revoked = !!body.revoked;
    if (body.expiresAt) data.expiresAt = new Date(body.expiresAt);
    const token = await db.shareToken.update({ where: { id }, data });
    return NextResponse.json(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/share-tokens/[id] — idempotent
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.shareToken.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
