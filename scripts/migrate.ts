/**
 * Applies ./drizzle to a Neon database. Run by .github/workflows/migrate-production.yml after a
 * merge to main, and by hand as the fallback in docs/01-operations.md ("Post-deploy steps").
 * Local development never needs it: embedded PGlite migrates itself on first use.
 *
 * Reads, in order: DATABASE_URL_UNPOOLED, STORAGE_DATABASE_URL_UNPOOLED (the direct connection,
 * preferred for DDL), then DATABASE_URL, STORAGE_DATABASE_URL. It prints the NAME of the variable
 * it used and never any part of its value. When GITHUB_STEP_SUMMARY is set it appends what ran.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import ws from "ws";
import { resolveDirectDatabaseUrl } from "../src/lib/runtime-env";

const MIGRATIONS_FOLDER = "./drizzle";

const direct = resolveDirectDatabaseUrl(process.env);
if (!direct) {
  console.error(
    "No database URL. Set DATABASE_URL_UNPOOLED (or DATABASE_URL) in this shell, or run `pnpm db:migrate:file` " +
      "to read .env.prod. Local development uses embedded PGlite, which migrates itself.",
  );
  process.exit(1);
}

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: direct.url, max: 1 });

type Journal = { entries: { idx: number; tag: string }[] };

async function main(): Promise<void> {
  console.log(`Using ${direct!.source}. Applying migrations from ${MIGRATIONS_FOLDER}`);
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  const journal = JSON.parse(readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8")) as Journal;
  const { rows } = await pool.query<{ count: string }>("select count(*)::text as count from drizzle.__drizzle_migrations");
  const applied = Number(rows[0]?.count ?? 0);
  console.log(`Migrations applied: ${applied} of ${journal.entries.length} in the journal.`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const lines = [
      "### Production migrations",
      "",
      `Connection variable: \`${direct!.source}\``,
      `Applied in the database: ${applied} of ${journal.entries.length} in \`drizzle/meta/_journal.json\``,
      "",
      ...journal.entries.map((e) => `- ${e.idx < applied ? "applied" : "PENDING"}: \`${e.tag}\``),
      "",
    ];
    appendFileSync(summary, `${lines.join("\n")}\n`);
  }
  if (applied < journal.entries.length) {
    throw new Error("the database has fewer applied migrations than the journal lists");
  }
}

main()
  .then(() => pool.end())
  .catch((error: unknown) => {
    // Class name and message only: a driver error can echo connection parameters in other fields.
    console.error("Migration failed:", error instanceof Error ? `${error.constructor.name}: ${error.message}` : "unknown error");
    void pool.end().finally(() => process.exit(1));
  });
