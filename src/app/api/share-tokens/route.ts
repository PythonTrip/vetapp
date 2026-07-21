import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, parseJson } from "@/lib/api-server";
import { z } from "zod";

const shareTokenSchema = z.object({
  petId: z.string().min(1),
  expiresInDays: z.coerce.number().int().min(1).max(365).default(30),
  label: z.string().trim().max(300).nullish(),
});
import crypto from "crypto";

// GET /api/share-tokens?petId=... — list share tokens for a pet
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const petId = url.searchParams.get("petId");
  if (!petId) {
    return NextResponse.json({ error: "petId required" }, { status: 400 });
  }
  const tokens = await db.shareToken.findMany({
    where: { petId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tokens);
}

// POST /api/share-tokens — create a new share token
export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, shareTokenSchema);
    const { petId, expiresInDays: days } = body;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    // Generate a short, URL-safe random token (12 chars)
    const token = crypto.randomBytes(9).toString("base64url").slice(0, 12);

    const shareToken = await db.shareToken.create({
      data: {
        token,
        petId,
        label: body.label ?? null,
        expiresAt,
      },
    });
    return NextResponse.json(shareToken, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create share token");
  }
}
