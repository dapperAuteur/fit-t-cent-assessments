import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Browser client. baseURL defaults to the current origin: localhost:3070 locally and
// assessments.witus.online in production, both same-origin, so the CSP keeps connect-src 'self'.
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

/**
 * Starts Sign in with WitUS. Better Auth 1.7 registers genericOAuth providers as social providers,
 * so the core /sign-in/social endpoint answers with the IdP's authorize URL; the browser then
 * navigates there (a navigation, not a fetch, so connect-src stays 'self').
 */
export async function signInWithWitus(callbackURL: string): Promise<void> {
  const { data, error } = await authClient.$fetch<{ url: string; redirect: boolean }>("/sign-in/social", {
    method: "POST",
    body: { provider: "witus", callbackURL },
  });
  if (error || !data?.url) throw new Error("sso_start_failed");
  window.location.assign(data.url);
}
