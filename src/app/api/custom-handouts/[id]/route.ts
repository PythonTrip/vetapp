import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, parseJson } from "@/lib/api-server";
import { z } from "zod";

const handoutUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(2_000).nullable().optional(),
  prompt: z.string().max(20_000).optional(),
  category: z.string().min(1).max(100).optional(),
  icon: z.string().min(1).max(100).optional(),
});

// PATCH /api/custom-handouts/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await parseJson(req, handoutUpdateSchema);
    const handout = await db.customHandout.update({ where: { id }, data });
    return NextResponse.json(handout);
  } catch (error) {
    return handleApiError(error, "update custom handout");
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
