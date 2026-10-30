import { NextRequest, NextResponse } from "next/server";

export function createWebProxy(options: { audience: "staff" | "owner"; frontendUrl?: () => string | undefined }) {

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
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (!origin || origin !== new URL(options.frontendUrl?.() ?? request.url).origin || request.headers.get("X-Vetapp-CSRF") !== "1")
        return NextResponse.json({ detail: "Недопустимый источник запроса" }, { status: 403 });
    }
    const { path } = await context.params;
    if (options.audience === "owner" && (path[0] !== "owner" || path.some(part => /[\\/%]/.test(part) || part === "." || part === "..")))
      return NextResponse.json({ detail: "Not found" }, { status: 404 });
    const target = new URL(`${apiOrigin()}/${path.map(encodeURIComponent).join("/")}`);
    target.search = request.nextUrl.search;

    const init: RequestInit = {
      method: request.method,
      headers: filterHeaders(request.headers),
      redirect: "manual",
      cache: "no-store",
    };

    if (options.audience === "owner") {
      init.headers = new Headers(init.headers);
      init.headers.delete("Authorization");
      init.headers.delete("X-Vetapp-Workspace");
      const cookie = request.cookies.get("vetapp_owner_session")?.value;
      init.headers.delete("Cookie");
      if (cookie) init.headers.set("Cookie", `vetapp_owner_session=${cookie}`);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      Object.assign(init, { duplex: "half" });
    }

    try {
      const upstream = await fetch(target, init);
      return new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: (() => { const headers = filterHeaders(upstream.headers); headers.set("Cache-Control", "no-store"); return headers; })(),
      });
    } catch {
      return NextResponse.json({ detail: "API unavailable" }, { status: 502 });
    }
  }

  return proxy;
}
