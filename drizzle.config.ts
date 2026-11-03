import { defineConfig } from "drizzle-kit";
import { resolveDirectDatabaseUrl } from "./src/lib/runtime-env";

// `pnpm db:generate` never connects; the URL only matters for `drizzle-kit studio` or `push`
// against a real Neon database. Migrations are applied by scripts/migrate.ts, not by drizzle-kit.
const direct = resolveDirectDatabaseUrl(process.env);

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  // Build plan section 4 row 11: the migrate workflow watches this folder.
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: direct?.url ?? "postgres://placeholder:placeholder@localhost/assessments_dev" },
  verbose: true,
  strict: true,
});
