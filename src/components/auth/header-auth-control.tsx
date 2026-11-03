"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { signOutHere } from "@/lib/sign-out";
import { cn, FOCUS_RING } from "@/lib/utils";

const CONTROL =
  "flex min-h-11 items-center rounded-md border border-emerald-700 px-4 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-300 dark:text-emerald-200 dark:hover:bg-emerald-950";

/**
 * The header's Sign in / Sign out control (shared UI/UX/DX "Sign-in control" rule): a link named
 * exactly "Sign in" whenever the visitor is signed out OR the session is still loading, and a
 * "Sign out" button once a session is known. Reading the session in the browser keeps every page
 * static; the read is a same-origin request to /api/auth/get-session.
 *
 * "Sign out" ends only this app's session (src/lib/sign-out.ts), then a full navigation home.
 */
export function HeaderAuthControl({
  lang,
  labels,
}: {
  lang: string;
  labels: { signIn: string; signOut: string; signingOut: string };
}) {
  const { data } = authClient.useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!data?.user) {
    return (
      <Link href={`/${lang}/sign-in`} className={cn(CONTROL, FOCUS_RING)}>
        {labels.signIn}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={isSigningOut}
      onClick={() => {
        setIsSigningOut(true);
        void signOutHere({
          signOut: () => authClient.signOut(),
          navigate: (url) => window.location.assign(url),
          lang,
        });
      }}
      className={cn(CONTROL, "font-medium disabled:opacity-60", FOCUS_RING)}
    >
      {isSigningOut ? labels.signingOut : labels.signOut}
    </button>
  );
}
