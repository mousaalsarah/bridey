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
const schema = isPostgres ? path.join("prisma", "postgres", "schema.prisma") : path.join("prisma", "schema.prisma");

if (isPostgres && !existsSync(schema)) {
  console.error("PostgreSQL schema is missing. Run: npm run db:sync-postgres");
  process.exit(1);
}

console.log(`Prisma generate (${isPostgres ? "postgresql" : "sqlite"}): ${schema}`);
const result = spawnSync("npx", ["prisma", "generate", "--schema", schema], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
