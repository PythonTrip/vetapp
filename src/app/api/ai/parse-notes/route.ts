import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { handleApiError, HttpError, parseJson } from "@/lib/api-server";
import { z } from "zod";

const requestSchema = z.object({
  transcript: z.string().trim().min(1, "Empty transcript").max(100_000),
});

const parsedNoteSchema = z.object({
  weight: z.number().positive().nullable(),
  bcs: z.number().int().min(1).max(9).nullable(),
  vasScore: z.number().min(0).max(10).nullable(),
  symptoms: z.array(z.string()).max(100),
  chiefComplaint: z.string().nullable(),
  diet: z.string().nullable(),
  treatment: z.string().nullable(),
  diagnostics: z.array(z.string()).max(100),
  notes: z.string(),
});

// POST /api/ai/parse-notes
// Body: { transcript: "...", petName?: "..." }
// Returns: parsed structured fields to auto-fill the patient card
export async function POST(req: NextRequest) {
  try {
    const { transcript } = await parseJson(req, requestSchema);

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
    if (!jsonMatch) throw new HttpError(502, "AI returned an invalid response");
    const result = parsedNoteSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!result.success) throw new HttpError(502, "AI returned an invalid response");

    return NextResponse.json(result.data);
  } catch (error) {
    return handleApiError(error, "parse clinical notes");
  }
}
