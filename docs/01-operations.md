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
| Node.js Version | 22.x | Matches CI (`.github/workflows/ci.yml`), the dev machine, and user task 05. |
| Production Branch | `main` | |
| Domain | `assessments.witus.online` | BAM, 2026-11-01. Set up in user task 05. |

The separate project **`fit-t-cent-assessments-spike`** serves the static slow-motion test page from Root
Directory `spike/` with `spike/vercel.json`. It is unaffected by the app and is deleted after `/lab` replaces
the spike (user task 05, last step).

## Environment variables

The app builds with **no** variables set. `src/lib/env.ts` (metadata, PostHog) treats every one as optional,
and the auth and database settings are resolved per call by the pure functions in `src/lib/runtime-env.ts`
(unit-tested in `src/lib/runtime-env.test.ts`). `.env.example` lists them all.

| Variable | Where | Phase | Notes |
| --- | --- | --- | --- |
| `APP_URL` | Production | 1a, optional | Canonical origin for metadata (`https://assessments.witus.online`). Falls back to `VERCEL_PROJECT_PRODUCTION_URL`. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Production, Preview | 1a, optional | Shared ecosystem PostHog key. Empty means analytics off. User task 07. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Production, Preview | 1a, optional | `https://us.i.posthog.com`. The browser posts to `/ingest`, which `next.config.ts` proxies. |
| `BETTER_AUTH_SECRET` | Production, Preview | 1b, **required on Vercel** | Missing on a Vercel runtime = every `/api/auth/*` call fails and the header stays on "Sign in". Off Vercel a fixed development secret is used. |
| `BETTER_AUTH_URL` | Production | 1b | `https://assessments.witus.online`. Empty = `APP_URL`, then `VERCEL_PROJECT_PRODUCTION_URL` on production or `VERCEL_URL` on a preview, then `http://localhost:3070`. The WitUS redirect URI is built from it and the IdP matches it exactly, so set it on Production. |
| `WITUS_OIDC_CLIENT_ID`, `WITUS_OIDC_CLIENT_SECRET` | Production | 1b | User task 06. **Both** set = the Sign in with WitUS button appears; either missing = the provider is not registered at all. Previews have neither, because the IdP registers only the production redirect URI. |
| `WITUS_OIDC_DISCOVERY_URL` | optional | 1b | Override; default `https://accounts.witus.online/api/idp/.well-known/openid-configuration`. |
| `STORAGE_DATABASE_URL`, `STORAGE_DATABASE_URL_UNPOOLED` | Production, Preview | 1b | Set by the Vercel Neon integration (prefix `STORAGE_`). The app reads `DATABASE_URL ?? STORAGE_DATABASE_URL` (pooled); migrations read `DATABASE_URL_UNPOOLED ?? STORAGE_DATABASE_URL_UNPOOLED` first. On Vercel a missing URL is an error, never an empty embedded database. |
| `E2E_DEV_SIGN_IN`, `PGLITE_DIR`, `DEV_MAGIC_LINK_LOG` | local and CI only | 1b | Set by `playwright.config.ts`. `E2E_DEV_SIGN_IN=1` turns on the development sign-in for a local `next start`; it is ignored whenever `VERCEL=1`. |

## Sign in with WitUS

- Better Auth 1.7.14 (pinned) with the `genericOAuth` provider `witus`: discovery on accounts.witus.online,
  PKCE, scopes `openid email profile`. Client slug `assessments`, registered in gemini/witus
  `lib/identity/clients.ts` with the redirect URI `https://assessments.witus.online/api/auth/oauth2/callback/witus`.
- Better Auth 1.7 handles the callback at `/api/auth/callback/witus`, so
  `src/app/api/auth/oauth2/callback/[providerId]/route.ts` 307s the registered path there with the query intact.
- "Sign out" ends only this app's session (`disableProviderLogout: true`, pinned by
  `src/lib/sign-out-local-only.test.ts`). The WitUS session and other WitUS apps stay signed in.
- After every sign-in the browser lands on `/{lang}/welcome`: "Are you 18 or older?" (yes stores the time in
  `user.adult_confirmed_at`; no signs out and deletes this app's user row), then the role (athlete, coach,
  both). A finished account goes straight home.
- Locally (and in the Playwright run) a development sign-in prints a magic link to the server console. It is
  never registered on Vercel.
- Failed sign-ins land on `/{lang}/sign-in?error=...` with an alert.

Check a production deploy by hand: private window, https://assessments.witus.online, Sign in, Sign in with
WitUS. An `invalid_client` error means the client secret on this project does not match the IdP's; a
`redirect_uri` error means `BETTER_AUTH_URL` is not exactly `https://assessments.witus.online`.

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

### Database migrations

Schema lives in `src/db/schema/` (Drizzle); generated SQL lives in `drizzle/` (first migration
`0000_auth_tables.sql`). Locally nothing needs running: embedded PGlite applies `drizzle/` on first use under
`.data/pglite`.

**Automatic.** `.github/workflows/migrate-production.yml` runs on every push to `main` that changes a file
under `drizzle/`, and on demand (GitHub, Actions, "Migrate production database", Run workflow). It reads the
repository secret `NEON_DIRECT_URL`, runs `pnpm db:migrate` (`scripts/migrate.ts`), and writes the applied
migration list to the run summary. Without the secret it fails at its first step with
`::error::Set the repository secret NEON_DIRECT_URL ...`. Runs never overlap (`concurrency`, no cancel).

**The secret**, set once, piped so the value is never pasted or shown. The Neon project is `assessments-db`,
created by the Vercel integration in its Vercel-managed Neon organization; its default branch is `main`:

```bash
neon connection-string main --project-id <assessments-db project id> | gh secret set NEON_DIRECT_URL --repo dapperAuteur/fit-t-cent-assessments
```

`neon connection-string` prints the direct (unpooled) string unless `--pooled` is passed. Find the project id
with `neon projects list --org-id <org id>` (`neon orgs list` shows the org ids).

**Manual fallback** (the workflow is broken or GitHub is down), from the repo root on a laptop:

```bash
pnpm install
# Either pipe the URL into the environment of one command (nothing is written to disk or history):
DATABASE_URL_UNPOOLED="$(neon connection-string main --project-id <assessments-db project id>)" pnpm db:migrate
# or keep it in a git-ignored .env.prod (DATABASE_URL_UNPOOLED=...) and let Node read it:
pnpm db:migrate:file
```

Expected output: `Using DATABASE_URL_UNPOOLED. Applying migrations from ./drizzle`, then
`Migrations applied: N of N in the journal.` The script prints the variable's name, never its value. Do not
`source` a dotenv file: shells break on the `&` in Neon URLs.

**Adding a migration:** change `src/db/schema/`, run `pnpm db:generate` (never rename the generated file),
commit the new file under `drizzle/` with the code that needs it, and keep it additive so the deployed code
keeps working while the workflow runs. Vercel deploys the same push in parallel; pages that need a new table
can fail for about a minute until the job finishes.

### Neon preview branches

`.github/workflows/neon-preview-cleanup.yml` is the ecosystem copy (synced from gemini/witus
`.github/templates/neon-preview-cleanup.yml`; edit the template, not this file). It deletes each
`preview/<branch>` Neon branch whose git branch is merged or gone. It needs the repository variable
`NEON_PROJECT_ID` and the project-scoped secret `NEON_API_KEY` (user task 05, step 5).

## Checks before a merge

```bash
pnpm install
pnpm check        # typecheck, lint (ESLint + scripts/check-copy.mjs), unit tests
pnpm build
pnpm test:e2e     # builds, starts the production server on :3070, runs Playwright
```

CI (`.github/workflows/ci.yml`) runs the same on every pull request and on `main`.
