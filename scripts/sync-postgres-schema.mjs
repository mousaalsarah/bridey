import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "prisma", "schema.prisma");
const destDir = path.join(root, "prisma", "postgres");
const destPath = path.join(destDir, "schema.prisma");

const source = readFileSync(sourcePath, "utf8");
if (!source.includes('provider = "sqlite"')) {
  throw new Error("Expected prisma/schema.prisma to use provider = \"sqlite\"");
}

const postgres =
  `// Generated from prisma/schema.prisma — edit the SQLite schema, then run npm run db:sync-postgres\n` +
  source
    .replace(
      /datasource db \{[\s\S]*?\n\}/,
      `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}`,
    )
    .replace(
      /generator client \{[\s\S]*?\n\}/,
      `generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}`,
    );

mkdirSync(destDir, { recursive: true });
writeFileSync(destPath, postgres);
console.log(`Wrote ${path.relative(root, destPath)}`);
