/**
 * Security headers and the Content-Security-Policy, built in one place so next.config.ts stays
 * short and the policy is unit-tested (src/lib/security-headers.test.ts).
 *
 * Two policies, per the build plan (section 1.9, "Network policy"):
 *
 * - **Site policy** (every route): `connect-src 'self'`. PostHog is reached through the same-origin
 *   `/ingest` rewrite in next.config.ts, so analytics on the marketing pages never needs a vendor
 *   host here.
 * - **Analysis policy** (`/[lang]/assess/*`): `connect-src 'self' blob: data:` and
 *   `worker-src 'self' blob:`, the policy the spike proved. The pose worker and the vendored
 *   MediaPipe runtime fetch only from this origin, so even a telemetry path that the patch missed
 *   cannot leave the device's browser.
 *
 * `script-src` keeps `'unsafe-inline'` because Next's App Router hydration uses inline scripts and a
 * nonce would force every page to render dynamically. It includes `'wasm-unsafe-eval'` because the
 * MediaPipe runtime compiles WebAssembly (plan 1.9). Development adds `'unsafe-eval'`, which React's
 * dev tooling needs; production never gets it.
 *
 * `form-action 'self'`: Sign in with WitUS (phase 1b) starts with a client-side fetch and a
 * navigation, not a cross-origin form post. If 1b ever posts a form that redirects to
 * accounts.witus.online, add that origin here, on the sign-in route only.
 */

export type HeaderPair = { key: string; value: string };

type Directives = Record<string, string[]>;

function serialize(directives: Directives): string {
  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

function baseDirectives(isDev: boolean): Directives {
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "media-src": ["'self'", "blob:"],
    "connect-src": ["'self'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    ...(isDev ? {} : { "upgrade-insecure-requests": [] }),
  };
}

/** The policy for every route except the analysis pages. */
export function siteCsp(isDev: boolean): string {
  return serialize(baseDirectives(isDev));
}

/** The policy for `/[lang]/assess/*`: video decode and pose stay on this origin. */
export function analysisCsp(isDev: boolean): string {
  return serialize({
    ...baseDirectives(isDev),
    "connect-src": ["'self'", "blob:", "data:"],
    "worker-src": ["'self'", "blob:"],
  });
}

/** Headers sent on every route, besides the CSP. */
export function baseSecurityHeaders(isDev: boolean): HeaderPair[] {
  const headers: HeaderPair[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // Camera is for this origin only (live assessments, release 2). Everything else is off.
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
  ];
  if (!isDev) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  }
  return headers;
}

/** Route source patterns (next.config.ts `headers()` syntax). */
export const ALL_ROUTES = "/:path*";
export const ANALYSIS_ROUTES = "/:lang/assess/:path*";
