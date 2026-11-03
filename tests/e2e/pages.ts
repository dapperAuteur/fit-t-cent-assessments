/**
 * Every page a signed-out visitor can open, in both languages. Add new pages here as they ship.
 * /welcome needs a session, so tests/e2e/auth.spec.ts checks it (axe, 320 px) while signed in.
 */
export const PAGES = ["/en", "/es", "/en/sign-in", "/es/sign-in", "/en/adults-only", "/es/adults-only"] as const;
