import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  forgetUnconfirmedUser,
  parseAgeAnswer,
  parseRoleChoice,
  recordAdultConfirmation,
  recordRole,
  ROLE_CHOICES,
  welcomeStep,
} from "./welcome";

// The welcome step against a real Postgres: in-memory PGlite with the generated migrations in
// ./drizzle applied, which also proves the first migration runs cleanly.
const client = new PGlite();
const db = drizzle(client, { schema });

const ID = "user_welcome_1";
const T1 = new Date("2026-11-02T15:00:00Z");
const T2 = new Date("2026-11-03T15:00:00Z");

async function row() {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, ID));
  return u;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  await db.delete(schema.user);
  await db.insert(schema.user).values({ id: ID, name: "Test", email: "welcome@example.invalid" });
  await db.insert(schema.session).values({ id: "s1", userId: ID, token: "t1", expiresAt: T2 });
  await db.insert(schema.account).values({ id: "a1", userId: ID, accountId: "witus-sub", providerId: "witus" });
});

afterAll(async () => {
  await client.close();
});

describe("welcome step order", () => {
  it("asks age first, then role, then is done", () => {
    expect(welcomeStep({ adultConfirmedAt: null, role: null })).toBe("age");
    expect(welcomeStep({ adultConfirmedAt: null, role: "coach" })).toBe("age");
    expect(welcomeStep({ adultConfirmedAt: T1, role: null })).toBe("role");
    expect(welcomeStep({ adultConfirmedAt: T1, role: "athlete" })).toBe("done");
  });

  it("parses only the expected answers", () => {
    expect(parseAgeAnswer("yes")).toBe("yes");
    expect(parseAgeAnswer("no")).toBe("no");
    expect(parseAgeAnswer("maybe")).toBeNull();
    expect(parseAgeAnswer(null)).toBeNull();
    expect(ROLE_CHOICES).toEqual(["athlete", "coach", "both"]);
    for (const r of ROLE_CHOICES) expect(parseRoleChoice(r)).toBe(r);
    expect(parseRoleChoice("admin")).toBeNull();
    expect(parseRoleChoice("")).toBeNull();
  });
});

describe("answering yes", () => {
  it("stores the confirmation time and nothing else", async () => {
    await recordAdultConfirmation(db, ID, T1);
    const u = await row();
    expect(u?.adultConfirmedAt?.toISOString()).toBe(T1.toISOString());
    expect(u?.role).toBeNull();
  });

  it("keeps the first time on a repeat", async () => {
    await recordAdultConfirmation(db, ID, T1);
    await recordAdultConfirmation(db, ID, T2);
    expect((await row())?.adultConfirmedAt?.toISOString()).toBe(T1.toISOString());
  });
});

describe("choosing a role", () => {
  it("is refused before the age question is answered", async () => {
    expect(await recordRole(db, ID, "coach", T1)).toBe(false);
    expect((await row())?.role).toBeNull();
  });

  it("is stored for a confirmed adult", async () => {
    await recordAdultConfirmation(db, ID, T1);
    expect(await recordRole(db, ID, "both", T2)).toBe(true);
    expect((await row())?.role).toBe("both");
  });

  it("never overwrites an existing role, so an admin stays an admin", async () => {
    await db.update(schema.user).set({ adultConfirmedAt: T1, role: "admin" }).where(eq(schema.user.id, ID));
    expect(await recordRole(db, ID, "athlete", T2)).toBe(false);
    expect((await row())?.role).toBe("admin");
  });
});

describe("answering no (under 18)", () => {
  it("deletes the user row, and its sessions and accounts cascade", async () => {
    expect(await forgetUnconfirmedUser(db, ID)).toBe(true);
    expect(await row()).toBeUndefined();
    expect(await db.select().from(schema.session)).toEqual([]);
    expect(await db.select().from(schema.account)).toEqual([]);
  });

  it("refuses to delete an account that already confirmed adulthood", async () => {
    await recordAdultConfirmation(db, ID, T1);
    expect(await forgetUnconfirmedUser(db, ID)).toBe(false);
    expect(await row()).toBeDefined();
  });
});
