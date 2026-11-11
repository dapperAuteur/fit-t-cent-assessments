import { Analytics } from "@vercel/analytics/next";
import { PostHogProvider } from "@/lib/analytics/posthog-provider";
import { env } from "@/lib/env";

/**
 * Marketing pages only (landing now; /method, /privacy, /terms in phase 7). This is the one place
 * PostHog mounts, so pages outside this group (assessments, results, coach) load no analytics
 * (build plan section 1.9, mitigation 9). Keyless is a supported state: with no key the provider
 * renders nothing and sends nothing, which is how previews and CI run.
 *
 * Vercel Web Analytics mounts here too, not in the root layout, for the same reason: plan 01
 * section 1.9 (mitigation 9) promises no analytics on the assessment, results and coach pages.
 * Its Next integration sends pageviews from this component (auto-tracking is off), so once a
 * visitor leaves this group nothing more is sent.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* "/ingest" is proxied to PostHog by next.config.ts, so the CSP keeps connect-src 'self'. */}
      <PostHogProvider apiKey={env.NEXT_PUBLIC_POSTHOG_KEY ?? null} apiHost="/ingest" />
      {/* Vercel Web Analytics: cookieless pageview counts + Web Vitals, no consent surface.
          Complements PostHog (which owns product events, witus plans/26) rather than replacing it.
          Same-origin (/_vercel/insights), so the CSP keeps connect-src 'self'. Sends nothing
          until Web Analytics is enabled on the Vercel project. */}
      <Analytics />
    </>
  );
}
