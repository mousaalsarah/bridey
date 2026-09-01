import { NextResponse } from "next/server";
import { appUrl } from "@/lib/utils";

function allowedHosts(req: Request) {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(appUrl()).host);
  } catch {
    /* ignore invalid app url */
  }
  try {
    hosts.add(new URL(req.url).host);
  } catch {
    /* ignore */
  }
  const vercel = process.env.VERCEL_URL?.trim().replace(/^https?:\/\//, "");
  if (vercel) hosts.add(vercel);
  return hosts;
}

function allowedUrl(raw: string, req: Request) {
  try {
    const target = new URL(raw);
    if (target.protocol !== "http:" && target.protocol !== "https:") return false;
    if (target.hostname === "localhost" || target.hostname === "127.0.0.1") return true;
    return allowedHosts(req).has(target.host);
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const data = new URL(req.url).searchParams.get("data") || "";
  if (!allowedUrl(data, req)) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const qr = await fetch(
    `https://api.qrserver.com/v1/create-qr-code/?size=640x640&margin=16&data=${encodeURIComponent(data)}`,
  );
  if (!qr.ok) return NextResponse.json({ error: "QR" }, { status: 502 });

  return new NextResponse(await qr.arrayBuffer(), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
