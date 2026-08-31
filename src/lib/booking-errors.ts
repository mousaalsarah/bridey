import { Prisma } from "@prisma/client";

export class SlotTakenError extends Error {
  constructor() {
    super("UNAVAILABLE");
    this.name = "SlotTakenError";
  }
}

export function isUniqueConstraint(error: unknown, field?: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  if (!field) return true;
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.some((item) => String(item).includes(field));
  return String(target || "").includes(field);
}
