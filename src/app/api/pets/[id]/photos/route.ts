import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-server";

// POST /api/pets/[id]/photos - add a lesion photo
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const photo = await db.lesionPhoto.create({
      data: {
        petId: id,
        date: body.date ? new Date(body.date) : new Date(),
        imageData: body.imageData,
        caption: body.caption ?? null,
        vasScore: body.vasScore ?? null,
        bodyRegion: body.bodyRegion ?? null,
        consultationId: body.consultationId ?? null,
      },
    });
    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create lesion photo");
  }
}
