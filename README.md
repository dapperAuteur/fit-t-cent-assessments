# Fit T. Cent Assessments

A browser prototype of the overhead squat movement assessment. It reads the live camera feed, tracks body landmarks with MediaPipe Pose, counts squat reps, and flags three common compensations while you move.

The overhead squat is the only assessment built so far, and it is the working feature of this repo. Everything below describes the code as it stands on `main`.

## Status

- Stage: prototype. There is no confirmed production URL.
- One page, one assessment, plain JavaScript built with Vite.
- No tests, no linter, no CI.
- The plan for what comes next lives in [docs/roadmap.md](docs/roadmap.md).

## What it does

1. **Live pose tracking.** Click **Start Assessment** and the page asks for the camera (640 x 480). Each frame goes to MediaPipe Pose, which returns 33 body landmarks. The page draws the skeleton over a mirrored video: green lines, red joints.
2. **Rep counting.** The page averages the left and right knee angles (hip, knee, ankle). A rep starts when that angle drops below 90 degrees and counts when it rises back above 160 degrees. The count shows above the video, and the instructions panel changes at the bottom of each rep.
3. **Compensation checks.** On every frame the page checks three things and lists any it finds under **Compensations Detected**. If none fire, it shows "Great Overhead Squat Form!"

   | Message | What the code measures | Threshold | Highlight color |
   | --- | --- | --- | --- |
   | Arms falling forward (bent elbows) | Elbow angle (shoulder, elbow, wrist) on either side | below 160 degrees | orange |
   | Excessive forward lean | Hip angle (shoulder, hip, knee) on either side | below 100 degrees | yellow |
   | Knees moving inward (valgus) | Horizontal distance between the knees compared with the distance between the ankles | knees narrower than 80% of ankle width | purple |

4. **Stop and Reset.** **Stop Assessment** turns the camera off and reports the final rep count. **Reset** clears the count, the canvas and the feedback.
5. **Guest mode or sign-in.** Without an account you can run the full assessment as a guest. The page also offers email and password sign-up and login through Firebase Authentication. Signing in does not change the assessment; it only shows the **Save Assessment** and **Share with Trainer** buttons (see below).

## What it does not do yet

These are easy to assume from the UI, so they are listed plainly:

- **Save Assessment and Share with Trainer do nothing.** The buttons appear for signed-in users, but no code is attached to them. No assessment result, rep count or landmark is stored anywhere.
- **No recorded video.** The page works only with a live camera. There is no file upload and no way to analyze a video you recorded earlier.
- **No score or report.** Feedback is frame by frame. Nothing summarizes a set, and nothing is kept after you stop.
- **One camera angle.** The checks assume you face the camera. The angles are measured on the flat 2D image, so a side view or a tilted phone changes the numbers.
- **Other assessments.** Only the overhead squat exists.

## Run it locally

You need Node.js (the build was checked with Node 22) and npm.

```bash
cd frontend-app
npm ci
# create frontend-app/.env.local with the six VITE_FIREBASE_* values (see Configuration)
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Browsers only allow camera access on `https://` pages or on `localhost`, so testing from a phone on your network needs HTTPS. `frontend-app/cert.pem` is committed and `key.pem` is gitignored, but there is no `vite.config` that uses them, so the dev server runs plain HTTP as checked in.

## Configuration

The app reads its Firebase web config from Vite environment variables at build time. Put them in `frontend-app/.env.local` (gitignored through `*.local`) or `frontend-app/.env` (gitignored at the repo root). Names only:

| Variable | Used for |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase web config |
| `VITE_FIREBASE_PROJECT_ID` | Firebase web config |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase web config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config |
| `VITE_FIREBASE_APP_ID` | Firebase web config |

Get the values from the Firebase console for the project (Project settings, Your apps, Web app).

**The page does not start without them, not even in guest mode.** Firebase is initialized at the top of `src/main.js`; with no API key, Firebase throws `auth/invalid-api-key`, the script stops, and none of the buttons are wired up. With placeholder values the page loads in guest mode and the assessment works, but sign-up and login fail.

Vite bakes these values into the built JavaScript. Firebase web config is designed to be public; access control belongs in Firebase Authentication settings and Firestore security rules, which are not in this repo.

## Build

```bash
cd frontend-app
npm run build     # writes frontend-app/dist
npm run preview   # serves the built files locally
```

## Deploy

Deployment is Firebase Hosting, configured in `firebase.json`:

- The hosting folder is `frontend-app/dist`.
- The default Firebase project is the one named in `.firebaserc`.
- There is no `predeploy` build step, so build first.
- There is no deploy workflow in this repo; deploys are run by hand.

```bash
cd frontend-app && npm run build && cd ..
firebase deploy --only hosting
```

This needs the Firebase CLI and a login with access to the project. The `404.html` at the repo root is the Firebase CLI's starter page and is not in `frontend-app/dist`, so it is not deployed.

## Project structure

```
.
├── firebase.json          Firebase Hosting config (serves frontend-app/dist)
├── .firebaserc            Default Firebase project
├── 404.html               Firebase starter 404 page (not deployed)
├── docs/
│   └── roadmap.md         Roadmap in the WitUS shared format
├── lib/
│   └── firebase.ts        Not used by the app (see Known limits)
└── frontend-app/          The Vite app
    ├── index.html         Page markup; loads MediaPipe scripts from jsDelivr
    ├── cert.pem           Local HTTPS certificate (not wired into Vite)
    ├── package.json       Scripts: dev, build, preview
    ├── public/vite.svg
    └── src/
        ├── main.js        Firebase setup, auth, pose tracking, rep counting, checks
        ├── style.css      Layout and mirrored video
        ├── counter.js     Vite starter file, unused
        └── javascript.svg Vite starter file, unused
```

## Privacy

- **Video stays in the browser.** Camera frames go from the `<video>` element to MediaPipe Pose, which runs in the page. The code does not upload, record or store frames, landmarks or results.
- **MediaPipe loads from a CDN.** The pose scripts and model files are fetched from `cdn.jsdelivr.net` when the page loads and when you start, so the device needs a network connection and jsDelivr sees the request.
- **Sign-in data.** Sign-up and login send your email and password to Firebase Authentication. The app also writes a Firestore document at `users/{uid}` with your email, a `role` of `client`, `createdAt` and `lastLogin`. Login updates `lastLogin`. Nothing else is written to Firestore.
- **Guest mode** sends nothing to Firebase beyond what the Firebase SDK does when it starts.

## Accessibility

What is there today:

- The instructions, feedback and guest-mode panels are `aria-live="polite"`, so screen readers announce changes.
- The email and password fields have `aria-label`s.
- Controls are native `<button>` elements, so they work from the keyboard.

What is missing:

- Compensation feedback is mostly visual (colored joints on the video). The text list is announced, but it updates on every frame, which can be noisy with a screen reader.
- The red-on-green skeleton and the orange, yellow and purple highlights rely on color.
- The form fields use placeholders instead of visible labels, and auth errors are shown in red text only.
- There are no custom focus styles and no reduced-motion handling.

## Known limits

- **MediaPipe version.** The page uses the legacy `@mediapipe/pose` solution scripts from jsDelivr with no version pinned, so a CDN update can change behavior without a code change. The newer MediaPipe Tasks pose model is not used.
- **Thresholds are fixed numbers** in `src/main.js`, not tuned or validated against a coach's assessment.
- **"Arms falling forward" measures elbow bend,** not how far the arms drift forward from the shoulders.
- **Rep counting can miss shallow squats**, since a rep needs the knee angle below 90 degrees.
- **Unused code.** `lib/firebase.ts` is a separate Firebase setup that reads `process.env.FIREBASE_*` names and enables offline persistence; nothing imports it. `src/counter.js` and `src/javascript.svg` are left from the Vite starter.
- **Dependencies.** `npm audit` reports known vulnerabilities in transitive dependencies of the `firebase` package (for example `@grpc/grpc-js`). They have not been addressed.
- **No license file.** The repo has no LICENSE, so no open-source license is granted.

## Direction

The overhead squat assessment is the current working feature. The next possible use is different: a paying client wants a tool for track and field athletes (sprinters, hurdlers and javelin throwers), starting with analysis of video that athletes and their coach record on a phone.

That work is going through the WitUS app-idea vetting process and is **not built**. The vetting analysis (WitUS plans/35, kept outside this repo) waits on owner decisions and has not been written yet. Nothing in this repo analyzes recorded video or sprint, hurdle or throwing mechanics today.

## Roadmap

See [docs/roadmap.md](docs/roadmap.md). It feeds the roadmap page on the witus.online admin.
