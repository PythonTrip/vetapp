import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, parseDate, parseJson } from "@/lib/api-server";
import { z } from "zod";

const shareTokenUpdateSchema = z.object({
  label: z.string().trim().max(300).nullable().optional(),
  revoked: z.boolean().optional(),
  expiresAt: z.string().min(1).optional(),
});

// PATCH /api/share-tokens/[id] — update label or revoke
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await parseJson(req, shareTokenUpdateSchema);
    const data: Record<string, unknown> = {};
    if (body.label !== undefined) data.label = body.label;
    if (body.revoked !== undefined) data.revoked = !!body.revoked;
    if (body.expiresAt) data.expiresAt = parseDate(body.expiresAt, "expiresAt");
    const token = await db.shareToken.update({ where: { id }, data });
    return NextResponse.json(token);
  } catch (error) {
    return handleApiError(error, "update share token");
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
