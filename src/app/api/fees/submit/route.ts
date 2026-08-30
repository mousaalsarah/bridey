import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { FeeError, submitFeePayment } from "@/lib/fees";
import { savePublicImage } from "@/lib/media";

export async function POST(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const form = await req.formData();
  const invoiceId = String(form.get("invoiceId") || "");
  const method = String(form.get("method") || "BANK_TRANSFER");
  const amountLyd = Number(form.get("amountLyd") || 0);
  const paidOn = String(form.get("paidOn") || "");
  const reference = String(form.get("reference") || "");
  const note = String(form.get("note") || "");
  const file = form.get("receipt");

  let receiptUrl = "";
  if (file instanceof File && file.size > 0) {
    try {
      receiptUrl = await savePublicImage(artist.id, file);
    } catch (error) {
      const code = error instanceof Error ? error.message : "FILE";
      return NextResponse.json({ error: code }, { status: 400 });
    }
  }

  try {
    const payment = await submitFeePayment(artist.id, {
      invoiceId,
      method,
      amountLyd,
      paidOn,
      reference,
      receiptUrl,
      note,
    });
    return NextResponse.json(payment);
  } catch (error) {
    if (error instanceof FeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
