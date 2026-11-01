# Slow-motion frame test (spike)

A throwaway static page for operator task 02 and the stack decision in
`docs/research/stack-swot.md` section 6. Open it on a phone, pick a 120 or 240 fps slow-motion clip, and it
reports whether the browser handed over every frame and how long decode and pose take. Not part of the app.

## What it measures, per clip (version 2)

- File name, size, MIME type, last-modified time, which button and source (Photos, Files), whether the clip
  was trimmed in Photos, and the optional "seconds filmed" entry.
- Container, from the movie header only (the page finds `moov` by reading 16-byte box headers, so a 100 MB
  file is never loaded whole): brands, movie timescale and duration, top-level boxes, video codec and size,
  rotation, track timescale, sample count, the sample-table delta histogram and the fps it implies, edit list
  entries (with media rate), other tracks, every `com.apple.*` key **with its value** (keys + ilst), and the
  timed-metadata (`mebx`) track's key names and first sample payloads.
- **Decode only:** WebCodecs `VideoDecoder` in a module worker over the whole clip: frames, unique
  timestamps, effective fps, time, bytes read.
- **Frame check:** the whole clip again, with a 64x36 brightness grid per frame (from the luma plane via
  `VideoFrame.copyTo`, or a canvas fallback). Counts duplicate frames (difference under 0.05, or under 15% of
  the nearby median) and shows duplicates and median change per tenth of the clip, so a slow-motion ramp shows
  up either as repeated frames or as the ends changing much more per frame than the middle.
- **Pose:** the first N seconds of file time (default 10; 5, 20, 30 or the whole clip). Each frame is rotated
  upright and downscaled to 480 px on the long side in one reused canvas, the decoder's frame is closed at
  once, and MediaPipe Pose Landmarker (full, float16) runs on the copy, GPU delegate if it works.
- **Playback check:** `requestVideoFrameCallback` at 0.25x over the same N seconds, muted and inline. If
  Safari refuses `play()` (autoplay policy, Low Power Mode), the page asks for a tap and calls `play()` inside
  it; if that is refused or skipped, the run says "skipped: Safari blocked playback", not an error.
- **Capture rate:** "if captured at R fps, real time = frames / R; slow-motion factor = file duration / that".
  The rate itself comes from the file's own timestamps when they are 90 fps or more, or from another run of the
  same clip (matched by `com.apple.quicktime.creationdate`) that was a high-rate original, or from the
  "seconds filmed" entry. Otherwise it is UNKNOWN, with the reason.
- Errors per run, with the decoder's real error message; crashes (a run that never finished is shown on the
  next load with its phase, frame count, elapsed time, page-visibility changes and file details).
- Device: user agent, WebCodecs, WebGPU, OffscreenCanvas and WebGL2, rVFC, wake lock, GPU renderer.

### Pass rule (task 02)

- **Frame test:** PASS if unique frames are at least 95% of frames **and** the capture rate matches the
  "recorded as" setting within 5%. (Version 1's "N frames at 239 fps" was the wrong test for Photos picks,
  which arrive as slow-motion exports retimed to 30 fps.)
- Decode under 10 s per 1,200 frames decoded; decode plus pose under 60 s per 1,200 frames posed (stretch
  30 s); three runs in a row without a crash.

### Memory

The worker gets the `File` and the sample table, not the samples. It reads sample data in slices of at most
6 MB, keeps at most 4 chunks in the decoder and 2 decoded frames alive, closes every `VideoFrame` as soon as
it is used, and loses the GPU context when pose ends. Frames never cross threads. A watchdog stops a worker
that sends nothing for 60 s, so a stuck run finishes instead of locking the page; **Stop this run** does the
same on request. The page holds a screen wake lock during a run so auto-lock doesn't background it.

### Results

Each run is a card (newest first, with time and file name) that opens to show every line, selectable, with a
per-run copy button. **Show all results as text** opens a large box with **Select all** and **Copy**. **Clear
results** asks in the page (no `window.confirm`), then removes the runs, the crash counter and the crash
marker from local and session storage, including version 1 keys. Version 1 runs saved before the upgrade are
kept and shown in the new cards.

The results stay in this browser's local storage until cleared. Nothing is uploaded.

## Deploy

Vercel project with Root Directory `spike`, Framework Preset "Other", no build command, no output
directory. `vercel.json` only sets headers: long caching for the versioned `vendor/` and `models/` paths, and privacy headers including the CSP above. `.vercelignore` keeps `dev/` and this file out.

## Pinned files (self-hosted, no CDN at runtime)

| File | Source | SHA-256 |
| --- | --- | --- |
| `vendor/mp4box@0.5.4/mp4box.all.min.js` | npm `mp4box@0.5.4` `dist/` (BSD-3-Clause), sourcemap line removed | `f981c3ac620cba6b...` |
| `vendor/tasks-vision@1.2.0/vision_bundle.mjs` | npm `@mediapipe/tasks-vision@1.2.0` (Apache-2.0), sourcemap line removed, telemetry disabled (below) | upstream `fba1af224ac39e8e...`, patched `28b40f19398aa4e1...` |
| `vendor/tasks-vision@1.2.0/wasm/vision_wasm_module_internal.{js,wasm}` | same package; the module variant is the one a module worker loads | `60384c90...`, `2e326b9d...` |
| `models/pose_landmarker_full.float16.4eaa5eb7.task` | `storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/` as fetched for the pose bench on 2026-10-31 (differs from `float16/1/`) | `4eaa5eb7a98365...` |

**Telemetry patch.** `tasks-vision` 1.2.0 creates a usage logger for every task that POSTs to
`https://odml.pa.googleapis.com/v1/log` every 60 seconds and on close, with no option to turn it off (found in the
first local test run). The vendored copy makes that logger's `flush` a no-op and stops it collecting entries
(class `Ch`, marked by a comment on line 1). `vercel.json` also sends `Content-Security-Policy: connect-src 'self'
blob: data:`, so the browser blocks any request to another origin even if a code path is missed. The local server
(`dev/serve.mjs`) applies the same headers, and `dev/run-local.mjs` counts requests that leave localhost.

Only the SIMD module build is shipped. Every browser the test targets (Safari 16.4 and later, current Chrome)
has WebAssembly SIMD, and MediaPipe has no non-SIMD module build.

## Local test

```sh
cd spike/dev && npm i
sh make-iphone-clips.sh /tmp/clips     # iPhone-like slow-motion exports; needs ffmpeg with libx264
sh make-clips.sh /tmp/clips            # version 1 clips (240 and 120 fps originals, HEVC)
node serve.mjs &                       # serves spike/ on http://localhost:8766
CLEAR=1 CHROME_ARGS=--use-angle=metal node run-local.mjs \
  ~/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-x64/chrome-headless-shell \
  /tmp/clips/orig-240.mov /tmp/clips/slomo-unique.mov /tmp/clips/slomo-dup-ramps.mov \
  /tmp/clips/slomo-drop-ramps.mov /tmp/clips/long-100s.mov
```

`run-local.mjs` also takes `BLOCKPLAY=tap|skip` (makes `play()` fail outside a user gesture, like Safari),
`CRASH=1` (reloads mid-pose and prints the crash card), `MAXSEC`, and `RVFC=0`; see its header. Open the page
with `?debug` to get each run's per-frame differences in `window.__diffs`.
