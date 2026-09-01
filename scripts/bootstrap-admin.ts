import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
const name = process.env.ADMIN_NAME || "Bridey Admin";

if (!email || !password || password.length < 10) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters).");
  process.exit(1);
}

const db = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await db.admin.upsert({
    where: { email },
    update: { passwordHash, name },
    create: { email, name, passwordHash },
  });
  console.log(`Admin ready: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
