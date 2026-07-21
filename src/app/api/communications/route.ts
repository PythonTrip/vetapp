import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-server";

// GET /api/communications?petId=... — list communications for a pet
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const petId = url.searchParams.get("petId");
  if (!petId) {
    return NextResponse.json({ error: "petId required" }, { status: 400 });
  }
  const logs = await db.communicationLog.findMany({
    where: { petId },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(logs);
}

// POST /api/communications — create a new communication log entry
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const log = await db.communicationLog.create({
      data: {
        petId: body.petId,
        channel: body.channel ?? "phone",
        direction: body.direction ?? "outbound",
        date: body.date ? new Date(body.date) : new Date(),
        duration: body.duration != null ? Number(body.duration) : null,
        subject: body.subject ?? null,
        notes: body.notes ?? null,
        followUp: !!body.followUp,
      },
    });
    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create communication log");
  }
}
