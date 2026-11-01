---
app: fit-t-cent-assessments
name: Fit T. Cent Assessments
stage: building
updated: 2026-11-01
---

## Live now
- Nothing in production yet. The old Vite and Firebase overhead squat prototype was retired from `main` on 2026-11-01; its code is kept at the git tag `legacy/vite-squat-prototype`
- Slow-motion frame test page (`spike/`), used to prove that 240 fps iPhone clips reach the browser with every slow-section frame

## In progress
- Phase 1a, built and waiting on merge and a green Vercel build: the Next.js app shell with the header Sign in link, footer, and landing and sign-in placeholders in English and Spanish, security headers, CI, and accessibility and layout tests
- Phase 1b: Sign in with WitUS, the database, and the first migration with its post-deploy workflow
- Release 1 (MVP): track hurdle clearance from a side-on slow-motion clip, Sign in with WitUS, saved results without video, stick-figure replay, export, landing and method pages

## Next
- Release 2: overhead squat assessment (based on NASM's protocol), with the live camera
- Release 3: coach links, per-result sharing and review

## Backlog
- Release 4: single-leg squat, push and pull assessments (based on NASM's protocol) and the hurdle step screen (published criteria)
- Video sharing with a coach, offline install, a CentenarianOS event with landmarks and scores (never video)
- A release for athletes under 18, only if the owner approves it (guardian consent and visibility first)

## Blocked on
- Vercel project, Neon database and secrets (owner task 05)
- Sign in with WitUS client secret on both projects (owner task 06)
- Adult fixture clips of a hurdler at 240 fps (owner task 08)
