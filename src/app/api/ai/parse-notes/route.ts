import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// POST /api/ai/parse-notes
// Body: { transcript: "...", petName?: "..." }
// Returns: parsed structured fields to auto-fill the patient card
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transcript: string = body.transcript ?? "";

    if (!transcript.trim()) {
      return NextResponse.json({ error: "Empty transcript" }, { status: 400 });
    }

    const zai = await ZAI.create();
    const systemPrompt = `You are a veterinary clinical assistant that parses spoken consultation notes into structured patient-card fields.
Analyze the transcribed text from a vet's consultation and extract relevant information.

Return ONLY valid JSON (no markdown, no code fences) with these fields:
{
  "weight": number | null,           // current weight in kg if mentioned
  "bcs": number | null,              // Body Condition Score 1-9 if mentioned
  "vasScore": number | null,         // pruritus / itch VAS 1-10 if mentioned
  "symptoms": string[],              // e.g. ["pruritus", "ear inflammation", "alopecia"]
  "chiefComplaint": string | null,   // one-line chief complaint
  "diet": string | null,             // current or recommended diet mentioned
  "treatment": string | null,        // treatment / medication plan
  "diagnostics": string[],           // e.g. ["skin scrape", "cytology"]
  "notes": string                    // clean 2-4 sentence clinical summary
}

If a field is not mentioned, use null (or empty array). Do not invent data.
Keep medical terminology professional. The "notes" field should read like a polished SOAP subjective+objective entry.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        { role: "user", content: transcript },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    // Extract JSON (handle cases where model wraps in markdown)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { notes: transcript };

    return NextResponse.json(parsed);
  } catch (e) {
    console.error("Parse notes error:", e);
    const msg = e instanceof Error ? e.message : "Parsing failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
