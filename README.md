# Fit T. Cent Assessments

Movement assessments from a phone camera, with pose estimation running on the device. This repo is being rebuilt as a Next.js app. The first release analyzes **track hurdle clearance** from a side-on slow-motion clip recorded on a phone; later releases add the overhead squat, single-leg squat, push and pull assessments (based on NASM's protocol) and the hurdle step screen (published criteria).

Not affiliated with or endorsed by NASM or Functional Movement Systems.

## Status

- Stage: building. There is no production app yet, and no app code on `main` yet.
- The old browser prototype (Vite, plain JavaScript, Firebase) was retired from `main` on 2026-11-01. Its code is kept at the git tag [`legacy/vite-squat-prototype`](#legacy-prototype).
- The plan for what comes next lives in [docs/roadmap.md](docs/roadmap.md).

## What is on `main` today

```
.
├── README.md
├── docs/
│   ├── roadmap.md          Roadmap in the WitUS shared format
│   └── research/
│       ├── ui-ux-dx.md     UI, UX and DX research for the rebuild
│       ├── stack-swot.md   Stack and performance SWOT (input to the stack decision)
│       └── pose-bench/     Pose model benchmark harness and results
└── spike/                  Slow-motion frame test page (static, throwaway)
```

- **`docs/research/`** holds the research the rebuild is based on: protocol checkpoints, screen flows, accessibility, test layers, and the stack comparison with measured pose timings.
- **`spike/`** is a static page that checks whether a 120 or 240 fps slow-motion clip picked on a phone reaches the browser with every frame, and how long decode and pose take. It is not part of the app; see [spike/README.md](spike/README.md). It stays on `main` until the app's `/lab` page covers the same checks, then it is retired the same way as the prototype (tagged, then removed).

## Stack (decided, being built)

- Next.js App Router on Vercel, TypeScript.
- Sign in with WitUS (Better Auth), Neon Postgres with Drizzle.
- Analysis pages render on the client only. Decoding and pose run in one module Web Worker with a pinned, self-hosted copy of MediaPipe Tasks Vision.
- Video stays on the device. Saved results hold numbers and, if the user allows it, body landmarks for the analyzed window; never video or frames.
- English and Spanish from day one.

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

Nothing in this repo today collects or stores personal data. The spike page processes a clip in the browser and blocks requests that leave its own origin.

## License

The repo has no LICENSE file, so no open-source license is granted.

## Roadmap

See [docs/roadmap.md](docs/roadmap.md). It feeds the roadmap page on the witus.online admin.
