import { describe, expect, it } from "vitest";
import { localeRedirectTarget, negotiateLocale, otherLocale } from "./locales";

describe("negotiateLocale", () => {
  it("defaults to English with no header", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("")).toBe("en");
  });

  it("picks Spanish from a regional tag", () => {
    expect(negotiateLocale("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
  });

  it("honours q-values over order", () => {
    expect(negotiateLocale("es;q=0.4,en;q=0.9")).toBe("en");
  });

  it("skips unsupported languages and q=0", () => {
    expect(negotiateLocale("fr-FR,de;q=0.9,es;q=0.5")).toBe("es");
    expect(negotiateLocale("es;q=0,fr")).toBe("en");
  });
});

describe("localeRedirectTarget", () => {
  it("sends the bare domain to the negotiated locale", () => {
    expect(localeRedirectTarget("/", null)).toBe("/en");
    expect(localeRedirectTarget("/", "es")).toBe("/es");
  });

  it("prefixes locale-less pages", () => {
    expect(localeRedirectTarget("/sign-in", null)).toBe("/en/sign-in");
  });

  it("leaves localized pages alone", () => {
    expect(localeRedirectTarget("/en", null)).toBeNull();
    expect(localeRedirectTarget("/es/sign-in", "en")).toBeNull();
  });

  it("never redirects the PostHog proxy, API routes, Next internals or files", () => {
    expect(localeRedirectTarget("/ingest/e/", null)).toBeNull();
    expect(localeRedirectTarget("/api/auth/session", null)).toBeNull();
    expect(localeRedirectTarget("/_next/static/chunk.js", null)).toBeNull();
    expect(localeRedirectTarget("/icon.svg", null)).toBeNull();
  });
});

describe("otherLocale", () => {
  it("flips between the two locales", () => {
    expect(otherLocale("en")).toBe("es");
    expect(otherLocale("es")).toBe("en");
  });
});
