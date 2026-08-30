export async function buildShareCard(url: string, artistName: string) {
  const qr = new Image();
  qr.src = `/api/qr?data=${encodeURIComponent(url)}`;
  await qr.decode();

  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS");

  ctx.fillStyle = "#f6efe6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#c4a062";
  ctx.lineWidth = 8;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

  ctx.fillStyle = "#c4a062";
  ctx.font = "600 28px serif";
  ctx.textAlign = "center";
  ctx.fillText("BRIDEY  ·  BENGHAZI", size / 2, 140);

  ctx.fillStyle = "#2b1b14";
  ctx.font = "700 64px serif";
  ctx.fillText(artistName, size / 2, 230);

  const qrSize = 640;
  const qrX = (size - qrSize) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX - 24, 300, qrSize + 48, qrSize + 48);
  ctx.drawImage(qr, qrX, 324, qrSize, qrSize);

  ctx.fillStyle = "#2b1b14";
  ctx.font = "28px sans-serif";
  ctx.fillText(url.replace(/^https?:\/\//, ""), size / 2, 1060);

  ctx.fillStyle = "#8a6d3b";
  ctx.font = "32px serif";
  ctx.fillText("Scan to book your date", size / 2, 1140);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => (next ? resolve(next) : reject(new Error("BLOB"))), "image/png");
  });
  return blob;
}

export async function copyImage(blob: Blob) {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("UNSUPPORTED");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export async function shareImage(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title, text: title });
    return true;
  }
  return false;
}
