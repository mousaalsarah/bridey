import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function datasourceUrl() {
  return process.env.DATABASE_URL || "";
}

function isSqliteUrl(url: string) {
  return url.startsWith("file:") || url.startsWith("sqlite:");
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl() ? { datasourceUrl: datasourceUrl() } : {}),
  });

if (isSqliteUrl(datasourceUrl())) {
  void db.$queryRawUnsafe("PRAGMA busy_timeout = 8000");
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
