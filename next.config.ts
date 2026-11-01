import type { NextConfig } from "next";
import {
  ALL_ROUTES,
  ANALYSIS_ROUTES,
  analysisCsp,
  baseSecurityHeaders,
  siteCsp,
} from "./src/lib/security-headers";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // PostHog's endpoints use trailing slashes; without this Next 308s to the slashless form
  // before the rewrite runs and ingest breaks (PostHog's documented Next.js proxy setup).
  // Side effect: disables the automatic trailing-slash redirect for every route.
  skipTrailingSlashRedirect: true,

  async rewrites() {
    // Reverse-proxy PostHog through our origin: content blockers have nothing to match on, and
    // the CSP keeps `connect-src 'self'` on every page.
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },

  async headers() {
    // When two entries set the same key on a path, the later entry wins, so the analysis
    // routes' stricter-for-media CSP must come after the site-wide one.
    return [
      {
        source: ALL_ROUTES,
        headers: [...baseSecurityHeaders(isDev), { key: "Content-Security-Policy", value: siteCsp(isDev) }],
      },
      {
        source: ANALYSIS_ROUTES,
        headers: [{ key: "Content-Security-Policy", value: analysisCsp(isDev) }],
      },
    ];
  },
};

export default nextConfig;
