/**
 * Pure resolution of the auth and database settings from an environment object. No imports, no
 * reads of `process.env` here: `src/lib/env.ts` calls these with `process.env`, the migrate script
 * and `drizzle.config.ts` call them too, and the unit tests call them with hand-built objects
 * (src/lib/runtime-env.test.ts).
 *
 * Names verified on 2026-11-02: the Vercel Neon integration on this project uses the `STORAGE_`
 * prefix (`STORAGE_DATABASE_URL` pooled, `STORAGE_DATABASE_URL_UNPOOLED` direct). A plain
 * `DATABASE_URL` wins when both exist, so a hand-set value can override the integration.
 */

export type EnvSource = Readonly<Record<string, string | undefined>>;

/** The local origin `pnpm dev` and `pnpm start` listen on (package.json, port 3070). */
export const LOCAL_ORIGIN = "http://localhost:3070";

/**
 * The WitUS IdP discovery document. A fallback only: `WITUS_OIDC_DISCOVERY_URL` overrides it, and
 * the value is the same one vogoat uses against the live IdP (gemini/witus serves Better Auth's
 * OIDC provider under /api/idp on accounts.witus.online).
 */
export const DEFAULT_WITUS_DISCOVERY_URL = "https://accounts.witus.online/api/idp/.well-known/openid-configuration";

/**
 * The redirect URI path the IdP registers for this app: `BETTER_AUTH_CB` in
 * gemini/witus/lib/identity/clients.ts (slug `assessments`). Better Auth 1.7 serves the callback at
 * /api/auth/callback/witus, so src/app/api/auth/oauth2/callback/[providerId]/route.ts 307s this path
 * there (the vogoat shim).
 */
export const WITUS_CALLBACK_PATH = "/api/auth/oauth2/callback/witus";

/** Used only off Vercel (local dev, `pnpm start`, CI). Never accepted on a Vercel runtime. */
export const DEV_AUTH_SECRET = "dev-only-secret-for-local-runs-not-for-vercel-000000";

/** Empty strings (a copied .env.example, `vercel env pull`) mean unset. */
export function blank(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value.trim() : undefined;
}

function withScheme(hostOrUrl: string): string {
  return /^https?:\/\//.test(hostOrUrl) ? hostOrUrl : `https://${hostOrUrl}`;
}

function origin(value: string): string {
  return new URL(withScheme(value)).origin;
}

/** Pooled connection for the app: `DATABASE_URL`, then the integration's `STORAGE_DATABASE_URL`. */
export function resolveDatabaseUrl(src: EnvSource): string | undefined {
  return blank(src.DATABASE_URL) ?? blank(src.STORAGE_DATABASE_URL);
}

export type DirectUrl = { url: string; source: string } | null;

/**
 * Direct (unpooled) connection for migrations. Falls back to the pooled URL so a laptop with only
 * DATABASE_URL still migrates; `source` names the variable (never its value) for the log.
 */
export function resolveDirectDatabaseUrl(src: EnvSource): DirectUrl {
  for (const name of ["DATABASE_URL_UNPOOLED", "STORAGE_DATABASE_URL_UNPOOLED", "DATABASE_URL", "STORAGE_DATABASE_URL"]) {
    const url = blank(src[name]);
    if (url) return { url, source: name };
  }
  return null;
}

export type BaseUrl = { url: string; source: string };

/**
 * The origin Better Auth uses for cookies, its own links, and the WitUS redirect URI.
 *
 * 1. `BETTER_AUTH_URL` (set it on Production: `https://assessments.witus.online`).
 * 2. `APP_URL`, the canonical origin the metadata already uses.
 * 3. On a Vercel production deployment, `VERCEL_PROJECT_PRODUCTION_URL` (Vercel picks the shortest
 *    custom production domain). On a preview, `VERCEL_URL`.
 * 4. Localhost.
 *
 * Steps 3 and 4 are fallbacks. The IdP matches the redirect URI exactly, so production sign-in is
 * only right when the result equals the registered origin; that is why task 11 sets step 1.
 */
export function resolveBaseUrl(src: EnvSource): BaseUrl {
  const explicit = blank(src.BETTER_AUTH_URL);
  if (explicit) return { url: origin(explicit), source: "BETTER_AUTH_URL" };
  const app = blank(src.APP_URL);
  if (app) return { url: origin(app), source: "APP_URL" };
  const production = blank(src.VERCEL_PROJECT_PRODUCTION_URL);
  if (blank(src.VERCEL_ENV) === "production" && production) {
    return { url: origin(production), source: "VERCEL_PROJECT_PRODUCTION_URL" };
  }
  const deployment = blank(src.VERCEL_URL);
  if (deployment) return { url: origin(deployment), source: "VERCEL_URL" };
  return { url: LOCAL_ORIGIN, source: "default" };
}

export type WitusProvider = { clientId: string; clientSecret: string; discoveryUrl: string };

/**
 * Sign in with WitUS is registered only when BOTH the client id and secret exist. The IdP treats
 * this app as a confidential client, so an id without a secret would fail at the token step
 * (`invalid_client`); keeping the provider inert instead keeps the button hidden and the build green.
 */
export function resolveWitusProvider(src: EnvSource): WitusProvider | null {
  const clientId = blank(src.WITUS_OIDC_CLIENT_ID);
  const clientSecret = blank(src.WITUS_OIDC_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, discoveryUrl: blank(src.WITUS_OIDC_DISCOVERY_URL) ?? DEFAULT_WITUS_DISCOVERY_URL };
}

/** Vercel sets `VERCEL=1` at build and at runtime. Nothing else in this app sets it. */
export function isOnVercel(src: EnvSource): boolean {
  return blank(src.VERCEL) === "1";
}

/** `next build` runs with NODE_ENV=production but is not a live server. */
export function isBuildPhase(src: EnvSource): boolean {
  return src.NEXT_PHASE === "phase-production-build";
}

/**
 * The development sign-in (magic link written to the server console). On in `next dev` and tests;
 * on for a local `next start` only with `E2E_DEV_SIGN_IN=1` (the Playwright run); NEVER on Vercel,
 * whatever else is set. Build plan 1.8: "The magic-link plugin is never registered in production."
 */
export function devSignInEnabled(src: EnvSource): boolean {
  if (isOnVercel(src)) return false;
  return src.NODE_ENV !== "production" || blank(src.E2E_DEV_SIGN_IN) === "1";
}

/**
 * The Better Auth secret. On a Vercel runtime a missing secret is an error (thrown when auth is
 * first used, so pages that never touch auth keep working and the build never needs it).
 * Everywhere else a fixed development secret stands in.
 */
export function resolveAuthSecret(src: EnvSource): string {
  const secret = blank(src.BETTER_AUTH_SECRET);
  if (secret) return secret;
  if (isOnVercel(src) && !isBuildPhase(src)) {
    throw new Error("BETTER_AUTH_SECRET is not set on this Vercel environment (docs/01-operations.md, Environment variables).");
  }
  return DEV_AUTH_SECRET;
}

export type DatabaseChoice = { driver: "neon"; url: string } | { driver: "pglite" };

/**
 * Neon when a URL exists. Embedded PGlite otherwise, except on Vercel, where a missing URL is an
 * error rather than a silent empty database in a serverless function.
 */
export function resolveDatabaseChoice(src: EnvSource): DatabaseChoice {
  const url = resolveDatabaseUrl(src);
  if (url) return { driver: "neon", url };
  if (isOnVercel(src)) {
    throw new Error("No database URL on this Vercel environment: expected STORAGE_DATABASE_URL from the Neon integration (docs/01-operations.md).");
  }
  return { driver: "pglite" };
}

/**
 * Origins allowed to call the auth API (Better Auth checks the Origin header on POSTs). The base
 * origin, plus the deployment and branch URLs Vercel assigns, so a preview opened by either URL
 * can still sign out.
 */
export function resolveTrustedOrigins(src: EnvSource): string[] {
  const candidates = [
    resolveBaseUrl(src).url,
    blank(src.APP_URL),
    blank(src.VERCEL_PROJECT_PRODUCTION_URL),
    blank(src.VERCEL_URL),
    blank(src.VERCEL_BRANCH_URL),
  ];
  return [...new Set(candidates.filter((v): v is string => Boolean(v)).map(origin))];
}
