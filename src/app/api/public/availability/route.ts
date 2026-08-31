import { NextResponse } from "next/server";
import { publicAvailability } from "@/lib/availability";
import { db } from "@/lib/db";
import { findBusinessBySlug } from "@/lib/workspace";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const date = url.searchParams.get("date");
  const ids = [
    ...new Set([
      ...url.searchParams.getAll("serviceId"),
      ...(url.searchParams.get("serviceIds") || "").split(","),
    ]),
  ]
    .map((id) => id.trim())
    .filter(Boolean);

  if (!slug || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || ids.length === 0) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const business = await findBusinessBySlug(slug);
  if (!business || !business.owner.onboardingComplete) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const services = await db.service.findMany({
    where: { businessId: business.id, id: { in: ids }, active: true },
  });
  if (services.length !== ids.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const availability = await publicAvailability(business, { date, serviceIds: ids });
  return NextResponse.json(availability);
}
