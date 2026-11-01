# Operations runbook

How this app is deployed and what runs after a deploy. Tracked on purpose: the manual fallback for every
post-deploy step lives here, never only in a gitignored plan (WitUS post-deploy automation rule).

## Vercel project

The app is the Vercel project **`fit-t-cent-assessments`**. Settings the build depends on (Vercel dashboard,
Project, Settings, Build and Deployment):

| Setting | Value | Why |
| --- | --- | --- |
| Framework Preset | Next.js | The app is at the repo root; `next` is in the root `package.json`. |
| Root Directory | `.` (the repo root, field empty) | The spike has its own project; see below. |
| Install Command | default (`pnpm install`, from `pnpm-lock.yaml` and `packageManager`) | |
| Build Command | default (`next build`, through `pnpm build`) | |
| Output Directory | default | |
| Node.js Version | 24.x | Matches CI (`.github/workflows/ci.yml`). |
| Production Branch | `main` | |
| Domain | `assessments.witus.online` | BAM, 2026-11-01. Set up in user task 05. |

The separate project **`fit-t-cent-assessments-spike`** serves the static slow-motion test page from Root
Directory `spike/` with `spike/vercel.json`. It is unaffected by the app and is deleted after `/lab` replaces
the spike (user task 05, last step).

## Environment variables

Phase 1a builds and runs with **no** variables set; `src/lib/env.ts` treats every one as optional and
`.env.example` lists them.

| Variable | Where | Phase | Notes |
| --- | --- | --- | --- |
| `APP_URL` | Production | 1a, optional | Canonical origin for metadata (`https://assessments.witus.online`). Falls back to `VERCEL_PROJECT_PRODUCTION_URL`. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Production, Preview | 1a, optional | Shared ecosystem PostHog key. Empty means analytics off. User task 07. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Production, Preview | 1a, optional | `https://us.i.posthog.com`. The browser posts to `/ingest`, which `next.config.ts` proxies. |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Production, Preview | 1b | User task 05. |
| `WITUS_OIDC_CLIENT_ID`, `WITUS_OIDC_CLIENT_SECRET` | Production, Preview | 1b | User task 06. |
| `DATABASE_URL` (Neon) | Production, Preview | 1b | Vercel Neon integration. User task 05. |

## Security headers

`src/lib/security-headers.ts` builds them; `next.config.ts` sends them. Every route gets `nosniff`,
`Referrer-Policy`, `X-Frame-Options: DENY`, a `Permissions-Policy` that allows the camera on this origin
only, HSTS in production, and a CSP with `connect-src 'self'`. Routes under `/[lang]/assess/*` get a CSP
with `connect-src 'self' blob: data:` and `worker-src 'self' blob:`. Check a deploy with:

```bash
curl -sI https://assessments.witus.online/en | grep -i content-security-policy
curl -sI https://assessments.witus.online/en/assess/hurdle-clearance | grep -i content-security-policy
```

## Post-deploy steps

None yet. Phase 1b adds the first database migration, with `.github/workflows/migrate-production.yml`
(push to `main` touching the migrations folder, plus `workflow_dispatch`), the repository secret
`NEON_DIRECT_URL` (user task 05), and a manual fallback section here.

## Checks before a merge

```bash
pnpm install
pnpm check        # typecheck, lint (ESLint + scripts/check-copy.mjs), unit tests
pnpm build
pnpm test:e2e     # builds, starts the production server on :3070, runs Playwright
```

CI (`.github/workflows/ci.yml`) runs the same on every pull request and on `main`.
