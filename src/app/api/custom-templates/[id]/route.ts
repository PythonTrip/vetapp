import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/custom-templates/[id] — update a custom template
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const current = await db.customTemplate.findUniqueOrThrow({ where: { id } });
    const data: Record<string, unknown> = {};
    const fields = ["name", "category", "description", "icon", "type", "chiefComplaint", "notes", "duration"];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.suggestedVas !== undefined) {
      data.suggestedVas = body.suggestedVas == null ? null : Number(body.suggestedVas);
    }
    if (body.sections !== undefined) {
      data.sections = body.sections == null
        ? null
        : typeof body.sections === "string" ? body.sections : JSON.stringify(body.sections);
    }
    const templateKey = current.templateKey ?? current.id;
    const template = await db.$transaction(async (tx) => {
      await tx.customTemplate.updateMany({
        where: { OR: [{ templateKey }, { id: current.id }], isLatest: true },
        data: { isLatest: false },
      });
      return tx.customTemplate.create({
        data: {
          name: current.name,
          category: current.category,
          description: current.description,
          icon: current.icon,
          type: current.type,
          chiefComplaint: current.chiefComplaint,
          notes: current.notes,
          suggestedVas: current.suggestedVas,
          duration: current.duration,
          sections: current.sections,
          ...data,
          templateKey,
          version: current.version + 1,
          isLatest: true,
        },
      });
    });
    return NextResponse.json(template);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/custom-templates/[id] — idempotent delete
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const current = await db.customTemplate.findUnique({ where: { id } });
    if (current) await db.customTemplate.deleteMany({
      where: current.templateKey ? { templateKey: current.templateKey } : { id: current.id },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
