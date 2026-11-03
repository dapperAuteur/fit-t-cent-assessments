/**
 * "Sign out" in this app ends ONLY this app's session (build plan 1.8, sign out local only). It
 * never navigates to the WitUS IdP, so the WitUS session and every other WitUS app stay signed in.
 * There is no "Sign out of WitUS everywhere" control in release 1: the plan does not call for one.
 *
 * Pure helpers (no window, no React) so tests drive them with fakes (src/lib/sign-out.test.ts).
 */

/** Where "Sign out" lands: this app's home page in the visitor's language. */
export function signOutDestination(lang: string): string {
  return `/${lang}`;
}

/**
 * Ends this app's session, then navigates home. A failed sign-out call still navigates, so the
 * person is never stranded on a half-signed-out page; the header reads the session again there.
 * Deliberately takes no IdP URL and ignores any URL the server might send back.
 */
export async function signOutHere(deps: {
  signOut: () => Promise<unknown>;
  navigate: (url: string) => void;
  lang: string;
}): Promise<void> {
  try {
    await deps.signOut();
  } catch {
    // Still leave.
  }
  deps.navigate(signOutDestination(deps.lang));
}
