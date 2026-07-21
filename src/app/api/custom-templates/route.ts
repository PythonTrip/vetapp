import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-server";

// GET /api/custom-templates — list all custom templates
export async function GET() {
  const templates = await db.customTemplate.findMany({
    where: { isLatest: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(templates);
}

// POST /api/custom-templates — create a new custom template
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const template = await db.customTemplate.create({
      data: {
        name: body.name?.trim() ?? "Untitled Template",
        category: body.category ?? "custom",
        description: body.description ?? null,
        icon: body.icon ?? "Stethoscope",
        type: body.type ?? "treatment",
        chiefComplaint: body.chiefComplaint ?? null,
        notes: body.notes ?? "",
        suggestedVas: body.suggestedVas != null ? Number(body.suggestedVas) : null,
        duration: body.duration ?? null,
        templateKey: body.templateKey ?? undefined,
        version: 1,
        isLatest: true,
        sections: body.sections == null
          ? null
          : typeof body.sections === "string" ? body.sections : JSON.stringify(body.sections),
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create custom template");
  }
}
