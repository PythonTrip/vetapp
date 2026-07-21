import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
    const body = await req.json();
    const handout = await db.customHandout.create({
      data: {
        title: body.title?.trim() ?? "Untitled Handout",
        description: body.description ?? null,
        prompt: body.prompt ?? "",
        category: body.category ?? "general",
        icon: body.icon ?? "FileText",
      },
    });
    return NextResponse.json(handout, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
