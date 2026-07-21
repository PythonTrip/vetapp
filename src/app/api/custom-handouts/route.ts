import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, parseJson } from "@/lib/api-server";
import { z } from "zod";

const handoutSchema = z.object({
  title: z.string().trim().min(1).max(300).default("Untitled Handout"),
  description: z.string().max(2_000).nullish(),
  prompt: z.string().max(20_000).default(""),
  category: z.string().min(1).max(100).default("general"),
  icon: z.string().min(1).max(100).default("FileText"),
});

// GET /api/custom-handouts — list all custom handout templates
export async function GET() {
  const handouts = await db.customHandout.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(handouts);
}

// POST /api/custom-handouts — create a custom handout template
export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, handoutSchema);
    const handout = await db.customHandout.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        prompt: body.prompt ?? "",
        category: body.category ?? "general",
        icon: body.icon ?? "FileText",
      },
    });
    return NextResponse.json(handout, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create custom handout");
  }
}
