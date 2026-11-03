import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import type { UserRole } from "@/db/schema";
import { getAuth, type Session } from "./auth";

export type SessionUser = Session["user"] & { role: UserRole | null; adultConfirmedAt: Date | null };

/**
 * Request-cached session read. A broken database or a missing secret reads as "signed out" (and is
 * logged by class name only), so a page that only wants to know who is here still renders.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    return session ? (session.user as SessionUser) : null;
  } catch (error: unknown) {
    console.error("[session] read failed:", error instanceof Error ? error.constructor.name : "unknown");
    return null;
  }
});
