// Module worker for the slow-motion frame test. Three passes over the picked clip:
//   decode  WebCodecs decode of the whole clip, nothing else (timed).
//   frames  decode of the whole clip plus a 64x36 grayscale fingerprint per frame, to count
//           duplicate frames and show where they sit (start, middle, end).
//   pose    decode of the first N seconds (file time) plus MediaPipe Pose Landmarker (full) on a
//           rotated, downscaled copy of each frame (long side 480 px), GPU delegate if it works.
//
// Memory: the worker gets the File and the sample table, not the samples. It reads sample data
// in bounded slices (at most BATCH_BYTES at a time), keeps at most MAX_QUEUE chunks in the
// decoder and MAX_PENDING decoded frames alive, and closes every VideoFrame as soon as it has
// been used. Frames never cross threads, so nothing is copied between the page and the worker.
//
// In:  { file, samples: [{ offset, size, cts, duration, is_sync }], timescale, config, rotation,
//        model: ArrayBuffer | null, wasmBase, passes: ['decode', 'frames', 'pose'], poseMaxSec }
// Out: { type: 'progress', phase, done, total } ... then { type: 'result', ... }

const VISION = new URL('./vendor/tasks-vision@1.2.0/vision_bundle.mjs', import.meta.url).href;
const BATCH_BYTES = 6 * 1024 * 1024;
const MAX_QUEUE = 4;
const MAX_PENDING = 2;
const POSE_LONG_SIDE = 480;
const HASH_W = 64, HASH_H = 36;

const post = (m) => self.postMessage(m);
const ms = (t) => Math.round(performance.now() - t);
const msgOf = (e) => (e && (e.name && e.message ? `${e.name}: ${e.message}` : e.message)) || String(e);

function stats(a) {
  if (!a.length) return null;
  const s = Float64Array.from(a).sort();
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) };
}

function workerCaps() {
  let webgl2 = false;
  try { webgl2 = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2'); } catch { /* no */ }
  return {
    videoDecoder: typeof VideoDecoder !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    offscreenWebgl2: webgl2,
  };
}

// Reads sample data from the File in bounded slices that cover several consecutive samples.
function makeReader(file, samples) {
  let batch = null;
  const reader = {
    bytesRead: 0, slices: 0, maxSlice: 0,
    async get(i) {
      if (!batch || i < batch.first || i > batch.last) {
        batch = null; // let the previous slice go before reading the next one
        const s0 = samples[i];
        let lo = s0.offset, hi = s0.offset + s0.size, j = i;
        while (j + 1 < samples.length && j + 1 - i < 240) {
          const s = samples[j + 1];
          const nlo = Math.min(lo, s.offset), nhi = Math.max(hi, s.offset + s.size);
          if (nhi - nlo > BATCH_BYTES) break;
          lo = nlo; hi = nhi; j++;
        }
        const buf = await file.slice(lo, hi).arrayBuffer();
        reader.bytesRead += buf.byteLength; reader.slices++; reader.maxSlice = Math.max(reader.maxSlice, buf.byteLength);
        batch = { first: i, last: j, base: lo, u8: new Uint8Array(buf) };
      }
      const s = samples[i];
      return batch.u8.subarray(s.offset - batch.base, s.offset - batch.base + s.size);
    },
  };
  return reader;
}

// Decodes samples[start, end) in order and awaits onFrame(frame, index) for each output frame
// whose timestamp is under tsLimitUs. On a decoder error it records the real message, then
// restarts at the next key sample (at most twice) so one bad spot doesn't end the pass.
async function decodeRange(ctx, { start, end, onFrame, phase, tsLimitUs = Infinity }) {
  const { samples, config, errors, timescale } = ctx;
  const pending = [];
  let wake = null, decErr = null, flushP = null, flushed = false;
  const poke = () => { if (wake) { const w = wake; wake = null; w(); } };
  const nap = (t) => new Promise((res) => { wake = res; setTimeout(() => { if (wake === res) wake = null; res(); }, t); });
  let dec = null;
  const make = () => {
    const d = new VideoDecoder({
      output: (f) => { if (d !== dec) { f.close(); return; } pending.push(f); poke(); },
      error: (e) => { if (d === dec) { decErr = decErr || e; poke(); } },
    });
    d.configure(config);
    return d;
  };
  dec = make();
  const reader = makeReader(ctx.file, samples);
  let i = start, done = 0, beyond = 0, restarts = 0, skipped = 0, lastPost = 0, lastPostAt = performance.now();
  const timestamps = [];
  const total = end - start;
  for (;;) {
    if (decErr) {
      errors.push(`${phase}: decoder error after ${done} frames (sample ${i} of ${end}, decoder state ${dec.state}, queue ${dec.decodeQueueSize}): ${msgOf(decErr)}`);
      decErr = null;
      while (pending.length) pending.shift().close();
      try { if (dec.state !== 'closed') dec.close(); } catch { /* closed */ }
      let k = i; while (k < end && !samples[k].is_sync) k++;
      if (restarts >= 2 || k >= end) break;
      errors.push(`${phase}: restarted the decoder at key sample ${k} (skipped ${k - i} samples)`);
      skipped += k - i; i = k; restarts++; flushP = null; flushed = false;
      try { dec = make(); } catch (e) { errors.push(`${phase}: decoder restart failed: ${msgOf(e)}`); break; }
      continue;
    }
    while (i < end && !flushP && pending.length < MAX_PENDING && dec.decodeQueueSize < MAX_QUEUE) {
      if (dec.state !== 'configured') { decErr = decErr || new Error(`decoder is ${dec.state}, with no error event`); break; }
      const s = samples[i];
      const data = await reader.get(i);
      if (decErr) break;
      if (dec.state !== 'configured') { decErr = new Error(`decoder became ${dec.state} while reading the file`); break; }
      try {
        dec.decode(new EncodedVideoChunk({
          type: s.is_sync ? 'key' : 'delta',
          timestamp: Math.round(1e6 * s.cts / timescale),
          duration: Math.round(1e6 * s.duration / timescale),
          data,
        }));
      } catch (e) { decErr = decErr || e; break; }
      i++;
    }
    if (decErr) continue;
    if (pending.length) {
      const f = pending.shift();
      try {
        if (f.timestamp < tsLimitUs) { timestamps.push(f.timestamp); await onFrame(f, done); done++; } else beyond++;
      } catch (e) { errors.push(`${phase}: frame ${done}: ${msgOf(e)}`); done++; }
      finally { f.close(); }
      const now = performance.now();
      if (done - lastPost >= 24 || now - lastPostAt > 1000) { lastPost = done; lastPostAt = now; post({ type: 'progress', phase, done, total }); }
      continue;
    }
    if (i >= end) {
      if (flushed) break;
      if (!flushP) {
        if (dec.state !== 'configured') { decErr = new Error(`decoder is ${dec.state} before flush, with no error event`); continue; }
        flushP = dec.flush().then(() => { flushed = true; poke(); }, (e) => { if (!decErr) decErr = e; poke(); });
      }
      await nap(50);
      continue;
    }
    await nap(20);
  }
  while (pending.length) pending.shift().close();
  try { if (dec.state !== 'closed') dec.close(); } catch { /* closed */ }
  return { frames: done, beyond, timestamps, restarts, skipped, bytesRead: reader.bytesRead, slices: reader.slices, maxSlice: reader.maxSlice };
}

// Effective fps from presentation timestamps (microseconds): frames over the time they cover.
function effFps(ts, sampleDurUs) {
  if (ts.length < 2) return { unique: ts.length, spanSec: 0, fps: 0 };
  const s = Float64Array.from(ts).sort();
  let unique = 1; for (let k = 1; k < s.length; k++) if (s[k] !== s[k - 1]) unique++;
  const span = (s[s.length - 1] - s[0]) / 1e6 + sampleDurUs / 1e6;
  return { unique, spanSec: +span.toFixed(3), fps: +(s.length / span).toFixed(2) };
}

// ---- frame fingerprints ----
// A 64x36 grid of mean brightness per frame. Fast path: copy the decoded frame's luma (Y) plane
// with VideoFrame.copyTo (no colour conversion, one reused buffer) and average blocks, sampling
// every third pixel in each direction (about 100 samples per cell at 1080p). Fallback: draw the frame onto a 64x36 canvas and read it back.
const YUV = new Set(['I420', 'I420A', 'I422', 'I444', 'NV12']);
function makeHasher() {
  let prev = null, cur = new Float32Array(HASH_W * HASH_H), method = null, buf = null, canvas = null, g = null, cols = null;
  const STEP = 3;
  const sums = new Float64Array(HASH_W * HASH_H), counts = new Uint32Array(HASH_W * HASH_H);
  async function fromLuma(frame) {
    const size = frame.allocationSize();
    if (!buf || buf.byteLength < size) buf = new Uint8Array(size);
    const layout = await frame.copyTo(buf);
    const { offset, stride } = layout[0];
    const vr = frame.visibleRect || { x: 0, y: 0, width: frame.codedWidth, height: frame.codedHeight };
    const w = vr.width, h = vr.height, x0 = vr.x, y0 = vr.y;
    if (!cols || cols.w !== w) { // column -> grid cell, sampled every STEP pixels
      cols = new Int32Array(Math.ceil(w / STEP)); cols.w = w;
      for (let i = 0; i < cols.length; i++) cols[i] = Math.min(HASH_W - 1, Math.floor(i * STEP * HASH_W / w));
    }
    sums.fill(0); counts.fill(0);
    for (let y = 0; y < h; y += STEP) {
      const row = offset + (y + y0) * stride + x0;
      const gy = Math.min(HASH_H - 1, Math.floor(y * HASH_H / h)) * HASH_W;
      for (let i = 0, x = 0; i < cols.length; i++, x += STEP) { const cell = gy + cols[i]; sums[cell] += buf[row + x]; counts[cell]++; }
    }
    for (let q = 0; q < cur.length; q++) cur[q] = counts[q] ? sums[q] / counts[q] : 0;
  }
  function fromCanvas(frame) {
    if (!canvas) { canvas = new OffscreenCanvas(HASH_W, HASH_H); g = canvas.getContext('2d', { alpha: false }); }
    g.drawImage(frame, 0, 0, HASH_W, HASH_H);
    const px = g.getImageData(0, 0, HASH_W, HASH_H).data;
    for (let p = 0, q = 0; q < cur.length; p += 4, q++) cur[q] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
  }
  return {
    get method() { return method; },
    async diff(frame) {
      if (method !== 'canvas' && YUV.has(frame.format)) {
        try { await fromLuma(frame); method = method || `luma copy (${frame.format})`; }
        catch { method = 'canvas'; fromCanvas(frame); }
      } else { method = 'canvas'; fromCanvas(frame); }
      let d = NaN;
      if (prev) { let sum = 0; for (let q = 0; q < cur.length; q++) sum += Math.abs(cur[q] - prev[q]); d = sum / cur.length; }
      const t = prev || new Float32Array(cur.length); prev = cur; cur = t;
      return d;
    },
  };
}

// A frame is a duplicate of the one before it when its mean absolute difference (gray levels,
// 0 to 255, on the 64x36 grid) is tiny in absolute terms (DUP_ABS), or is under DUP_REL of the
// median difference of the frames around it (DUP_WIN each side) and under DUP_CAP. The local
// reference keeps a slow moment in the motion from reading as a run of duplicates. Calibrated on
// the spike/dev synthetic clips (1,200 distinct frames: 1.6% flagged; 90 repeated frames: all
// flagged); real footage may need a different value, so the result also reports the spread.
const DUP_ABS = 0.05, DUP_REL = 0.15, DUP_CAP = 2.0, DUP_WIN = 15;
function summarizeDiffs(d) {
  const n = d.length;
  const valid = []; for (let k = 1; k < n; k++) if (Number.isFinite(d[k])) valid.push(d[k]);
  const sorted = Float64Array.from(valid).sort();
  const q = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN);
  const median = q(0.5);
  const local = new Float64Array(n);
  for (let k = 1; k < n; k++) {
    const w = [];
    for (let j = Math.max(1, k - DUP_WIN); j <= Math.min(n - 1, k + DUP_WIN); j++) if (j !== k && Number.isFinite(d[j])) w.push(d[j]);
    w.sort((x, y) => x - y);
    local[k] = w.length ? w[Math.floor(w.length / 2)] : 0;
  }
  const isDup = (k) => k > 0 && Number.isFinite(d[k]) && (d[k] <= DUP_ABS || (d[k] < DUP_REL * local[k] && d[k] < DUP_CAP));
  let dups = 0, exact = 0, run = 0, longest = 0, longestAt = -1, first = -1, last = -1;
  for (let k = 1; k < n; k++) {
    if (d[k] === 0) exact++;
    if (isDup(k)) { dups++; run++; if (first < 0) first = k; last = k; if (run > longest) { longest = run; longestAt = k - run + 1; } } else run = 0;
  }
  const tenths = [];
  for (let t = 0; t < 10; t++) {
    const a = Math.floor(t * n / 10), b = Math.floor((t + 1) * n / 10);
    const seg = []; let sd = 0;
    for (let k = Math.max(1, a); k < b; k++) { if (Number.isFinite(d[k])) seg.push(d[k]); if (isDup(k)) sd++; }
    seg.sort((x, y) => x - y);
    tenths.push({ frames: b - a, dups: sd, median: seg.length ? +seg[Math.floor(seg.length / 2)].toFixed(2) : null });
  }
  const r2 = (x) => (Number.isFinite(x) ? +x.toFixed(2) : null);
  const mid = tenths.slice(3, 7).map((t) => t.median).filter((x) => x != null).sort((x, y) => x - y);
  const ends = [tenths[0], tenths[9]].map((t) => t.median).filter((x) => x != null);
  const midMed = mid.length >= 3 ? (mid[1] + mid[mid.length - 2]) / 2 : (mid.length ? mid[0] : null);
  return {
    frames: n, dups, unique: n - dups, exactZero: exact, rule: `under ${DUP_ABS}, or under ${DUP_REL * 100}% of the nearby median`,
    longestRun: longest, longestRunAt: longestAt, firstDup: first, lastDup: last,
    p10: r2(q(0.1)), median: r2(median), p90: r2(q(0.9)), tenths,
    endsVsMiddle: midMed && ends.length ? r2(Math.max(...ends) / midMed) : null,
  };
}

// ---- pose input: rotate upright and downscale into one reused canvas ----
function makePoseCanvas(frame, rotation) {
  const w = frame.displayWidth, h = frame.displayHeight;
  const rot = ((rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const k = Math.min(1, POSE_LONG_SIDE / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
  const cw = swap ? sh : sw, ch = swap ? sw : sh;
  const c = new OffscreenCanvas(cw, ch);
  const g = c.getContext('2d', { alpha: false });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'medium';
  return {
    canvas: c, size: `${cw}x${ch}`, rot,
    draw(f) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (rot === 90) { g.translate(cw, 0); g.rotate(Math.PI / 2); }
      else if (rot === 180) { g.translate(cw, ch); g.rotate(Math.PI); }
      else if (rot === 270) { g.translate(0, ch); g.rotate(-Math.PI / 2); }
      g.drawImage(f, 0, 0, sw, sh);
    },
  };
}

self.onmessage = async ({ data }) => {
  const errors = [];
  const out = { type: 'result', caps: workerCaps(), errors };
  try {
    const { config, samples, passes, file, timescale } = data;
    const ctx = { file, samples, config, errors, timescale };
    const avgDurUs = samples.length ? 1e6 * samples.reduce((a, s) => a + s.duration, 0) / timescale / samples.length : 0;

    if (!out.caps.videoDecoder) throw new Error('VideoDecoder is not available in a worker on this browser');
    const sup = await VideoDecoder.isConfigSupported(config).catch((e) => ({ supported: false, error: msgOf(e) }));
    out.configSupported = { supported: !!sup.supported, error: sup.error };

    if (passes.includes('decode')) {
      post({ type: 'progress', phase: 'decode', done: 0, total: samples.length });
      const t = performance.now();
      const r = await decodeRange(ctx, { start: 0, end: samples.length, onFrame: () => {}, phase: 'decode' });
      out.decode = { frames: r.frames, ms: ms(t), restarts: r.restarts, skipped: r.skipped, readMB: +(r.bytesRead / 1e6).toFixed(1), slices: r.slices, maxSliceMB: +(r.maxSlice / 1e6).toFixed(1), ...effFps(r.timestamps, avgDurUs) };
      post({ type: 'pass', key: 'decode', value: out.decode, errors: errors.slice() }); // kept by the page if a later pass crashes the tab
    }

    if (passes.includes('frames')) {
      post({ type: 'progress', phase: 'frames', done: 0, total: samples.length });
      const t = performance.now();
      const hasher = makeHasher();
      const diffs = [];
      const r = await decodeRange(ctx, { start: 0, end: samples.length, phase: 'frames', onFrame: async (f) => { diffs.push(await hasher.diff(f)); } });
      // Decoded frames arrive in presentation order, so diffs[k] compares frame k with frame k - 1.
      out.frames = { ms: ms(t), method: hasher.method, restarts: r.restarts, ...summarizeDiffs(diffs) };
      post({ type: 'pass', key: 'frames', value: out.frames, errors: errors.slice() });
      if (data.debug) out.frames.diffs = diffs.map((x) => (Number.isFinite(x) ? +x.toFixed(3) : null));
    }

    if (passes.includes('pose') && data.model) {
      post({ type: 'progress', phase: 'load', done: 0, total: 1 });
      const tLoad = performance.now();
      const { FilesetResolver, PoseLandmarker } = await import(VISION);
      const vision = await FilesetResolver.forVisionTasks(data.wasmBase, true);
      const modelBytes = new Uint8Array(data.model); data.model = null;
      let glCanvas = null;
      const make = (delegate) => {
        glCanvas = delegate === 'GPU' ? new OffscreenCanvas(1, 1) : null;
        return PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: modelBytes, delegate },
          runningMode: 'VIDEO', numPoses: 1,
          ...(glCanvas ? { canvas: glCanvas } : {}),
        });
      };
      const loseGl = () => { try { const gl = glCanvas && glCanvas.getContext('webgl2'); const x = gl && gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch { /* none */ } };
      let delegate = 'GPU', fallback = null, pl;
      if (!out.caps.offscreenWebgl2) { delegate = 'CPU'; fallback = 'no WebGL2 on OffscreenCanvas in a worker'; }
      if (delegate === 'GPU') {
        try { pl = await make('GPU'); } catch (e) { delegate = 'CPU'; fallback = `GPU init failed: ${msgOf(e)}`; loseGl(); }
      }
      if (!pl) pl = await make('CPU');
      const loadMs = ms(tLoad);

      // Range: decode-order samples up to the first one at or after the limit (file time).
      const t0 = samples.length ? samples.reduce((m, s) => Math.min(m, s.cts), Infinity) : 0;
      const limitTicks = Number.isFinite(data.poseMaxSec) ? t0 + data.poseMaxSec * timescale : Infinity;
      let end = samples.length;
      if (Number.isFinite(limitTicks)) {
        end = 0;
        // Include a few samples past the limit so reordered (B-frame) samples before it still decode.
        while (end < samples.length && samples[end].cts < limitTicks) end++;
        end = Math.min(samples.length, end + 8);
      }
      const tsLimitUs = Number.isFinite(limitTicks) ? Math.round(1e6 * limitTicks / timescale) : Infinity;

      let pc = null, input = 'canvas', lastTs = -1, found = 0, firstOk = false;
      const per = [];
      const detect = async (f) => {
        if (!pc) pc = makePoseCanvas(f, data.rotation || 0);
        let ts = f.timestamp / 1000; if (ts <= lastTs) ts = lastTs + 0.001; lastTs = ts;
        pc.draw(f);
        f.close(); // the downscaled copy is all pose needs; free the decoder's frame now
        const tA = performance.now();
        let r;
        if (input === 'canvas') {
          try { r = pl.detectForVideo(pc.canvas, ts); }
          catch (e) {
            if (firstOk) throw e;
            input = 'ImageBitmap'; errors.push(`pose: canvas input failed (${msgOf(e)}), using ImageBitmap`);
          }
        }
        if (!r) {
          const bmp = await createImageBitmap(pc.canvas);
          try { r = pl.detectForVideo(bmp, ts); }
          catch (e) {
            if (firstOk || delegate === 'CPU') throw e;
            pl.close(); loseGl(); delegate = 'CPU'; fallback = `GPU detect failed: ${msgOf(e)}`;
            pl = await make('CPU'); r = pl.detectForVideo(bmp, ts);
          } finally { bmp.close(); }
        }
        firstOk = true;
        per.push(performance.now() - tA);
        if (r.landmarks && r.landmarks.length) found++;
      };
      post({ type: 'progress', phase: 'pose', done: 0, total: end });
      const t = performance.now();
      const r = await decodeRange(ctx, { start: 0, end, onFrame: detect, phase: 'pose', tsLimitUs });
      const total = ms(t);
      try { pl.close(); } catch { /* closed */ }
      loseGl();
      out.pose = {
        model: 'full', delegate, fallback, input, inputSize: pc ? pc.size : null, rotationApplied: pc ? pc.rot : null,
        loadMs, frames: r.frames, posed: per.length, detected: found, ms: total, perFrame: stats(per),
        maxSec: Number.isFinite(data.poseMaxSec) ? data.poseMaxSec : null, restarts: r.restarts,
      };
    }
  } catch (e) {
    errors.push(`worker: ${msgOf(e)}`);
  }
  post(out);
};
