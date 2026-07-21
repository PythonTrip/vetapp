import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/diet-plans - create a diet plan
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const plan = await db.dietPlan.create({
      data: {
        petId: body.petId,
        name: body.name,
        type: body.type ?? "commercial",
        rer: Number(body.rer) || 0,
        mer: Number(body.mer) || 0,
        macros: body.macros ?? "{}",
        template: body.template ?? null,
        notes: body.notes ?? null,
      },
    });
    return NextResponse.json(plan, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
