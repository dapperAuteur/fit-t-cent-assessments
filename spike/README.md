# Slow-motion frame test (spike)

A throwaway static page for operator task 02 and the stack decision in
`docs/research/stack-swot.md` section 6. Open it on a phone, pick a 120 or 240 fps slow-motion clip, and it
reports whether the browser handed over every frame and how long decode and pose take. Not part of the app.

## What it measures, per clip

- File name, size, MIME type, last-modified time, and which button and source (Photos, Files) were used.
- Container as parsed by mp4box.js: brands, movie timescale and duration, video codec and size, rotation,
  track timescale, sample count, the sample-table delta histogram and the fps it implies, edit list entries
  (with media rate), other tracks (audio, timed metadata), and any `com.apple.*` metadata keys in the file.
- WebCodecs `VideoDecoder` in a module worker: frames delivered, unique timestamps, effective fps, time.
- Decode plus MediaPipe Pose Landmarker (full, float16) per frame in the same worker, GPU delegate on an
  OffscreenCanvas, falling back to CPU with the reason recorded.
- `requestVideoFrameCallback` at playbackRate 0.25: unique `mediaTime` values seen, for comparison.
- Errors per run, and crashes (a run that never finished is counted on the next load).
- Device: user agent, WebCodecs, WebGPU, OffscreenCanvas and WebGL2, rVFC, GPU renderer.
- PASS or FAIL against task 02's targets, scaled to the clip's length and recorded rate.

The results stay in this browser's local storage until cleared. Nothing is uploaded.

## Deploy

Vercel project with Root Directory `spike`, Framework Preset "Other", no build command, no output
directory. `vercel.json` only sets cache and privacy headers. `.vercelignore` keeps `dev/` and this file out.

## Pinned files (self-hosted, no CDN at runtime)

| File | Source | SHA-256 |
| --- | --- | --- |
| `vendor/mp4box@0.5.4/mp4box.all.min.js` | npm `mp4box@0.5.4` `dist/` (BSD-3-Clause), sourcemap line removed | `f981c3ac620cba6b...` |
| `vendor/tasks-vision@1.2.0/vision_bundle.mjs` | npm `@mediapipe/tasks-vision@1.2.0` (Apache-2.0), sourcemap line removed | `fba1af224ac39e8e...` |
| `vendor/tasks-vision@1.2.0/wasm/vision_wasm_module_internal.{js,wasm}` | same package; the module variant is the one a module worker loads | `60384c90...`, `2e326b9d...` |
| `models/pose_landmarker_full.float16.4eaa5eb7.task` | `storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/` as fetched for the pose bench on 2026-10-31 (differs from `float16/1/`) | `4eaa5eb7a98365...` |

Only the SIMD module build is shipped. Every browser the test targets (Safari 16.4 and later, current Chrome)
has WebAssembly SIMD, and MediaPipe has no non-SIMD module build.

## Local test

```sh
cd spike/dev && npm i
sh make-clips.sh /tmp/clips            # needs ffmpeg with libx264 and libx265
node serve.mjs &                       # serves spike/ on http://localhost:8766
CHROME_ARGS=--use-angle=metal node run-local.mjs \
  ~/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-x64/chrome-headless-shell \
  /tmp/clips/h264-240-5s.mp4 /tmp/clips/h264-240-5s.mov /tmp/clips/hevc-240-5s.mov /tmp/clips/h264-120-5s.mp4
```
