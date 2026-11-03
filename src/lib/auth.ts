import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";
import { magicLink } from "better-auth/plugins/magic-link";
import { getDb, schema } from "@/db/client";
import { deliverDevMagicLink } from "./dev-magic-link";
import {
  devSignInEnabled,
  isOnVercel,
  resolveAuthSecret,
  resolveBaseUrl,
  resolveTrustedOrigins,
  resolveWitusProvider,
  WITUS_CALLBACK_PATH,
} from "./runtime-env";

/**
 * Better Auth for Fit T. Cent Assessments (build plan section 1.8), copied from vogoat's working
 * src/lib/auth.ts:
 *
 * - Sign in with WitUS: `genericOAuth` provider `witus`, discovery on accounts.witus.online, PKCE,
 *   `openid email profile`. Registered only when the client id AND secret exist, so a missing env
 *   never breaks a build or shows a button that cannot work.
 * - Development: a magic link printed to the console (src/lib/dev-magic-link.ts). Never registered
 *   on Vercel.
 * - "Sign out" ends only this app's session (`disableProviderLogout`), pinned by
 *   src/lib/sign-out-local-only.test.ts.
 *
 * Built lazily: the database handle is async, and the secret check must not run during
 * `next build`.
 */
async function createAuth() {
  const db = await getDb();
  const env = process.env;
  const baseURL = resolveBaseUrl(env).url;
  const witus = resolveWitusProvider(env);

  return betterAuth({
    appName: "Fit T. Cent Assessments",
    baseURL,
    secret: resolveAuthSecret(env),
    trustedOrigins: resolveTrustedOrigins(env),
    database: drizzleAdapter(db, { provider: "pg", schema }),
    // Better Auth's own default is off; stated so an upgrade cannot quietly turn it on.
    telemetry: { enabled: false },
    // Local runs (dev, the Playwright suite) sign in many times a minute from one address.
    rateLimit: { enabled: isOnVercel(env) },
    // Failed sign-ins land on the sign-in page with ?error=..., which proxy.ts localizes.
    onAPIError: { errorURL: "/sign-in" },
    user: {
      additionalFields: {
        // input: false: a client can never set these through the auth API. Only the /welcome
        // server actions write them (src/lib/welcome.ts).
        role: { type: "string", required: false, input: false },
        adultConfirmedAt: { type: "date", required: false, input: false },
      },
    },
    plugins: [
      ...(devSignInEnabled(env)
        ? [magicLink({ sendMagicLink: async ({ email, url }) => deliverDevMagicLink({ email, url }) })]
        : []),
      ...(witus
        ? [
            genericOAuth({
              config: [
                {
                  providerId: "witus",
                  discoveryUrl: witus.discoveryUrl,
                  clientId: witus.clientId,
                  clientSecret: witus.clientSecret,
                  scopes: ["openid", "email", "profile"],
                  pkce: true,
                  // The IdP registers /api/auth/oauth2/callback/witus (exact match); Better Auth
                  // 1.7 serves /api/auth/callback/witus. The redirect URI is pinned to the
                  // registered form and the route under src/app/api/auth/oauth2 307s it on.
                  redirectURI: `${baseURL}${WITUS_CALLBACK_PATH}`,
                  // "Sign out" ends ONLY this app's session (build plan 1.8). Without this flag
                  // Better Auth 1.7 answers sign-out with the IdP's end-session URL and the client
                  // follows it, ending the shared WitUS session and stranding the person on
                  // accounts.witus.online.
                  disableProviderLogout: true,
                },
              ],
            }),
          ]
        : []),
      // Last, so cookies set by server actions (the welcome step's sign-out) reach the browser.
      nextCookies(),
    ],
  });
}

let authPromise: ReturnType<typeof createAuth> | undefined;

export function getAuth(): ReturnType<typeof createAuth> {
  authPromise ??= createAuth().catch((error: unknown) => {
    authPromise = undefined;
    throw error;
  });
  return authPromise;
}

export type Auth = Awaited<ReturnType<typeof getAuth>>;
export type Session = Auth["$Infer"]["Session"];
