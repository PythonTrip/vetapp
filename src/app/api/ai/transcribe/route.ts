import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { handleApiError, parseJson } from "@/lib/api-server";
import { z } from "zod";

const requestSchema = z.object({
  audio: z.string().min(1, "No audio data provided").max(30_000_000, "Audio payload is too large"),
});

// POST /api/ai/transcribe
// Body: { audio: "base64-encoded-audio-data" }
// Returns: { text: "transcribed text" }
export async function POST(req: NextRequest) {
  try {
    const { audio } = await parseJson(req, requestSchema);

    // Strip data URL prefix if present (e.g. data:audio/webm;base64,XXXX)
    const base64 = audio.includes(",") ? audio.split(",")[1] : audio;

    const zai = await ZAI.create();
    const response = await zai.audio.asr.create({
      file_base64: base64,
    });

    return NextResponse.json({
      text: response.text ?? "",
    });
  } catch (error) {
    return handleApiError(error, "transcribe audio");
  }
}
