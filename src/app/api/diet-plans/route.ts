import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, parseJson } from "@/lib/api-server";
import { dietPlanFediafMetaSchema } from "@/lib/diet-plan";
import { z } from "zod";

const fediafMetaInputSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, dietPlanFediafMetaSchema.nullish());

const dietPlanSchema = z.object({
  petId: z.string().min(1),
  name: z.string().trim().min(1).max(500),
  type: z.enum(["commercial", "home_cooked", "barf", "mixed"]).default("commercial"),
  rer: z.coerce.number().finite().default(0),
  mer: z.coerce.number().finite().default(0),
  macros: z.string().max(100_000).default("{}"),
  template: z.string().max(1_000_000).nullish(),
  fediafMeta: fediafMetaInputSchema,
  notes: z.string().max(100_000).nullish(),
});

// POST /api/diet-plans - create a diet plan
export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, dietPlanSchema);
    const plan = await db.dietPlan.create({
      data: {
        petId: body.petId,
        name: body.name,
        type: body.type ?? "commercial",
        rer: body.rer,
        mer: body.mer,
        macros: body.macros,
        template: body.template ?? null,
        fediafMeta: body.fediafMeta ? JSON.stringify(body.fediafMeta) : null,
        notes: body.notes ?? null,
      },
    });
    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create diet plan");
  }
}
