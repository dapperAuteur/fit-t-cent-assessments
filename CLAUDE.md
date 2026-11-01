## ⚠️ Ecosystem repo identity (don't confuse these)

This repo, **fit-t-cent-assessments** (GitHub `dapperAuteur/fit-t-cent-assessments`, **public**), is
**Fit T. Cent Assessments**: a portfolio app that analyzes movement from a phone camera with pose estimation
on the device. Release 1 is **track hurdle clearance** from a side-on slow-motion clip; later releases add the
overhead squat, single-leg squat, push and pull assessments (based on NASM's protocol) and the hurdle step
screen (published criteria). Production host (planned): `https://assessments.witus.online`, Sign in with
WitUS client slug `assessments`. Users are athletes and a coach, **adults only (18+) through release 3**.

Don't confuse it with:
- `ai-builds/claude/lang-chain/centenarian-coach-multiagent`: Centenarian Coach, where "The Story of Fit T.
  Cent" lives. Its OIDC slug is `coach`; this app's is `assessments`.
- `ai-builds/claude/cent-agility`: the Agility Engine (timed drills), excluded from the ecosystem.
- `ai-builds/gemini/centenarian-academy`: the NASM certification LMS, excluded from the ecosystem.
- `projects/fit-t-cent-blogging`: the retired 2024 blog.
- `cent/fit-t-cent-assessments copy` and `cent/fit-t-cent-assessments-main.zip` next to this repo: stale
  copies. Never edit them; this folder is the only working copy.

The site **brandanthonymcdonald.com** (BAM's personal portfolio) lives in
`/Users/bam/Code_NOiCloud/ai-builds/claude/bam-landing-page/`, **NOT** `bam-portfolio`.
`/Users/bam/Code_NOiCloud/projects/bam-portfolio/` is the retired legacy site: do not edit, revive or delete it.

Full ecosystem identity and product index: `gemini/witus/CLAUDE.md` and `gemini/witus/lib/products.ts`.
Vetting analysis and BAM's override: `gemini/witus/plans/35-fit-t-cent-assessments-analysis.md`. Build plan
(approved 2026-11-01): `plans/01-portfolio-app-build-plan.md` in this repo (local, gitignored).

## This repo is public

`plans/` is gitignored and holds BAM's private planning notes. Never commit it, never quote it in a commit
message, README or issue, and never commit fixture clips or landmarks of anyone but BAM unless their written
release covers a public repo (operator task 08).

## Naming and copy rules (every screen, file and commit)

- Say "Overhead squat assessment (based on NASM's protocol)" and "Hurdle step screen (published criteria)".
  Footer line on every page: "Not affiliated with or endorsed by NASM or Functional Movement Systems."
- Never "NASM assessment", "FMS score", a 21-point total, "AI coach", "injury risk", or "accurate to X degrees".
- Flags are screening suggestions a coach confirms. No medical or diagnostic language.

## Stack (decided 2026-11-01; app scaffold not on `main` yet)

- Next.js App Router on Vercel, TypeScript strict, pnpm, Tailwind v4, ESLint, Vitest, Playwright with axe.
- Better Auth with the `genericOAuth` provider `witus` (Sign in with WitUS), callback
  `/api/auth/oauth2/callback/witus`; dev uses PGlite and a console magic link (vogoat pattern).
- Neon Postgres with Drizzle. Post-deploy migrations run from `.github/workflows/migrate-production.yml`.
- Analysis pages are client-only. Decode and pose run in one module Web Worker with a pinned, self-hosted,
  telemetry-patched `@mediapipe/tasks-vision`; analysis routes send `connect-src 'self' blob: data:`.
- **Video never leaves the device by default.** The server stores small JSON and, if allowed, quantized
  landmarks for the analyzed window; never video, frames or key-frame images.
- English and Spanish from day one. PostHog on marketing pages only, never on `/assess/*`, `/results/*`,
  `/coach/*`.

## What is on `main` today

- `docs/research/`: UI/UX/DX research, stack SWOT, pose benchmark harness.
- `spike/`: static slow-motion frame test page; retired (tagged, then removed) once `/lab` covers it.
- The old Vite + Firebase prototype is at the git tag `legacy/vite-squat-prototype`, not on `main`.

## Commit guard

`.githooks/pre-commit` refuses commits on `main` or `master`. Activate it once per clone:

```bash
git config core.hooksPath .githooks
```
