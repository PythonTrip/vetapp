import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z, type ZodType } from "zod";

export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export async function parseJson<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function parseDate(value: string, fieldName = "date"): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${fieldName} must be a valid date`);
  }
  return date;
}

export function handleApiError(error: unknown, context: string): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
      { status: error.status },
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: "Invalid request data",
        details: error.issues.map(({ path, message }) => ({ field: path.join("."), message })),
      },
      { status: 400 },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Resource already exists" }, { status: 409 });
    }
    if (error.code === "P2003") {
      return NextResponse.json({ error: "Related resource not found or still in use" }, { status: 409 });
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
  }

  console.error(`[api] ${context}`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
