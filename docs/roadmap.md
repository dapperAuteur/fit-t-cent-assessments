---
app: fit-t-cent-assessments
name: Fit T. Cent Assessments
stage: building
updated: 2026-11-02
---

## Live now
- Phase 1a app shell (merged; Vercel and CI green on `main` a83f8d3): header Sign in link, footer, landing page in English and Spanish, security headers, accessibility and layout tests
- The old Vite and Firebase overhead squat prototype was retired from `main` on 2026-11-01; its code is kept at the git tag `legacy/vite-squat-prototype`
- Slow-motion frame test page (`spike/`), used to prove that 240 fps iPhone clips reach the browser with every slow-section frame

## In progress
- Phase 1b, built on `feat/auth-witus-sso` and waiting on merge: Sign in with WitUS, the 18-or-older and role step, Sign out for this app only, the database (Neon, PGlite locally), the first migration and its post-deploy workflow (owner task 11)
- Release 1 (MVP): track hurdle clearance from a side-on slow-motion clip, Sign in with WitUS, saved results without video, stick-figure replay, export, landing and method pages

## Next
- Release 2: overhead squat assessment (based on NASM's protocol), with the live camera
- Release 3: coach links, per-result sharing and review

## Backlog
- Release 4: single-leg squat, push and pull assessments (based on NASM's protocol) and the hurdle step screen (published criteria)
- Video sharing with a coach, offline install, a CentenarianOS event with landmarks and scores (never video)
- A release for athletes under 18, only if the owner approves it (guardian consent and visibility first)

## Blocked on
- Production sign-in: the `NEON_DIRECT_URL` GitHub secret, `BETTER_AUTH_URL` on Production and `BETTER_AUTH_SECRET` on Preview (owner tasks 05 and 11)
- Sign in with WitUS client secret on the IdP side (owner task 06)
- Adult fixture clips of a hurdler at 240 fps (owner task 08)
