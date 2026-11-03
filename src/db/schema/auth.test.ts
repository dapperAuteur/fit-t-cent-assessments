import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./index";

// Guards against Better Auth core-schema drift (vogoat's production sign-in broke on 2026-08-31
// when 1.7.2 added a field the Drizzle table lacked: the adapter fails AT RUNTIME). The extra user
// fields must match the ones src/lib/auth.ts declares.
describe("the Drizzle schema covers Better Auth's models", () => {
  const tables = getAuthTables({
    user: {
      additionalFields: {
        role: { type: "string", required: false, input: false },
        adultConfirmedAt: { type: "date", required: false, input: false },
      },
    },
  });
  const ours: Record<string, PgTable> = {
    user: schema.user,
    session: schema.session,
    account: schema.account,
    verification: schema.verification,
  };

  for (const [model, def] of Object.entries(tables)) {
    it(`covers every field of "${model}"`, () => {
      const table = ours[def.modelName];
      if (!table) throw new Error(`model ${model} has no table`);
      const columns = Object.keys(getTableColumns(table));
      for (const field of Object.keys(def.fields)) {
        expect(columns, `missing "${field}" on "${def.modelName}"`).toContain(field);
      }
    });
  }

  it("stores no birth date or age, only the confirmation time (build plan 1.9)", () => {
    const columns = Object.keys(getTableColumns(schema.user));
    expect(columns).toContain("adultConfirmedAt");
    expect(columns.filter((c) => /birth|dob|^age$|ageYears/i.test(c))).toEqual([]);
  });
});
