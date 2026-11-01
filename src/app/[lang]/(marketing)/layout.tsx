import { PostHogProvider } from "@/lib/analytics/posthog-provider";
import { env } from "@/lib/env";

/**
 * Marketing pages only (landing now; /method, /privacy, /terms in phase 7). This is the one place
 * PostHog mounts, so pages outside this group (assessments, results, coach) load no analytics
 * (build plan section 1.9, mitigation 9). Keyless is a supported state: with no key the provider
 * renders nothing and sends nothing, which is how previews and CI run.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* "/ingest" is proxied to PostHog by next.config.ts, so the CSP keeps connect-src 'self'. */}
      <PostHogProvider apiKey={env.NEXT_PUBLIC_POSTHOG_KEY ?? null} apiHost="/ingest" />
    </>
  );
}
