import { NextResponse, type NextRequest } from "next/server";

const HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
  "host",
]);

export function flaskApiOrigin() {
  const origin = (process.env.FLASK_API_ORIGIN || "").trim().replace(/\/$/, "");
  if (!origin) return null;
  if (process.env.VERCEL === "1" && process.env.FLASK_API_CUTOVER !== "1") return null;
  return origin;
}

export function shouldProxyToFlask(pathname: string) {
  if (!flaskApiOrigin()) return false;
  return pathname === "/health" || pathname === "/api" || pathname.startsWith("/api/");
}

export async function proxyToFlask(req: NextRequest) {
  const origin = flaskApiOrigin();
  if (!origin) return NextResponse.next();

  const target = `${origin}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const body = await upstream.arrayBuffer();
  const response = new NextResponse(body, { status: upstream.status });
  upstream.headers.forEach((value, key) => {
    if (HOP.has(key.toLowerCase()) || key.toLowerCase() === "set-cookie") return;
    response.headers.set(key, value);
  });
  const cookies =
    typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  for (const cookie of cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
