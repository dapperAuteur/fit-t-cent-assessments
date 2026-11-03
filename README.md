# Fit T. Cent Assessments

Movement assessments from a phone camera, with pose estimation running on the device. This repo is being rebuilt as a Next.js app. The first release analyzes **track hurdle clearance** from a side-on slow-motion clip recorded on a phone; later releases add the overhead squat, single-leg squat, push and pull assessments (based on NASM's protocol) and the hurdle step screen (published criteria).

Not affiliated with or endorsed by NASM or Functional Movement Systems.

## Status

- Stage: building. Phase 1a (the app shell) is in: header with Sign in, footer, landing page in English and Spanish, security headers, tests and CI.
- Phase 1b adds accounts: Sign in with WitUS (Better Auth), a first-sign-in step that asks "Are you 18 or older?" and a role, Sign out for this app only, and the database (Neon in production, embedded PGlite locally) with its migration workflow. There is no pose analysis or saved result yet.
- The old browser prototype (Vite, plain JavaScript, Firebase) was retired from `main` on 2026-11-01. Its code is kept at the git tag [`legacy/vite-squat-prototype`](#legacy-prototype).
- The plan for what comes next lives in [docs/roadmap.md](docs/roadmap.md).

## Run it locally

Needs Node.js 22 or newer and pnpm 10 (`corepack enable` picks the version pinned in `package.json`). No environment variables are needed: with no database URL the app uses an embedded PGlite database under `.data/pglite` and applies the migrations itself, and with no WitUS client it offers a development sign-in instead.

```bash
pnpm install
pnpm dev            # http://localhost:3070 (redirects to /en or /es)
```

To sign in locally, open `/en/sign-in`, enter any address under "Development sign-in", and open the link the dev server prints in its console. The development sign-in never exists on Vercel. Sign in with WitUS appears once `WITUS_OIDC_CLIENT_ID` and `WITUS_OIDC_CLIENT_SECRET` are both set.

Database scripts:

```bash
pnpm db:generate    # after changing src/db/schema: writes a new migration under drizzle/
pnpm db:migrate     # applies drizzle/ to the Neon database named by DATABASE_URL_UNPOOLED (production runs this from CI)
```

Checks, the same ones CI runs:

```bash
pnpm check          # typecheck, lint (ESLint plus the copy rules in scripts/check-copy.mjs), unit tests
pnpm build          # production build
pnpm exec playwright install chromium   # once per machine
pnpm test:e2e       # builds, starts the production server on :3070, runs Playwright
pnpm test:smoke     # only the @smoke tests
```

The Playwright suite signs in with the development link against a throwaway database and walks the welcome step (adult and under 18) and Sign out; it also checks the header Sign in link, locale redirects, a real 404 status, the footer's not-affiliated line, the security headers and both CSPs, that the landing page makes no request off its own origin, axe in light and dark mode on every page, and no sideways scroll at 320 px. `@playwright/test` is pinned to 1.61.1 because 1.62 has no browser builds for macOS 13.

Optional variables are listed in [.env.example](.env.example); copy it to `.env.local` to set them. Deploy settings, the variables Vercel needs, and the post-deploy runbook (database migrations) are in [docs/01-operations.md](docs/01-operations.md).

## What is on `main` today

```
.
├── src/
│   ├── app/[lang]/         Every page, under /en and /es
│   │   ├── (marketing)/    Landing page; the only place PostHog loads
│   │   ├── sign-in/        Sign in with WitUS (and the development sign-in locally)
│   │   ├── welcome/        First sign-in: 18 or older, then role
│   │   └── adults-only/    Where an under-18 answer lands
│   ├── app/api/auth/       Better Auth, plus the WitUS callback shim
│   ├── components/         Site header (Sign in / Sign out), footer, auth controls
│   ├── db/schema/          Drizzle tables (Better Auth's, with role and adult confirmation time)
│   ├── dictionaries/       en.json and es.json: every user-facing string
│   ├── lib/                auth, session, env resolution, welcome step, i18n, security headers, analytics
│   └── proxy.ts            Sends locale-less paths to /en or /es
├── drizzle/                Generated SQL migrations (applied by the migrate workflow)
├── scripts/migrate.ts      Applies drizzle/ to Neon (CI and the manual fallback)
├── tests/e2e/              Playwright: sign-in flows, smoke, accessibility, layout
├── scripts/check-copy.mjs  Bans dashes, stock words and the banned names in copy
├── docs/
│   ├── 01-operations.md    Vercel settings, env vars, post-deploy runbook
│   ├── roadmap.md          Roadmap in the WitUS shared format
│   └── research/           UI/UX/DX research, stack SWOT, pose benchmark harness
└── spike/                  Slow-motion frame test page (static, its own Vercel project)
```

- **`docs/research/`** holds the research the rebuild is based on: protocol checkpoints, screen flows, accessibility, test layers, and the stack comparison with measured pose timings.
- **`spike/`** is a static page that checks whether a 120 or 240 fps slow-motion clip picked on a phone reaches the browser with every frame, and how long decode and pose take. It is not part of the app and is excluded from its lint, typecheck and tests; see [spike/README.md](spike/README.md). It stays on `main` until the app's `/lab` page covers the same checks, then it is retired the same way as the prototype (tagged, then removed).

## Stack

- Next.js 16 App Router on Vercel, TypeScript strict, pnpm, Tailwind CSS v4, ESLint, Vitest, Playwright with axe.
- English and Spanish from day one, from dictionary files.
- Sign in with WitUS through Better Auth (pinned 1.7.14), Neon Postgres with Drizzle (embedded PGlite locally).
- Coming in later phases: analysis pages that render on the client only, with decoding and pose in one module Web Worker running a pinned, self-hosted copy of MediaPipe Tasks Vision.
- Video stays on the device. Saved results will hold numbers and, if the user allows it, body landmarks for the analyzed window; never video or frames.

## Legacy prototype

The first version of this repo was a browser prototype of the overhead squat assessment. It read the live camera feed, tracked 33 body landmarks with the legacy `@mediapipe/pose` scripts from jsDelivr (unpinned), counted squat reps from the knee angle, and flagged three compensations (arms falling forward, excessive forward lean, knees moving inward). It offered guest mode and Firebase email sign-in; its Save and Share buttons were never wired up. It had no tests, no linter and no CI, and it was deployed by hand to Firebase Hosting.

It was removed from `main` because the rebuild replaces it, and keeping a second `package.json` with the `firebase` dependency tree in `main` would keep known transitive vulnerability alerts open. Nothing was lost: the annotated tag `legacy/vite-squat-prototype` points at the last commit that has it (`03efb85`), including its full README.

```bash
git fetch --tags
git checkout legacy/vite-squat-prototype   # detached HEAD; frontend-app/ and the Firebase files are here
git show legacy/vite-squat-prototype:README.md
```

Removed from `main` in that change: `frontend-app/` (the Vite app), `lib/firebase.ts` (unused), `firebase.json`, `.firebaserc`, and `404.html` (the Firebase CLI starter page). The Firebase project itself was not changed by removing these files.

## Privacy

Signing in creates an account in this app's database with your name, email address and profile picture link from WitUS, the time you confirmed you are 18 or older (never a birth date), and the role you picked. Answering "No, I am under 18" signs you out and deletes that account row. Sign out ends only this app's session; your WitUS session stays as it is. No analysis results are stored yet. The marketing pages can send anonymous page views to PostHog (no cookies, no local storage, no session recording) once a key is set; no other page loads analytics. Every page's Content-Security-Policy limits network requests to the app's own origin. The spike page processes a clip in the browser and blocks requests that leave its own origin.

## Working on this repo

Work happens on branches; `main` changes only by merge. A tracked hook in `.githooks/pre-commit` refuses commits made directly on `main` or `master`. Git does not run tracked hooks on its own, so activate it once in every clone:

```bash
git config core.hooksPath .githooks
```

Repo conventions for AI-assisted work live in [CLAUDE.md](CLAUDE.md).

## License

The repo has no LICENSE file, so no open-source license is granted.

## Roadmap

See [docs/roadmap.md](docs/roadmap.md). It feeds the roadmap page on the witus.online admin.
