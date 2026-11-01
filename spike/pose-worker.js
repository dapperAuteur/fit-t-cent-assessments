// Module worker: decodes every sample with WebCodecs, then decodes again and runs
// MediaPipe Pose Landmarker (full model) on each frame. Adapted from
// docs/research/pose-bench/common.js and worker.js.
//
// In:  { config, samples: [{ is_sync, cts, duration, timescale, data: ArrayBuffer }],
//        model: ArrayBuffer, wasmBase: string, passes: ['decode', 'pose'] }
// Out: { type: 'progress', phase, done, total } ... then { type: 'result', ... }

const VISION = new URL('./vendor/tasks-vision@1.2.0/vision_bundle.mjs', import.meta.url).href;
const post = (m) => self.postMessage(m);
const ms = (t) => Math.round(performance.now() - t);

function stats(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s.at(-1).toFixed(1) };
}

function workerCaps() {
  let webgl2 = false;
  try { webgl2 = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2'); } catch { /* no */ }
  return {
    videoDecoder: typeof VideoDecoder !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    offscreenWebgl2: webgl2,
    webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
  };
}

// Decodes all samples in order and calls onFrame(frame, index) for each output frame.
// Backpressure keeps at most maxPending frames alive. Frames are closed after onFrame.
async function decodeAll(config, samples, onFrame, phase, errors, maxPending = 4) {
  const pending = []; let wake = null; let decErr = null;
  const dec = new VideoDecoder({
    output: (f) => { pending.push(f); if (wake) wake(); },
    error: (e) => { decErr = e; if (wake) wake(); },
  });
  dec.configure(config);
  let fed = 0, done = 0, flushed = null, lastPost = 0;
  const timestamps = [];
  const feed = () => {
    while (fed < samples.length && dec.decodeQueueSize < 8 && pending.length < maxPending) {
      const s = samples[fed++];
      dec.decode(new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: Math.round(1e6 * s.cts / s.timescale),
        duration: Math.round(1e6 * s.duration / s.timescale),
        data: s.data,
      }));
    }
  };
  feed();
  for (;;) {
    if (decErr) { errors.push(`${phase}: decoder error after ${done} frames: ${decErr.message || decErr}`); break; }
    if (!pending.length) {
      if (fed >= samples.length) {
        if (!flushed) flushed = dec.flush().then(() => 'ok', (e) => { decErr = decErr || e; return 'err'; });
        const r = await Promise.race([flushed, new Promise((res) => { wake = res; setTimeout(res, 50); })]);
        wake = null;
        if (r === 'ok' && !pending.length) break;
        continue;
      }
      await new Promise((res) => { wake = res; setTimeout(res, 50); }); wake = null; feed(); continue;
    }
    const f = pending.shift();
    try { timestamps.push(f.timestamp); await onFrame(f, done); }
    catch (e) { errors.push(`${phase}: frame ${done}: ${e && e.message || e}`); }
    finally { f.close(); }
    done++; feed();
    if (done - lastPost >= 24) { lastPost = done; post({ type: 'progress', phase, done, total: samples.length }); }
  }
  try { if (dec.state !== 'closed') dec.close(); } catch { /* already closed */ }
  return { frames: done, timestamps };
}

// Effective fps from presentation timestamps (microseconds): frames over the time they cover.
function effFps(ts, sampleDurUs) {
  if (ts.length < 2) return null;
  const s = [...ts].sort((a, b) => a - b);
  const unique = new Set(s).size;
  const span = (s.at(-1) - s[0]) / 1e6 + sampleDurUs / 1e6;
  return { unique, spanSec: +span.toFixed(3), fps: +(s.length / span).toFixed(2) };
}

self.onmessage = async ({ data }) => {
  const errors = [];
  const out = { type: 'result', caps: workerCaps(), errors };
  try {
    const { config, samples, passes } = data;
    const avgDurUs = samples.length ? 1e6 * samples.reduce((a, s) => a + s.duration / s.timescale, 0) / samples.length : 0;

    if (!out.caps.videoDecoder) throw new Error('VideoDecoder is not available in a worker on this browser');
    const sup = await VideoDecoder.isConfigSupported(config).catch((e) => ({ supported: false, error: String(e) }));
    out.configSupported = { supported: !!sup.supported, error: sup.error };

    if (passes.includes('decode')) {
      post({ type: 'progress', phase: 'decode', done: 0, total: samples.length });
      const t = performance.now();
      const r = await decodeAll(config, samples, () => {}, 'decode', errors);
      out.decode = { frames: r.frames, ms: ms(t), ...effFps(r.timestamps, avgDurUs) };
    }

    if (passes.includes('pose')) {
      post({ type: 'progress', phase: 'load', done: 0, total: 1 });
      const tLoad = performance.now();
      const { FilesetResolver, PoseLandmarker } = await import(VISION);
      const vision = await FilesetResolver.forVisionTasks(data.wasmBase, true);
      const make = (delegate) => PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer: new Uint8Array(data.model.slice(0)), delegate },
        runningMode: 'VIDEO', numPoses: 1,
        ...(delegate === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) } : {}),
      });
      let delegate = 'GPU', fallback = null, pl;
      if (!out.caps.offscreenWebgl2) { delegate = 'CPU'; fallback = 'no WebGL2 on OffscreenCanvas in a worker'; }
      if (delegate === 'GPU') {
        try { pl = await make('GPU'); } catch (e) { delegate = 'CPU'; fallback = `GPU init failed: ${e && e.message || e}`; }
      }
      if (!pl) pl = await make('CPU');
      const loadMs = ms(tLoad);

      // Input path: VideoFrame straight into MediaPipe; if that throws, convert to ImageBitmap.
      // If GPU still throws on the first frame, rebuild on CPU and say so.
      let input = 'VideoFrame', lastTs = -1, found = 0, firstOk = false;
      const per = [];
      const detect = async (f) => {
        let ts = f.timestamp / 1000; if (ts <= lastTs) ts = lastTs + 0.001; lastTs = ts;
        const t0 = performance.now();
        let r;
        if (input === 'VideoFrame') {
          try { r = pl.detectForVideo(f, ts); }
          catch (e) {
            if (firstOk) throw e;
            input = 'ImageBitmap'; errors.push(`pose: VideoFrame input failed (${e && e.message || e}), using ImageBitmap`);
          }
        }
        if (!r) {
          const bmp = await createImageBitmap(f);
          try { r = pl.detectForVideo(bmp, ts); }
          catch (e) {
            if (firstOk || delegate === 'CPU') throw e;
            pl.close(); delegate = 'CPU'; fallback = `GPU detect failed: ${e && e.message || e}`;
            pl = await make('CPU'); r = pl.detectForVideo(bmp, ts);
          } finally { bmp.close(); }
        }
        firstOk = true;
        per.push(performance.now() - t0);
        if (r.landmarks && r.landmarks.length) found++;
      };
      post({ type: 'progress', phase: 'pose', done: 0, total: samples.length });
      const t = performance.now();
      const r = await decodeAll(config, samples, detect, 'pose', errors);
      const total = ms(t);
      pl.close();
      out.pose = { model: 'full', delegate, fallback, input, loadMs, frames: r.frames, posed: per.length, detected: found, ms: total, perFrame: stats(per) };
    }
  } catch (e) {
    errors.push(`fatal: ${e && e.message || e}`);
  }
  post(out);
};
