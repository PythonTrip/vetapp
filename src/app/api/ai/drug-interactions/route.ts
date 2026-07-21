import { NextRequest, NextResponse } from "next/server";
import { checkDrugInteractions } from "@/lib/drug-interactions";

// POST /api/ai/drug-interactions
// Body: { text: string }
// Returns: { interactions: DetectedInteraction[], summary: {...} }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = body.text ?? "";
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
