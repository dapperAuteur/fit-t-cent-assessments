// Slow-motion frame test (spike). Answers task 02: do 120/240 fps clips survive a web
// page's file picker with every frame, and how fast can this browser decode and pose them?
// Main thread: read the file, parse the container with mp4box.js, run the
// requestVideoFrameCallback pass. Worker (pose-worker.js): WebCodecs decode, then pose.
// Nothing is uploaded; there are no network calls except this site's own files.

const SPIKE_VERSION = '1';
const MP4BOX_URL = 'vendor/mp4box@0.5.4/mp4box.all.min.js';
const MODEL_URL = 'models/pose_landmarker_full.float16.4eaa5eb7.task';
const WASM_BASE = new URL('vendor/tasks-vision@1.2.0/wasm', location.href).href;
const RUNS_KEY = 'fps-spike-runs-v1';
const INFLIGHT_KEY = 'fps-spike-inflight-v1';
const CRASH_KEY = 'fps-spike-crashes-v1';
const CHUNK = 4 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
const statusEl = $('status'), bar = $('bar'), out = $('out'), checksEl = $('checks'), player = $('player');

// ---- storage (best effort; the page works without it) ----
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
let runs = store.get(RUNS_KEY, []);
let crashes = store.get(CRASH_KEY, 0);
const inflight = store.get(INFLIGHT_KEY, null);
if (inflight) {
  // The previous run never finished: the tab crashed or was reloaded mid-run.
  crashes += 1; store.set(CRASH_KEY, crashes); store.del(INFLIGHT_KEY);
  runs.push({ crashed: true, n: runs.length + 1, at: inflight.at, file: inflight.file, source: inflight.source, recorded: inflight.recorded, phase: inflight.phase });
  store.set(RUNS_KEY, runs);
}

// ---- helpers ----
const fmtMB = (b) => `${(b / 1e6).toFixed(1)} MB`;
const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;
const radio = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
function setStatus(text, frac) {
  statusEl.textContent = text;
  if (frac == null) { bar.hidden = true; } else { bar.hidden = false; bar.value = Math.max(0, Math.min(1, frac)); }
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if (self.MP4Box) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(`could not load ${src}`));
    document.head.append(s);
  });
}

// ---- device info ----
function deviceInfo() {
  let renderer = 'unknown', webgl2 = false, offWebgl2 = false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (gl) {
      webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }
  } catch { /* no WebGL */ }
  try { offWebgl2 = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2'); } catch { /* no */ }
  return {
    ua: navigator.userAgent,
    webgpu: 'gpu' in navigator,
    webcodecs: typeof VideoDecoder !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    offscreenWebgl2: offWebgl2,
    webgl2,
    rvfc: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
    cores: navigator.hardwareConcurrency || 'n/a',
    memoryGB: navigator.deviceMemory || 'n/a',
    screen: `${screen.width}x${screen.height} @${devicePixelRatio}x`,
    renderer,
  };
}
const device = deviceInfo();

// ---- container parse (mp4box.js, file read in 4 MB slices) ----
function scanAppleKeys(u8, found) {
  // ASCII scan for QuickTime metadata keys such as com.apple.quicktime.*; cheap and container-agnostic.
  const pat = [99, 111, 109, 46, 97, 112, 112, 108, 101, 46]; // "com.apple."
  for (let i = 0; i + pat.length < u8.length; i++) {
    if (u8[i] !== 99) continue;
    let j = 1; while (j < pat.length && u8[i + j] === pat[j]) j++;
    if (j < pat.length) continue;
    let k = i; let s = '';
    while (k < u8.length && k - i < 96) { const c = u8[k]; if (c < 33 || c > 126) break; s += String.fromCharCode(c); k++; }
    found.add(s); i = k;
  }
}

async function parseFile(file, onProgress) {
  await loadScript(MP4BOX_URL);
  const MP4Box = self.MP4Box;
  const mp4 = MP4Box.createFile();
  let info = null, samples = [], parseErr = null;
  const appleKeys = new Set();
  mp4.onError = (e) => { parseErr = e; };
  mp4.onReady = (i) => {
    info = i;
    const vt = i.videoTracks[0];
    if (vt) { mp4.setExtractionOptions(vt.id, null, { nbSamples: Infinity }); mp4.start(); }
  };
  mp4.onSamples = (id, user, s) => { samples.push(...s); };
  for (let off = 0; off < file.size; off += CHUNK) {
    const buf = await file.slice(off, off + CHUNK).arrayBuffer();
    scanAppleKeys(new Uint8Array(buf), appleKeys);
    buf.fileStart = off;
    mp4.appendBuffer(buf);
    onProgress(Math.min(1, (off + CHUNK) / file.size));
    if (parseErr) break;
  }
  mp4.flush();
  if (parseErr) throw new Error(`container parse error: ${parseErr}`);
  if (!info) throw new Error('mp4box.js found no movie header (moov): not an MP4 or QuickTime file?');
  const vt = info.videoTracks[0];
  if (!vt) throw new Error('no video track in this file');

  const trak = mp4.getTrackById(vt.id);
  let description;
  for (const e of trak.mdia.minf.stbl.stsd.entries) {
    const box = e.avcC || e.hvcC || e.vpcC || e.av1C;
    if (box) { const DS = self.DataStream; const st = new DS(undefined, 0, DS.BIG_ENDIAN); box.write(st); description = new Uint8Array(st.buffer, 8); }
  }
  const config = { codec: vt.codec, codedWidth: vt.video.width, codedHeight: vt.video.height, description, hardwareAcceleration: 'no-preference' };

  // Sample table: stts delta histogram and the fps it implies.
  const stts = trak.mdia.minf.stbl.stts;
  const deltas = {};
  stts.sample_counts.forEach((c, i) => { deltas[stts.sample_deltas[i]] = (deltas[stts.sample_deltas[i]] || 0) + c; });
  const tsc = vt.timescale;
  const spanTicks = stts.sample_counts.reduce((a, c, i) => a + c * stts.sample_deltas[i], 0);
  const spanSec = spanTicks / tsc;
  const nSamples = vt.nb_samples;
  const tableFps = spanSec > 0 ? nSamples / spanSec : null;
  const deltaList = Object.entries(deltas).sort((a, b) => b[1] - a[1])
    .map(([d, c]) => `${d} ticks x${c} (${(tsc / d).toFixed(2)} fps)`);

  const m = vt.matrix || [];
  const rotation = m.length >= 2 ? Math.round(Math.atan2(m[1] / 65536, m[0] / 65536) * 180 / Math.PI) : 0;
  const edits = (vt.edits || []).map((e) => ({
    durSec: +(e.segment_duration / info.timescale).toFixed(3),
    mediaTime: e.media_time,
    rate: +(e.media_rate_integer + e.media_rate_fraction / 65536).toFixed(4),
  }));
  const otherTracks = info.tracks.filter((t) => t.id !== vt.id).map((t) => {
    const tk = mp4.getTrackById(t.id);
    const h = tk && tk.mdia && tk.mdia.hdlr ? tk.mdia.hdlr.handler : t.type;
    return `${h}:${t.codec || '?'}${t.nb_samples != null ? ` (${t.nb_samples} samples)` : ''}`;
  });
  const sumSize = samples.reduce((a, s) => a + s.size, 0);
  return {
    config, samples,
    meta: {
      brands: info.brands.join(','), movieTimescale: info.timescale, movieDurSec: +(info.duration / info.timescale).toFixed(3),
      fragmented: info.isFragmented, codec: vt.codec, size: `${vt.video.width}x${vt.video.height}`, rotation,
      trackTimescale: tsc, samples: nSamples, extracted: samples.length, spanSec: +spanSec.toFixed(3),
      tableFps: tableFps && +tableFps.toFixed(2), deltaList, edits, otherTracks,
      syncSamples: samples.filter((s) => s.is_sync).length, videoMB: +(sumSize / 1e6).toFixed(1),
      appleKeys: [...appleKeys].sort().slice(0, 40),
    },
  };
}

// ---- model (fetched once per page load, with progress) ----
let modelBuf = null;
async function getModel() {
  if (modelBuf) return { buf: modelBuf, ms: 0, cached: true };
  const t = performance.now();
  const r = await fetch(MODEL_URL);
  if (!r.ok) throw new Error(`model download failed: HTTP ${r.status}`);
  const total = +r.headers.get('content-length') || 9.4e6;
  const reader = r.body.getReader(); const parts = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    parts.push(value); got += value.length;
    setStatus(`Downloading the pose model (once per visit): ${fmtMB(got)} of ${fmtMB(total)}`, got / total);
  }
  const u8 = new Uint8Array(got); let o = 0; for (const p of parts) { u8.set(p, o); o += p.length; }
  modelBuf = u8.buffer;
  return { buf: modelBuf, ms: Math.round(performance.now() - t), cached: false };
}

// ---- worker run ----
function runWorker(parsed, model) {
  return new Promise((resolve) => {
    const w = new Worker('pose-worker.js', { type: 'module' });
    const labels = { decode: 'Decode only (WebCodecs)', load: 'Loading the pose engine', pose: 'Decode plus pose (full model)' };
    w.onmessage = ({ data: m }) => {
      if (m.type === 'progress') {
        setPhase(m.phase);
        setStatus(`${labels[m.phase]}: ${m.done} of ${m.total}`, m.total ? m.done / m.total : null);
        return;
      }
      w.terminate(); resolve(m);
    };
    w.onerror = (e) => { w.terminate(); resolve({ errors: [`worker error: ${e.message || 'unknown (module workers may be unsupported)'}`] }); };
    // Each sample's data owns its own ArrayBuffer (mp4box copies), so transfer them, not copy.
    const transfer = [];
    const samples = parsed.samples.map((s) => {
      let d = s.data;
      if (d.byteOffset !== 0 || d.byteLength !== d.buffer.byteLength) d = d.slice();
      transfer.push(d.buffer);
      return { is_sync: s.is_sync, cts: s.cts, duration: s.duration, timescale: s.timescale, data: d.buffer };
    });
    w.postMessage({ config: parsed.config, samples, model: model.slice(0), wasmBase: WASM_BASE, passes: ['decode', 'pose'] }, transfer);
    parsed.samples = null; // transferred; let the parse buffers go
  });
}

// ---- requestVideoFrameCallback pass at 0.25x ----
async function rvfcPass(file) {
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return { skipped: 'requestVideoFrameCallback not supported' };
  const url = URL.createObjectURL(file);
  player.hidden = false; player.muted = true; player.playsInline = true; player.src = url;
  try {
    await new Promise((res, rej) => {
      player.onloadedmetadata = res; player.onerror = () => rej(new Error(`video element could not load this file (${player.error && player.error.code})`));
      setTimeout(() => rej(new Error('video element: no metadata after 20 s')), 20000);
    });
    const elementDur = player.duration;
    const seen = new Set(); let presented = 0, callbacks = 0, ended = false;
    const cb = (now, md) => {
      callbacks++; seen.add(md.mediaTime); presented = md.presentedFrames;
      if (!ended) player.requestVideoFrameCallback(cb);
    };
    player.requestVideoFrameCallback(cb);
    player.playbackRate = 0.25;
    const t = performance.now();
    const limit = (Number.isFinite(elementDur) ? elementDur : 30) / 0.25 * 1000 + 15000;
    const tick = setInterval(() => setStatus(`Playback check at quarter speed: ${seen.size} frames seen`, Number.isFinite(elementDur) ? player.currentTime / elementDur : null), 500);
    try {
      await player.play();
      await new Promise((res) => { player.onended = res; setTimeout(res, limit); });
    } finally { ended = true; clearInterval(tick); }
    const q = player.getVideoPlaybackQuality ? player.getVideoPlaybackQuality() : {};
    return {
      elementDurSec: +elementDur.toFixed(3), unique: seen.size, callbacks, presented,
      totalVideoFrames: q.totalVideoFrames, dropped: q.droppedVideoFrames,
      ms: Math.round(performance.now() - t), rate: player.playbackRate, endedNaturally: player.ended,
    };
  } finally {
    player.pause(); player.removeAttribute('src'); player.load(); URL.revokeObjectURL(url); player.hidden = true;
  }
}

// ---- checks against task 02's targets ----
function evaluate(run) {
  const c = [];
  const nominal = run.recorded === 'other' ? null : +run.recorded;
  const frames = run.decode ? run.decode.frames : 0;
  const fps = run.decode ? run.decode.fps : 0;
  const span = run.meta ? run.meta.spanSec : 0;
  if (nominal) {
    const needFrames = Math.ceil(nominal * span * 1150 / 1200);
    const needFps = nominal - 1;
    const ok = frames >= needFrames && fps >= needFps;
    c.push([ok ? 'PASS' : 'FAIL', `Frames delivered: ${frames} at ${fps || 0} fps (need at least ${needFrames} at ${needFps} fps or more for a ${nominal} fps clip of ${span} s)`]);
    if (!ok && frames >= 0.9 * (run.meta ? run.meta.samples : 0) && fps && fps < needFps && run.meta && run.meta.samples > 4 * span * 30) {
      c.push(['INFO', 'Many frames but a low frame rate: the timing may have been stretched (slow motion baked in). Paste the results anyway.']);
    }
  } else {
    c.push(['NA', `Frames delivered: ${frames} at ${fps || 0} fps (choose 240 or 120 above to check against a target)`]);
  }
  const k = Math.max(frames, 1) / 1200;
  if (run.decode) {
    const lim = 10000 * k;
    c.push([run.decode.ms < lim ? 'PASS' : 'FAIL', `Decode only: ${sec(run.decode.ms)} (target under ${sec(lim)} for ${frames} frames)`]);
  } else c.push(['FAIL', 'Decode only: did not run']);
  if (run.pose) {
    const lim = 60000 * k, stretch = 30000 * k;
    const tag = run.pose.ms < lim ? 'PASS' : 'FAIL';
    c.push([tag, `Decode plus pose (full, ${run.pose.delegate}${run.pose.fallback ? ', GPU fallback' : ''}, worker): ${sec(run.pose.ms)} (target under ${sec(lim)}; stretch under ${sec(stretch)}: ${run.pose.ms < stretch ? 'met' : 'not met'})`]);
  } else c.push(['FAIL', 'Decode plus pose: did not run']);
  const nErr = (run.errors || []).length;
  c.push([nErr ? 'FAIL' : 'PASS', `Errors in this run: ${nErr}`]);
  return c;
}

function stabilityCheck() {
  const done = runs.filter((r) => !r.crashed).length;
  if (crashes) return ['FAIL', `Stability: ${crashes} crash or reload detected mid-run across ${runs.length} runs`];
  return done >= 3 ? ['PASS', `Stability: ${done} runs, no crash`] : ['NA', `Stability: ${done} of 3 runs so far, no crash yet`];
}

// ---- results text ----
function runText(r) {
  const L = [];
  L.push(`--- run ${r.n} | ${r.at} | picked from: ${r.source} | button: ${r.button} | recorded as: ${r.recorded}${r.recorded === 'other' ? '' : ' fps'}`);
  if (r.crashed) { L.push(`CRASHED or reloaded during "${r.phase}" (file: ${r.file})`); return L.join('\n'); }
  L.push(`file: ${r.file.name} | ${fmtMB(r.file.size)} | type: ${r.file.type || '(none)'} | modified: ${r.file.modified}`);
  const m = r.meta;
  if (m) {
    L.push(`container: brands ${m.brands} | movie timescale ${m.movieTimescale}, duration ${m.movieDurSec} s${m.fragmented ? ' | fragmented' : ''}`);
    L.push(`video: ${m.codec} ${m.size} rot ${m.rotation} | timescale ${m.trackTimescale} | samples ${m.samples} (extracted ${m.extracted}, sync ${m.syncSamples}) | span ${m.spanSec} s | sample-table fps ${m.tableFps} | ${m.videoMB} MB`);
    L.push(`sample deltas: ${m.deltaList.slice(0, 4).join('; ')}${m.deltaList.length > 4 ? `; +${m.deltaList.length - 4} more` : ''}`);
    L.push(`edit list: ${m.edits.length ? m.edits.map((e) => `${e.durSec} s from media ${e.mediaTime} at rate ${e.rate}`).join('; ') : 'none'}`);
    L.push(`other tracks: ${m.otherTracks.join('; ') || 'none'}`);
    L.push(`apple keys: ${m.appleKeys.join(' ') || 'none'}`);
  }
  if (r.parseMs != null) L.push(`read+parse: ${sec(r.parseMs)}`);
  if (r.configSupported) L.push(`decoder config supported: ${r.configSupported.supported ? 'yes' : 'no'}${r.configSupported.error ? ` (${r.configSupported.error})` : ''}`);
  if (r.decode) L.push(`decode only: ${r.decode.frames} frames (${r.decode.unique} unique timestamps) | ${r.decode.fps} fps over ${r.decode.spanSec} s | ${sec(r.decode.ms)}`);
  if (r.pose) {
    const p = r.pose;
    L.push(`decode+pose: model full, ${p.delegate}${p.fallback ? ` (fallback: ${p.fallback})` : ''}, input ${p.input}, worker | ${p.frames} frames, ${p.posed} posed, ${p.detected} with a person | ${sec(p.ms)} | per frame median ${p.perFrame && p.perFrame.median} ms, p95 ${p.perFrame && p.perFrame.p95} ms | engine load ${sec(p.loadMs)}`);
  }
  if (r.model) L.push(`model download: ${r.model.cached ? 'already loaded' : sec(r.model.ms)}`);
  if (r.rvfc) {
    const v = r.rvfc;
    L.push(v.skipped ? `rVFC 0.25x: skipped (${v.skipped})`
      : `rVFC 0.25x: ${v.unique} unique frames (callbacks ${v.callbacks}, presentedFrames ${v.presented}, totalVideoFrames ${v.totalVideoFrames}, dropped ${v.dropped}) | element duration ${v.elementDurSec} s | ${sec(v.ms)}${v.endedNaturally ? '' : ' | stopped by timeout'}`);
  }
  if (r.workerCaps) L.push(`worker: VideoDecoder ${yn(r.workerCaps.videoDecoder)}, OffscreenCanvas ${yn(r.workerCaps.offscreenCanvas)}, OffscreenCanvas WebGL2 ${yn(r.workerCaps.offscreenWebgl2)}`);
  L.push(`errors: ${(r.errors || []).length}${(r.errors || []).length ? '\n  ' + r.errors.slice(0, 8).join('\n  ') : ''}`);
  L.push('checks:');
  for (const [tag, msg] of evaluate(r)) L.push(`  ${tag}  ${msg}`);
  return L.join('\n');
}
const yn = (b) => (b ? 'yes' : 'no');

function render() {
  const d = device;
  const head = [
    `FPS SPIKE RESULTS v${SPIKE_VERSION} | ${location.host || 'local file'} | ${new Date().toISOString()}`,
    `device: ${d.ua}`,
    `features: WebCodecs ${yn(d.webcodecs)} | WebGPU ${yn(d.webgpu)} | OffscreenCanvas ${yn(d.offscreenCanvas)} (WebGL2 ${yn(d.offscreenWebgl2)}) | WebGL2 ${yn(d.webgl2)} | rVFC ${yn(d.rvfc)} | cores ${d.cores} | memory ${d.memoryGB} GB | screen ${d.screen} | GPU ${d.renderer}`,
    `runs: ${runs.length} | crashes detected: ${crashes} | ${stabilityCheck().join('  ')}`,
  ];
  out.value = [...head, ...runs.map(runText)].join('\n');

  checksEl.replaceChildren();
  for (const r of [...runs].reverse()) {
    const card = document.createElement('div'); card.className = 'run';
    const h = document.createElement('h3');
    h.textContent = r.crashed ? `Run ${r.n}: crashed during ${r.phase}` : `Run ${r.n}: ${r.file.name} from ${r.source}`;
    card.append(h);
    if (!r.crashed) {
      const ul = document.createElement('ul');
      for (const [tag, msg] of evaluate(r)) {
        const li = document.createElement('li');
        const t = document.createElement('span'); t.className = `tag ${tag}`; t.textContent = tag;
        li.append(t, ' ', msg); ul.append(li);
      }
      card.append(ul);
    }
    checksEl.append(card);
  }
}

// ---- one run ----
let busy = false;
let currentPhase = '';
function setPhase(p) { currentPhase = p; const f = store.get(INFLIGHT_KEY, null); if (f) { f.phase = p; store.set(INFLIGHT_KEY, f); } }

async function runClip(file, button) {
  if (busy) return; busy = true;
  document.querySelectorAll('.pickers input, #clear').forEach((el) => { el.disabled = true; });
  const run = {
    n: runs.length + 1, at: new Date().toISOString(), source: radio('source'), recorded: radio('recorded'), button,
    file: { name: file.name, size: file.size, type: file.type, modified: file.lastModified ? new Date(file.lastModified).toISOString() : 'n/a' },
    errors: [],
  };
  store.set(INFLIGHT_KEY, { at: run.at, file: file.name, source: run.source, recorded: run.recorded, phase: 'start' });
  try {
    setPhase('parse');
    const t = performance.now();
    const parsed = await parseFile(file, (f) => setStatus(`Reading the file: ${Math.round(f * 100)}%`, f));
    run.parseMs = Math.round(performance.now() - t);
    run.meta = parsed.meta;
    setPhase('model');
    const model = await getModel();
    run.model = { ms: model.ms, cached: model.cached };
    setPhase('worker');
    const w = await runWorker(parsed, model.buf);
    run.workerCaps = w.caps; run.configSupported = w.configSupported; run.decode = w.decode; run.pose = w.pose;
    run.errors.push(...(w.errors || []));
    if ($('do-rvfc').checked) {
      setPhase('rvfc');
      try { run.rvfc = await rvfcPass(file); } catch (e) { run.errors.push(`rVFC: ${e && e.message || e}`); }
    }
    setStatus('Done. Results are below; tap Copy results to paste them into chat.');
  } catch (e) {
    run.errors.push(`fatal: ${e && e.message || e}`);
    setStatus(`Stopped: ${e && e.message || e}`);
  } finally {
    store.del(INFLIGHT_KEY);
    runs.push(run); store.set(RUNS_KEY, runs);
    render();
    busy = false;
    document.querySelectorAll('.pickers input, #clear').forEach((el) => { el.disabled = false; });
    $('pick-video').value = ''; $('pick-any').value = '';
    window.__spikeDone = (window.__spikeDone || 0) + 1; // for the local Playwright test
  }
}

$('pick-video').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) runClip(f, 'video/*'); });
$('pick-any').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) runClip(f, 'any file'); });

$('copy').addEventListener('click', async () => {
  const msg = $('copy-status');
  try {
    await navigator.clipboard.writeText(out.value);
    msg.textContent = 'Copied. Paste it into the chat.';
  } catch {
    out.focus(); out.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* unsupported */ }
    msg.textContent = ok ? 'Copied. Paste it into the chat.' : 'Copy was blocked. The text is selected below: copy it by hand.';
  }
});
$('clear').addEventListener('click', () => {
  if (!confirm('Clear all saved results and the crash counter?')) return;
  runs = []; crashes = 0; store.del(RUNS_KEY); store.del(CRASH_KEY); render();
  $('copy-status').textContent = 'Results cleared.';
});

render();
if (inflight) setStatus('The last run did not finish (the tab crashed or reloaded). It is counted in the results.');
window.__spikeReady = true;
