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

export function isRetryableTxError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /could not serialize|serialization failure|deadlock detected|40001|40P01/i.test(msg);
}
