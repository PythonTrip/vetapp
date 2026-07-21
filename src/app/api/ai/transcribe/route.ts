import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// POST /api/ai/transcribe
// Body: { audio: "base64-encoded-audio-data" }
// Returns: { text: "transcribed text" }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const audio = body.audio as string;

    if (!audio) {
      return NextResponse.json({ error: "No audio data provided" }, { status: 400 });
    }

    // Strip data URL prefix if present (e.g. data:audio/webm;base64,XXXX)
    const base64 = audio.includes(",") ? audio.split(",")[1] : audio;

    const zai = await ZAI.create();
    const response = await zai.audio.asr.create({
      file_base64: base64,
    });

    return NextResponse.json({
      text: response.text ?? "",
    });
  } catch (e) {
    console.error("ASR error:", e);
    const msg = e instanceof Error ? e.message : "Transcription failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
