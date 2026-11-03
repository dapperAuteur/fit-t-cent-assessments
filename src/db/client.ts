import "server-only";
import { mkdirSync } from "node:fs";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { resolveDatabaseChoice } from "@/lib/runtime-env";
import * as schema from "./schema";

export type Schema = typeof schema;
/** Driver-agnostic handle: Neon on Vercel, embedded PGlite on a laptop or in CI. */
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

declare global {
  // Survives dev hot reload: a second PGlite on the same directory would fight for its lock.
  var __assessmentsDb: Promise<Db> | undefined;
}

/** Where the generated SQL lives (drizzle.config.ts `out`); PGlite applies it on first use. */
export const MIGRATIONS_FOLDER = "./drizzle";

async function create(): Promise<Db> {
  const choice = resolveDatabaseChoice(process.env);
  // Both drivers are imported dynamically so a deployed function loads only Neon's, and never
  // reads the migrations folder or PGlite's wasm (vogoat saw a static PGlite import crash a
  // Vercel function at module load).
  if (choice.driver === "neon") {
    const [{ neonConfig, Pool }, { drizzle }, { default: ws }] = await Promise.all([
      import("@neondatabase/serverless"),
      import("drizzle-orm/neon-serverless"),
      import("ws"),
    ]);
    // Neon's WebSocket driver needs a Node WebSocket; one connection per serverless instance.
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: choice.url, max: 1 });
    return drizzle(pool, { schema }) as unknown as Db;
  }
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
  // PGlite does not create missing parent directories.
  mkdirSync(dir, { recursive: true });
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}

/** The one way to a database handle. Locally it resolves after PGlite has applied migrations. */
export function getDb(): Promise<Db> {
  globalThis.__assessmentsDb ??= create().catch((error: unknown) => {
    // Do not cache a failure: the next request tries again.
    globalThis.__assessmentsDb = undefined;
    throw error;
  });
  return globalThis.__assessmentsDb;
}

export { schema };
