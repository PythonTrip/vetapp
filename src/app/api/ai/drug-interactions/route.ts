import { NextRequest, NextResponse } from "next/server";
import { checkDrugInteractions } from "@/lib/drug-interactions";
import { handleApiError, parseJson } from "@/lib/api-server";
import { z } from "zod";

const requestSchema = z.object({
  text: z.string().max(100_000).default(""),
});

// POST /api/ai/drug-interactions
// Body: { text: string }
// Returns: { interactions: DetectedInteraction[], summary: {...} }
export async function POST(req: NextRequest) {
  try {
    const { text } = await parseJson(req, requestSchema);
    if (!text.trim()) {
      return NextResponse.json({ interactions: [], summary: { total: 0, contraindicated: 0, major: 0, moderate: 0, minor: 0 } });
    }
    const interactions = checkDrugInteractions(text);
    const summary = {
      total: interactions.length,
      contraindicated: interactions.filter((i) => i.interaction.severity === "contraindicated").length,
      major: interactions.filter((i) => i.interaction.severity === "major").length,
      moderate: interactions.filter((i) => i.interaction.severity === "moderate").length,
      minor: interactions.filter((i) => i.interaction.severity === "minor").length,
    };
    return NextResponse.json({ interactions, summary });
  } catch (error) {
    return handleApiError(error, "check drug interactions");
  }
}
