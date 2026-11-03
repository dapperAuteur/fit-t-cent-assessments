import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { user, type UserRole } from "@/db/schema";

/**
 * The first-sign-in welcome step (build plan sections 1.2 and 1.9). Two questions, in order:
 *
 * 1. "Are you 18 or older?" Yes stores the confirmation TIME (never a birth date). No ends this
 *    app's session and deletes the account row it just created (sessions and the linked WitUS
 *    account row cascade), so nothing about an under-18 visitor stays here. The WitUS account
 *    itself is untouched.
 * 2. Role: athlete, coach, or both. Admin is never self-chosen.
 *
 * Pure parsing plus three small writes that take the database as an argument, so the tests run
 * them against in-memory PGlite with the real migrations (src/lib/welcome.test.ts).
 */

export const ROLE_CHOICES = ["athlete", "coach", "both"] as const satisfies readonly UserRole[];
export type RoleChoice = (typeof ROLE_CHOICES)[number];

export type WelcomeStep = "age" | "role" | "done";

type AnyDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

export function welcomeStep(u: { adultConfirmedAt: Date | null | undefined; role: string | null | undefined }): WelcomeStep {
  if (!u.adultConfirmedAt) return "age";
  if (!u.role) return "role";
  return "done";
}

export function parseAgeAnswer(value: FormDataEntryValue | null): "yes" | "no" | null {
  return value === "yes" || value === "no" ? value : null;
}

export function parseRoleChoice(value: FormDataEntryValue | null): RoleChoice | null {
  return typeof value === "string" && (ROLE_CHOICES as readonly string[]).includes(value) ? (value as RoleChoice) : null;
}

/** Stores the confirmation time once; a second "yes" keeps the first time. */
export async function recordAdultConfirmation(db: AnyDb, userId: string, now: Date): Promise<void> {
  await db
    .update(user)
    .set({ adultConfirmedAt: now, updatedAt: now })
    .where(and(eq(user.id, userId), isNull(user.adultConfirmedAt)));
}

/**
 * Sets the role only for a confirmed adult whose role is still empty, so this can never overwrite
 * an admin role or skip the age question. Returns whether a row changed.
 */
export async function recordRole(db: AnyDb, userId: string, role: RoleChoice, now: Date): Promise<boolean> {
  const rows = await db
    .update(user)
    .set({ role, updatedAt: now })
    .where(and(eq(user.id, userId), isNotNull(user.adultConfirmedAt), isNull(user.role)))
    .returning({ id: user.id });
  return rows.length > 0;
}

/**
 * The "No, I am under 18" answer: delete this app's user row (sessions and accounts cascade).
 * Refuses a row that already confirmed adulthood, so a stray request cannot delete a real account.
 */
export async function forgetUnconfirmedUser(db: AnyDb, userId: string): Promise<boolean> {
  const rows = await db
    .delete(user)
    .where(and(eq(user.id, userId), isNull(user.adultConfirmedAt)))
    .returning({ id: user.id });
  return rows.length > 0;
}
