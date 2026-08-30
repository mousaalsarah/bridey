import { mkdir, writeFile } from "fs/promises";
import path from "path";

const ALLOWED = new Set(["jpg", "jpeg", "png", "webp"]);

export async function savePublicImage(artistId: string, file: File) {
  if (file.size > 6 * 1024 * 1024) {
    throw new Error("TOO_LARGE");
  }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ALLOWED.has(ext)) {
    throw new Error("FILE");
  }
  const name = `${artistId}-${Date.now()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}
