import { describe, expect, it } from "vitest";
import {
  DEFAULT_WITUS_DISCOVERY_URL,
  DEV_AUTH_SECRET,
  devSignInEnabled,
  LOCAL_ORIGIN,
  resolveAuthSecret,
  resolveBaseUrl,
  resolveDatabaseChoice,
  resolveDatabaseUrl,
  resolveDirectDatabaseUrl,
  resolveTrustedOrigins,
  resolveWitusProvider,
} from "./runtime-env";

// Fake values only. None of these is a real host, secret or connection string.
const POOLED = "postgres://u:p@pooled.example.invalid/db";
const DIRECT = "postgres://u:p@direct.example.invalid/db";
const PLAIN = "postgres://u:p@plain.example.invalid/db";

describe("database URL resolution", () => {
  it("falls back to the Vercel Neon integration's STORAGE_ names", () => {
    expect(resolveDatabaseUrl({ STORAGE_DATABASE_URL: POOLED })).toBe(POOLED);
  });

  it("prefers a plain DATABASE_URL over the STORAGE_ name", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: PLAIN, STORAGE_DATABASE_URL: POOLED })).toBe(PLAIN);
  });

  it("treats empty and whitespace values as unset", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "", STORAGE_DATABASE_URL: "  " })).toBeUndefined();
    expect(resolveDatabaseUrl({ DATABASE_URL: " ", STORAGE_DATABASE_URL: POOLED })).toBe(POOLED);
  });

  it("migrations prefer the direct URL, DATABASE_URL_UNPOOLED first, then STORAGE_DATABASE_URL_UNPOOLED", () => {
    expect(resolveDirectDatabaseUrl({ STORAGE_DATABASE_URL_UNPOOLED: DIRECT, STORAGE_DATABASE_URL: POOLED })).toEqual({
      url: DIRECT,
      source: "STORAGE_DATABASE_URL_UNPOOLED",
    });
    expect(
      resolveDirectDatabaseUrl({ DATABASE_URL_UNPOOLED: PLAIN, STORAGE_DATABASE_URL_UNPOOLED: DIRECT }),
    ).toEqual({ url: PLAIN, source: "DATABASE_URL_UNPOOLED" });
  });

  it("migrations fall back to a pooled URL, and to null when nothing is set", () => {
    expect(resolveDirectDatabaseUrl({ STORAGE_DATABASE_URL: POOLED })?.source).toBe("STORAGE_DATABASE_URL");
    expect(resolveDirectDatabaseUrl({})).toBeNull();
  });

  it("uses Neon when a URL exists, PGlite off Vercel, and refuses PGlite on Vercel", () => {
    expect(resolveDatabaseChoice({ STORAGE_DATABASE_URL: POOLED, VERCEL: "1" })).toEqual({ driver: "neon", url: POOLED });
    expect(resolveDatabaseChoice({ NODE_ENV: "production" })).toEqual({ driver: "pglite" });
    expect(() => resolveDatabaseChoice({ VERCEL: "1" })).toThrow(/No database URL/);
  });
});

describe("Sign in with WitUS provider", () => {
  it("is inert without a client id", () => {
    expect(resolveWitusProvider({ WITUS_OIDC_CLIENT_SECRET: "s" })).toBeNull();
    expect(resolveWitusProvider({ WITUS_OIDC_CLIENT_ID: "", WITUS_OIDC_CLIENT_SECRET: "s" })).toBeNull();
  });

  it("is inert without a client secret (a confidential client would fail with invalid_client)", () => {
    expect(resolveWitusProvider({ WITUS_OIDC_CLIENT_ID: "id" })).toBeNull();
  });

  it("is on with both, using the accounts.witus.online discovery document by default", () => {
    expect(resolveWitusProvider({ WITUS_OIDC_CLIENT_ID: "id", WITUS_OIDC_CLIENT_SECRET: "s" })).toEqual({
      clientId: "id",
      clientSecret: "s",
      discoveryUrl: DEFAULT_WITUS_DISCOVERY_URL,
    });
    expect(DEFAULT_WITUS_DISCOVERY_URL).toBe("https://accounts.witus.online/api/idp/.well-known/openid-configuration");
  });

  it("honors a discovery override", () => {
    const p = resolveWitusProvider({
      WITUS_OIDC_CLIENT_ID: "id",
      WITUS_OIDC_CLIENT_SECRET: "s",
      WITUS_OIDC_DISCOVERY_URL: "https://idp.example.invalid/.well-known/openid-configuration",
    });
    expect(p?.discoveryUrl).toBe("https://idp.example.invalid/.well-known/openid-configuration");
  });
});

describe("Better Auth base URL", () => {
  it("uses BETTER_AUTH_URL first, as an origin", () => {
    expect(
      resolveBaseUrl({
        BETTER_AUTH_URL: "https://assessments.witus.online/",
        APP_URL: "https://other.example.invalid",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app",
      }),
    ).toEqual({ url: "https://assessments.witus.online", source: "BETTER_AUTH_URL" });
  });

  it("then APP_URL", () => {
    expect(resolveBaseUrl({ APP_URL: "https://assessments.witus.online" }).source).toBe("APP_URL");
  });

  it("on a Vercel production deployment, the project's production domain", () => {
    expect(resolveBaseUrl({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "assessments.witus.online", VERCEL_URL: "abc.vercel.app" })).toEqual({
      url: "https://assessments.witus.online",
      source: "VERCEL_PROJECT_PRODUCTION_URL",
    });
  });

  it("on a preview, the deployment URL, never the production domain", () => {
    expect(resolveBaseUrl({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "assessments.witus.online", VERCEL_URL: "abc.vercel.app" })).toEqual({
      url: "https://abc.vercel.app",
      source: "VERCEL_URL",
    });
  });

  it("locally, port 3070", () => {
    expect(resolveBaseUrl({})).toEqual({ url: LOCAL_ORIGIN, source: "default" });
  });

  it("trusts the base, deployment and branch origins, without duplicates", () => {
    expect(
      resolveTrustedOrigins({
        BETTER_AUTH_URL: "https://assessments.witus.online",
        VERCEL_PROJECT_PRODUCTION_URL: "assessments.witus.online",
        VERCEL_URL: "abc.vercel.app",
        VERCEL_BRANCH_URL: "branch.vercel.app",
      }),
    ).toEqual(["https://assessments.witus.online", "https://abc.vercel.app", "https://branch.vercel.app"]);
  });
});

describe("auth secret", () => {
  it("uses the configured secret", () => {
    expect(resolveAuthSecret({ BETTER_AUTH_SECRET: "configured-secret", VERCEL: "1" })).toBe("configured-secret");
  });

  it("refuses to run on Vercel without one", () => {
    expect(() => resolveAuthSecret({ VERCEL: "1", NODE_ENV: "production" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("does not need one during the Vercel build", () => {
    expect(resolveAuthSecret({ VERCEL: "1", NEXT_PHASE: "phase-production-build" })).toBe(DEV_AUTH_SECRET);
  });

  it("uses the development secret off Vercel", () => {
    expect(resolveAuthSecret({ NODE_ENV: "production" })).toBe(DEV_AUTH_SECRET);
  });
});

describe("development sign-in", () => {
  it("is on in development and tests", () => {
    expect(devSignInEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(devSignInEnabled({ NODE_ENV: "test" })).toBe(true);
  });

  it("is off for a production server unless the Playwright flag is set", () => {
    expect(devSignInEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(devSignInEnabled({ NODE_ENV: "production", E2E_DEV_SIGN_IN: "1" })).toBe(true);
  });

  it("is never on Vercel, whatever else is set", () => {
    expect(devSignInEnabled({ VERCEL: "1", NODE_ENV: "development" })).toBe(false);
    expect(devSignInEnabled({ VERCEL: "1", NODE_ENV: "production", E2E_DEV_SIGN_IN: "1" })).toBe(false);
  });
});
