import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function apiOrigin(): string {
  return (process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
}

function filterHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  return headers;
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  const target = new URL(`${apiOrigin()}/${path.map(encodeURIComponent).join("/")}`);
  target.search = request.nextUrl.search;

  const init: RequestInit = {
    method: request.method,
    headers: filterHeaders(request.headers),
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    Object.assign(init, { duplex: "half" });
  }

  try {
    const upstream = await fetch(target, init);
    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: filterHeaders(upstream.headers),
    });
  } catch {
    return NextResponse.json({ detail: "API unavailable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
