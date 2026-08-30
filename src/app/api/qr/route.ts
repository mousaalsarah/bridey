import { NextResponse } from "next/server";
import { appUrl } from "@/lib/utils";

function allowedHost(raw: string) {
  try {
    const target = new URL(raw);
    const app = new URL(appUrl());
    return (
      (target.protocol === "http:" || target.protocol === "https:") &&
      (target.host === app.host || target.hostname === "localhost" || target.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const data = new URL(req.url).searchParams.get("data") || "";
  if (!allowedHost(data)) {
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
