import { z } from "zod";

/**
 * Environment, validated once. Phase 1a needs no variable to build or run: everything here is
 * optional, so `next build` passes in CI and on a fresh Vercel project with nothing set.
 * Phase 1b adds the auth and database variables (see .env.example).
 *
 * `NEXT_PUBLIC_` only for values the browser needs (shared UI/UX/DX, DX rules).
 */
const schema = z.object({
  /** Canonical origin for metadata. Production host decided by BAM on 2026-11-01. */
  APP_URL: z.url().optional(),
  /** Set by Vercel on every deployment, without the scheme. */
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  /** Shared ecosystem PostHog project key. Missing means analytics is off (a supported state). */
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  /** The real upstream host (US). The browser posts to /ingest; next.config.ts proxies it. */
  NEXT_PUBLIC_POSTHOG_HOST: z.url().optional(),
});

// Empty strings from `vercel env pull` or a copied .env.example mean "unset".
const raw = Object.fromEntries(
  Object.entries({
    APP_URL: process.env.APP_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  }).filter(([, value]) => value !== undefined && value !== ""),
);

export const env = schema.parse(raw);

/** The origin used for absolute URLs in metadata. */
export function appUrl(): string {
  if (env.APP_URL) return env.APP_URL;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3070";
}
