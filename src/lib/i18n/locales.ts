// Locale registry shared by src/proxy.ts and server code. Kept free of "server-only" so the
// proxy can import it; the dictionary loaders (server-only) live in ./dictionaries.ts.

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function hasLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** The locale the other link in the language switcher points at. */
export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "es" : "en";
}

/**
 * Picks a supported locale from an Accept-Language header, honouring q-values.
 * "es-MX,es;q=0.9,en;q=0.8" gives "es"; anything unsupported or malformed gives the default.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      const weight = q === undefined ? 1 : Number.parseFloat(q);
      return { base: tag.toLowerCase().split("-")[0] ?? "", weight: Number.isNaN(weight) ? 0 : weight, index };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const entry of ranked) {
    if (hasLocale(entry.base)) return entry.base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Where the proxy sends a path that has no locale prefix, or null to let it through.
 * "/" goes to "/es" for a Spanish browser; "/method" to "/en/method". API routes, Next internals,
 * the PostHog `/ingest` proxy and files with an extension pass through untouched.
 */
export function localeRedirectTarget(pathname: string, acceptLanguage: string | null): string | null {
  if (
    pathname.startsWith("/api/") ||
    pathname === "/api" ||
    pathname.startsWith("/_next/") ||
    // Rewritten to PostHog by next.config.ts. A locale redirect here would send events to
    // /en/ingest/... which matches no rewrite, and every event would be lost without an error.
    pathname.startsWith("/ingest/") ||
    /\.[^/]+$/.test(pathname)
  ) {
    return null;
  }
  const first = pathname.split("/")[1] ?? "";
  if (hasLocale(first)) return null;
  const locale = negotiateLocale(acceptLanguage);
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}
