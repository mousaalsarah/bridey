import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

void db.$queryRawUnsafe("PRAGMA busy_timeout = 8000");

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
