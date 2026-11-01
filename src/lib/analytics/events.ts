/**
 * Event taxonomy for assessments.witus.online.
 *
 * The ecosystem shares ONE PostHog project, separated by the `app` property that
 * posthog-provider registers on load. Two rules keep that project readable:
 *
 *   1. `snake_case`, object first, verb in past tense (`route_viewed`).
 *   2. NEVER put the app name in the event name. The `app` property already carries it.
 *
 * Where analytics runs in this app: the marketing pages only (`src/app/[lang]/(marketing)`).
 * Never on assessment, results or coach pages, and never with video, frames, landmarks, scores
 * or anything the user typed (build plan section 1.9, mitigation 9). Phase 6 adds one
 * server-side count per saved result carrying the assessment kind only.
 *
 * See gemini/witus/plans/26-posthog-ecosystem-rollout.md for the full contract.
 */

/**
 * Matches this app's slug in gemini/witus/lib/identity/clients.ts (`assessments`). The analytics
 * slug is the identity slug (witus lib/analytics/INTEGRATE.md step 4), so a funnel can join PostHog
 * events to the app that authenticated the user.
 */
export const ANALYTICS_APP = "assessments";

/** Events with identical names across every ecosystem app. Names are contractual. */
export const SHARED_EVENTS = {
  signinStarted: "signin_started",
  signinSucceeded: "signin_succeeded",
  signinFailed: "signin_failed",
} as const;

export const EVENTS = {
  /** An explicit route view. capture_pageview is off: Next's client router would fire it once
   *  and then under-report every client-side navigation. */
  routeViewed: "route_viewed",
  ...SHARED_EVENTS,
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
