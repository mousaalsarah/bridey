import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const url = process.env.DATABASE_URL || "";
const isPostgres = /^postgres(ql)?:\/\//i.test(url);
const shouldMigrate = process.env.VERCEL === "1" || process.env.MIGRATE_ON_BUILD === "1";

if (!isPostgres || !shouldMigrate) {
  process.exit(0);
}

if (!process.env.DIRECT_URL) {
  console.error("DIRECT_URL is required to run Prisma migrations against PostgreSQL.");
  process.exit(1);
}

const schema = path.join("prisma", "postgres", "schema.prisma");
const result = spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", schema], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
