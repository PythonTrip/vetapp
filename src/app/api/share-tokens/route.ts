import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
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
    const body = await req.json();
    const petId = body.petId as string;
    if (!petId) {
      return NextResponse.json({ error: "petId required" }, { status: 400 });
    }
    // Default expiry: 30 days
    const days = Number(body.expiresInDays) || 30;
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
