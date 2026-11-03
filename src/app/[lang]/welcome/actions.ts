"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuth } from "@/lib/auth";
import { hasLocale, type Locale } from "@/lib/i18n/locales";
import { getSessionUser } from "@/lib/session";
import {
  forgetUnconfirmedUser,
  parseAgeAnswer,
  parseRoleChoice,
  recordAdultConfirmation,
  recordRole,
} from "@/lib/welcome";

/**
 * The /welcome step's two server actions. Each re-reads the session (never trusts a user id from
 * the form) and validates its one field; the writes themselves live in src/lib/welcome.ts.
 */

function safeLang(lang: string): Locale {
  return hasLocale(lang) ? lang : "en";
}

export async function answerAge(lang: string, formData: FormData): Promise<void> {
  const locale = safeLang(lang);
  const me = await getSessionUser();
  if (!me) redirect(`/${locale}/sign-in`);
  const answer = parseAgeAnswer(formData.get("adult"));
  if (!answer) redirect(`/${locale}/welcome`);
  const db = await getDb();

  if (answer === "yes") {
    await recordAdultConfirmation(db, me.id, new Date());
    redirect(`/${locale}/welcome`);
  }

  // Under 18: end this app's session first (nextCookies clears the cookie), then delete the row
  // the sign-in just made. Nothing about the visitor stays here; the WitUS account is untouched.
  try {
    const auth = await getAuth();
    await auth.api.signOut({ headers: await headers() });
  } catch (error: unknown) {
    console.error("[welcome] sign-out failed:", error instanceof Error ? error.constructor.name : "unknown");
  }
  await forgetUnconfirmedUser(db, me.id);
  // A different path, not a query on /welcome: the header re-reads the session when the path
  // changes, and this redirect is a client-side navigation.
  redirect(`/${locale}/adults-only`);
}

export async function chooseRole(lang: string, formData: FormData): Promise<void> {
  const locale = safeLang(lang);
  const me = await getSessionUser();
  if (!me) redirect(`/${locale}/sign-in`);
  const role = parseRoleChoice(formData.get("role"));
  if (!role) redirect(`/${locale}/welcome?error=role`);
  await recordRole(await getDb(), me.id, role, new Date());
  redirect(`/${locale}/welcome`);
}
