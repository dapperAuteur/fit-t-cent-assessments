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

## Stack (decided 2026-11-01; scaffold landed in phase 1a, `feat/scaffold-next`)

- Next.js 16.4 App Router on Vercel at the **repo root**, TypeScript strict, pnpm, Tailwind v4, ESLint, Vitest,
  Playwright with axe (pinned to 1.61.1: 1.62 has no browsers for macOS 13).
- Every page lives under `src/app/[lang]` (`en`, `es`); `src/proxy.ts` redirects locale-less paths. Strings
  live in `src/dictionaries/{en,es}.json` via `getDictionary(lang)`; no string literals in components.
  Claude drafts Spanish; a fluent reviewer checks it before each release (BAM, 2026-11-01).
- Security headers and both CSPs are built in `src/lib/security-headers.ts` and wired in `next.config.ts`:
  `connect-src 'self'` on every page, plus `blob: data:` and `worker-src 'self' blob:` on
  `/[lang]/assess/*`. PostHog mounts only in `src/app/[lang]/(marketing)/layout.tsx`.
- Checks: `pnpm check` (typecheck, lint incl. `scripts/check-copy.mjs`, unit tests), `pnpm build`,
  `pnpm test:e2e` (builds, then runs smoke, axe, 320 px and header checks). CI runs all of them.
- Better Auth (phase 1b) with the `genericOAuth` provider `witus` (Sign in with WitUS), callback
  `/api/auth/oauth2/callback/witus`; dev uses PGlite and a console magic link (vogoat pattern).
- Neon Postgres with Drizzle (phase 1b). Post-deploy migrations run from `.github/workflows/migrate-production.yml`.
- Analysis pages are client-only. Decode and pose run in one module Web Worker with a pinned, self-hosted,
  telemetry-patched `@mediapipe/tasks-vision`; analysis routes send `connect-src 'self' blob: data:`.
- **Video never leaves the device by default.** The server stores small JSON and, if allowed, quantized
  landmarks for the analyzed window; never video, frames or key-frame images.
- English and Spanish from day one. PostHog on marketing pages only, never on `/assess/*`, `/results/*`,
  `/coach/*`.

## What is on `main` today

- The Next.js app (once `feat/scaffold-next` merges): header with Sign in, footer, landing and sign-in
  placeholders in English and Spanish. No auth, pose or database yet (phases 1b to 6).
- `docs/01-operations.md`: deploy settings, env vars, and the post-deploy runbook (empty until 1b).
- `docs/research/`: UI/UX/DX research, stack SWOT, pose benchmark harness.
- `spike/`: static slow-motion frame test page, deployed by its own Vercel project (Root Directory `spike/`);
  excluded from the app's lint, typecheck and tests. Retired (tagged, then removed) once `/lab` covers it.
- The old Vite + Firebase prototype is at the git tag `legacy/vite-squat-prototype`, not on `main`.

## Commit guard

`.githooks/pre-commit` refuses commits on `main` or `master`. Activate it once per clone:

```bash
git config core.hooksPath .githooks
```

---

<!-- BEGIN:witus-shared-rules v11 -->
<!-- MANAGED BLOCK — do not edit by hand. Source: gemini/witus/docs/shared-rules.md.
     Update the source, then run `node scripts/sync-claude-rules.mjs` in the witus repo. -->

## ⚠️ Ecosystem identity (shared note — don't confuse repos)

Full ecosystem identity + the canonical product index live in `gemini/witus/CLAUDE.md` and
`gemini/witus/lib/products.ts`. Each repo states *which* product it is in its own hand-owned line
above this managed block; don't infer another app's URLs, routes, IDs, env names, or DB schema —
confirm against that app's own code.

The site **brandanthonymcdonald.com** (BAM's personal portfolio) lives in `claude/bam-landing-page/`
— **NOT** `projects/bam-portfolio/` (the retired legacy static site). Target `bam-landing-page`.

## Operator-task rule — capture user actions in `./plans/user-tasks/`

When Claude proposes work that needs BAM to do something outside the editor (account signup, API
key, DNS change, vendor dashboard, env-var rotation, secret generation, PR review/merge, etc.),
Claude MUST create a `./plans/user-tasks/NN-slug.md` file in this repo. **No exceptions for "small"
steps.** Required sections: **Scope tag** · **What + why** (with explicit *what this blocks* detail
and any hard deadline) · **Steps** · **What Claude will use** · **How to mark done** · **Related**.
Keep `./plans/user-tasks/00-descriptions.md` updated with columns `# | Title | Scope | Blocks |
Status` — the `Blocks` column is the one BAM scans. Ecosystem-wide tasks (Keap, IRL events, retros,
cross-product decisions) live in the canonical witus queue at `gemini/witus/plans/user-tasks/`;
repo-local tasks live here. Read the witus queue at session start before dependent work. Full rule:
`gemini/witus/CLAUDE.md` §"Operator-task rule".

**Sync and check at session start and end (v11).** At the start and the end of every session, Claude
runs `node /Users/bam/Code_NOiCloud/ai-builds/gemini/witus/scripts/sync-user-tasks.mjs --check`
(read-only), moves every task listed as "Marked done on the site" to `completed/` and updates its index
Status, then runs the sync without `--check` so https://www.witus.online/admin/tasks matches the queues.
**"Merged" is not done until the production deploy is green:** a task whose last step is a merge stays
open until /admin/tasks/deploys (or the repo's GitHub deployments) shows that app's newest Production
deploy succeeded on `main`'s head; a failed or behind deploy reopens it with the failure in its Status.

## Branch hygiene — BAM merges, between sessions by default

**Half 1.** Branch → commit → push → stop. Claude does not run `git checkout main && git merge`.
Never `--force` to shared branches. Before every commit run `git branch --show-current`; if it is
`main`/`master`, branch first (`feat/ fix/ chore/ docs/`). After push, hand back the branch name +
summary and stop.

**Half 2.** BAM merges pushed branches via the GitHub UI between sessions. Mid-session, after a
push, BAM may merge in a separate window and the local checkout silently fast-forwards to `main` —
so re-check `git branch --show-current` before **every** commit, not just at branch creation, or you
risk landing follow-up commits directly on `main`.

**Half 3.** Keep branches small (one concern each). When a session produces multiple branches,
consolidate them into one `bundle/<slug>-YYYY-MM-DD` via `git merge --no-ff` (preserves per-concern
history — no squash), resolve conflicts during bundling, run `tsc + lint + build` against the
bundle, push, and file ONE `./plans/user-tasks/NN-merge-bundle-<slug>.md`. BAM does one merge, not N.

**Commit often.** Commit at every working checkpoint — a passing build, a finished sub-step, a green
test — not just at the end. A usage-limit cutoff, a dropped connection, or a crashed session must
never lose more than the last few minutes of work. Small frequent commits on the feature branch keep
the branch un-merged (Half 1 still holds) and give BAM clean per-step history to drill into.

A checked-in `.githooks/pre-commit` guard refuses commits made directly on `main`/`master`. Activate
once per clone: `git config core.hooksPath .githooks`. Full rule: `gemini/witus/CLAUDE.md`
§"Branch-hygiene rule".

## Docs-sync rule — a change isn't done until its docs are current

When a change adds, alters, or removes a user-visible feature/route/scope, update the affected docs
**in the same branch**: README (feature list, env examples, scripts), in-app help/tutorial content,
`docs/roadmap.md` (see the Roadmap rule) **and** any public roadmap page, API/OpenAPI docs, and STYLE_GUIDE/CONTRIBUTING when a
convention changed. State which docs you touched in the handoff. Never leave an aspirational ✅ on a
roadmap — downgrade it with a one-line reason. If a doc update is genuinely out of scope, file it as
a `./plans/` task rather than skipping silently. A Stop hook in `.claude/settings.json` gates on
this: if the session diff changed feature/route files but touched no docs, it blocks once and asks
you to update-or-defer. Schema-only migrations, refactors, perf, and dev-tooling changes don't
trigger it.

## Plans convention

All implementation plans live in `./plans/` as `NN-description-of-plan.md` (two-digit prefix,
kebab-case, next available number, don't skip). Sub-queues: `./plans/user-tasks/NN-slug.md`
(operator tasks), `./plans/bugs/`, `./plans/future/`. (`plans/` is typically gitignored.)

**Finding what BAM mentions: search gitignored files.** Most ideas, plans, decisions, and drafts BAM
refers to live in a `plans/` dir of this repo or another ecosystem repo, and are not tracked by git.
Default `rg`, `git grep`, `git log -S`, and editor search skip gitignored paths, so they miss every
`plans/` dir and report a false "nothing found". Search with `rg -uu` (or `rg --no-ignore`, `grep -r`,
`find`), excluding `node_modules`, `.next`, `.git`, worktrees, and virtualenvs: this repo first, then
the repos in `gemini/witus/docs/ecosystem-repos.json`. A miss from a git-aware search proves nothing;
if the gitignore-aware search also misses, say what you searched and ask BAM where it lives.
Untracked also means unrecoverable: git can't restore an overwritten plan, so read before replacing.
Full rule: `gemini/witus/CLAUDE.md` §"Plans convention".

## New app ideas — vet before building

Before writing code, creating a repo, or onboarding any new product idea, score it with the WitUS
app-idea rubric (`gemini/witus/docs/app-idea-vetting-rubric.md`): search gitignored `plans/` for prior
work, declare the goal with BAM (business / portfolio / community), write the sourced analysis at
`gemini/witus/plans/NN-<slug>-analysis.md`, apply the gates and weighted scores, and file a user task
for any validation BAM does outside the editor. Append lessons and outcomes to the rubric's logs;
gate, weight, and threshold changes need BAM's approval. Full rule: `gemini/witus/CLAUDE.md`
§"New-product vetting rule".

## Citation rule

Anything publishable, teachable, or partner-facing (curriculum, teaching-oriented help articles,
white papers, grant/sponsor/partner writing) uses APA 7 in-line citations with a `## References`
section. Code docs, internal notes, and `plans/user-tasks/*` are out of scope. Full rule:
`gemini/witus/CLAUDE.md` §"Citation rule".

## Spelling rule — American English, always

Everything written in this ecosystem uses **American English spelling**: product copy, course and lesson
text, quiz items, docs, plans, commit messages, and agent output ("fiber" not "fibre", "color", "gray",
"center", "catalog", "organize", "program", "license" as the noun). Never change spelling inside a
quotation or the title of a cited work: a source is quoted as printed. When converting existing text,
skip quotations, blockquotes, bibliography entries and code, and prove the quoted passages are unchanged.
BAM's decision of 2026-10-08.

## Blog ledger rule — every blog post goes in the ledger the session it is written

BAM's blog (brandanthonymcdonald.com/blog, repo `claude/bam-landing-page`) has one ledger of every
post, live and waiting, numbered in publishing order: `gemini/witus/plans/playbook/*-blog-ledger.md`
(gitignored; synced to `witus.online/admin/library`). Read it before writing a post, so a topic is
not written twice. When a session in **any** repo drafts a blog post, add it to the ledger's Part 2
in the same session (slug, title, app, branch, publish task, gate, check result), placed after any
post it links to; then rename the file to today's date, update its row in `00-library-index.md`, and
re-render its PDF (`npm run library:pdf -- <file>` in witus). "Published" means listed in
`https://www.brandanthonymcdonald.com/feed.json`, not merged. Publishing order is BAM's call. Full
rule: `gemini/witus/CLAUDE.md` §"Blog ledger rule".

## Authoritative-values rule — never assert guessed external values

When a value is owned by an external system (DNS/registrar, a host like Vercel, a third-party API,
or another ecosystem app's URLs/routes/IDs/env/schema), read it from the authoritative source; don't
hardcode a guessed default and present it as correct. If you must ship a fallback, label it as a
fallback in both UI copy and a code comment. Verify by behavior (does the flow work?), not by
exact-match against a guess. When unsure, flag or ask — never assert. Full rule:
`gemini/witus/CLAUDE.md` §"Authoritative-values rule".

## Preview-branch cleanup rule — no preview deployment may leave a paid resource behind

Every repo deployed on Vercel with a Neon database through the Vercel-managed integration gets a Neon branch named `preview/<git-branch>` per preview deployment. Neon deletes that branch only when the Vercel **deployment** is deleted, and Vercel keeps preview deployments for six months by default (a project with fewer than about 20 preview deployments may never delete any). Stale branches count toward the plan's branch limit and are billed as extra usage. BAM was charged over $100 in each of two months this way (2026-10-15).

**Required in every Neon repo:**
1. The workflow `.github/workflows/neon-preview-cleanup.yml` (canonical copy in `gemini/witus/.github/templates/`, synced by `node scripts/sync-preview-cleanup-workflow.mjs --write`): on `pull_request` `closed`, run `neondatabase/delete-branch-action@v3` against `preview/${{ github.head_ref }}` with `vars.NEON_PROJECT_ID` and `secrets.NEON_API_KEY`. Do not edit the synced copy; edit the template and re-sync.
2. The GitHub repository variable `NEON_PROJECT_ID` and secret `NEON_API_KEY` set (operator task; the workflow fails loudly without them). **The key is project-scoped and unique to that project** (Neon Console → Organization settings → API keys → Create new → Project-scoped; or `neon api-keys create --name <name> --project-id <id>`), so a leak reaches one database. A project-scoped key still has Editor access to every branch in its project: the `preview/` name filter in code is the real guard, and the key never reaches client-side code. The hub (witus.online) holds the map of all project keys as `NEON_PROJECT_KEYS` for its `/admin/cost-cleanup` page; `scripts/neon-key-plan.ts` prints or mints them.
3. The Vercel project's **Deployment Retention Policy → Pre-Production Deployments** set to the shortest duration (dashboard, per project).
4. A branch created by hand for a preview or an experiment carries `expires_at` (Neon branch expiration, 30 days maximum); never create one without it.

**Supabase repos** (CentenarianOS and Work.WitUS share one project; Tour Manager OS has its own): no persistent branches; preview branches only through the GitHub integration, which deletes them when the PR closes. **MongoDB Atlas repos** (FlashLearnAI, bam-landing-page): the integration creates no per-preview resources; cost is the cluster tier, nothing to clean.

**Claude's part:** when a session adds a Neon database to a repo, it adds the workflow in the same change and files the variable/secret step as an operator task. When a session sees preview branches older than the PR that made them (`npx neonctl branches list --project-id <id>`), it lists them for BAM instead of assuming the integration cleaned up. Source for the Neon behavior: https://neon.com/docs/guides/vercel-branch-cleanup (read 2026-10-15).

## Email rule — Mailgun is the ecosystem mailer, never Resend

Every app that sends email uses **Mailgun** (env `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`; witus-inbox is the
reference). Never add Resend as a dependency, and never name it in a PRD, brief, README, CLAUDE.md or cloud
prompt. When a doc in front of you says Resend, fix it in the same change. Two apps still send through Resend
(flashlearn-ai and centenarian-os, 2026-10-23): move them to Mailgun the next time a session touches their email
code. **Why:** Create.WitUS's PRD, CLAUDE.md and README kept specifying Resend after Mailgun was chosen, so the
wrong mailer resurfaced in later sessions (BAM, 2026-10-23: "ensure we don't have this error again").

## Post-deploy automation rule: no step after a deploy is run by hand

Any step that must run after a deploy (database migrations, seeds of reference data, search or cache
rebuilds, content syncs) is automated:

1. **A workflow runs it.** It triggers on the push to `main` that changes its inputs (a `paths:`
   filter, such as the migrations folder) and also has `workflow_dispatch`, so it can be run on
   demand. Use a `concurrency` group so two runs never overlap, and fail closed when a secret is
   missing. Write a summary of what ran to `$GITHUB_STEP_SUMMARY`.
2. **Secrets live in the CI secret store**, set by piping a CLI into `gh secret set`, so no value is
   pasted or shown: `neon connection-string --project-id <id> | gh secret set NEON_DIRECT_URL --repo dapperAuteur/<repo>`.
3. **A manual fallback is written down.** The repo's tracked operations runbook (`docs/`, such as
   `docs/05-operations.md`) has the exact commands to run the same step from a laptop, for the day the
   workflow is broken.
4. **It can be run from the witus.online admin.** The admin's post-deploy page lists every app's steps
   with a Run button that dispatches the workflow through GitHub's `workflow_dispatch` API and shows the
   last run's status. Until that page exists, the Actions tab's **Run workflow** button is the manual
   trigger. Register each new workflow there when you add it.

Reference implementation: invest-witus `.github/workflows/migrate-production.yml` and its
`docs/05-operations.md`. When a session adds a migration or another post-deploy step to a repo that
has no such workflow yet, it adds the workflow in the same change and files the secret step as an
operator task. **Why:** on 2026-10-28 invest-witus migrations needed a connection string pasted into
a terminal four times in one evening; every project variable was Sensitive, so `vercel env pull`
and `vercel env run` could not help, and a missed migration left pages answering 500. Full rule:
`gemini/witus/CLAUDE.md` §"Post-deploy automation rule".

## Roadmap rule: every repo keeps `docs/roadmap.md` current

Every ecosystem repo keeps a tracked `docs/roadmap.md` in this format. The witus.online admin page
`/admin/roadmap` reads it from `main` of every repo, so it is how BAM sees where each app stands.

```
---
app: <slug>
name: <display name>
stage: idea | vetted | building | alpha | beta | live | paused | retired
url: <optional>
updated: YYYY-MM-DD
---

## Live now
- ...
## In progress
- ...
## Next
- ...
## Backlog
- ...
## Blocked on
- ...
```

1. **Update it in the same change** that ships a feature (move the item to Live now), starts a branch
   of planned work (In progress), adds a backlog item, or hits or clears a blocker (Blocked on). Set
   `updated` to today's date and change `stage` when the app moves on.
2. **A new app gets one on day one**, as part of onboarding. An app with no repo of its own keeps
   `docs/roadmaps/<slug>.md` in the witus repo instead, and gets an entry in witus
   `lib/roadmap/registry.ts`.
3. **One line per item**, plain words, with a plan or task number when there is one. Nested bullets
   are detail under an item. Leave a section out rather than writing "None".

The page flags a roadmap as possibly stale when `main` has commits more than 14 days newer than the
file's last change. Onboarding step: `gemini/witus/CLAUDE.md` §"Ecosystem onboarding rule"; app
list: `gemini/witus/lib/roadmap/registry.ts`.

## Coding conventions

UI/UX/DX conventions (a11y, component patterns, TypeScript, microcopy, git-commit vocabulary, the
default Neon+Drizzle+pnpm+Vitest stack) are consolidated in `gemini/witus/docs/shared-ui-ux-dx.md`.
Read it before writing UI or API code. Two repos are grandfathered on Supabase+Jest and documented
there as exceptions.

<!-- END:witus-shared-rules v11 -->
