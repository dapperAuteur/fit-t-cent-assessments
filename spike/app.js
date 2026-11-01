// Slow-motion frame test (spike), version 2. Answers task 02: do 120/240 fps clips reach a web
// page with every frame, and how fast can this phone decode and pose them?
// Main thread: find and parse the movie header (moov) with mp4box.js without reading the whole
// file, read Apple metadata, run the playback (requestVideoFrameCallback) check, show results.
// Worker (pose-worker.js): reads sample data from the File in bounded slices, decodes with
// WebCodecs, fingerprints frames for duplicates, runs pose on the first N seconds.
// Nothing is uploaded; there are no network calls except this site's own files.

const SPIKE_VERSION = '2';
const MP4BOX_URL = 'vendor/mp4box@0.5.4/mp4box.all.min.js';
const MODEL_URL = 'models/pose_landmarker_full.float16.4eaa5eb7.task';
const WASM_BASE = new URL('vendor/tasks-vision@1.2.0/wasm', location.href).href;
const RUNS_KEY = 'fps-spike-runs-v2';
const INFLIGHT_KEY = 'fps-spike-inflight-v2';
const CRASH_KEY = 'fps-spike-crashes-v2';
const OLD_KEYS = ['fps-spike-runs-v1', 'fps-spike-inflight-v1', 'fps-spike-crashes-v1'];
const ALL_KEYS = [RUNS_KEY, INFLIGHT_KEY, CRASH_KEY, ...OLD_KEYS];
const WATCHDOG_MS = 60000; // a worker silent this long is treated as stuck

const $ = (id) => document.getElementById(id);
const statusEl = $('status'), bar = $('bar'), player = $('player');

// ---- storage (best effort; the page works without it) ----
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) {
    try { localStorage.removeItem(k); } catch { /* blocked */ }
    try { sessionStorage.removeItem(k); } catch { /* blocked */ }
    try { if (localStorage.getItem(k) != null) localStorage.setItem(k, 'null'); } catch { /* blocked */ }
  },
};

let runs = store.get(RUNS_KEY, null);
let crashes = store.get(CRASH_KEY, 0) || 0;
if (!Array.isArray(runs)) {
  // First load of version 2: keep the version 1 results so they can be read in the new cards.
  runs = (store.get('fps-spike-runs-v1', []) || []).map((r) => ({ ...r, v: 1 }));
  crashes = store.get('fps-spike-crashes-v1', 0) || 0;
  const old = store.get('fps-spike-inflight-v1', null);
  if (old) { crashes++; runs.push({ v: 1, crashed: true, n: runs.length + 1, at: old.at, file: old.file, source: old.source, recorded: old.recorded, phase: old.phase }); }
  OLD_KEYS.forEach((k) => store.del(k));
  store.set(RUNS_KEY, runs); store.set(CRASH_KEY, crashes);
}
const inflightAtLoad = store.get(INFLIGHT_KEY, null);
if (inflightAtLoad) {
  // The previous run never finished: the tab crashed or was reloaded mid-run.
  crashes += 1; store.set(CRASH_KEY, crashes); store.del(INFLIGHT_KEY);
  runs.push({ ...inflightAtLoad, v: 2, crashed: true });
  store.set(RUNS_KEY, runs);
}

// ---- helpers ----
const fmtMB = (b) => `${(b / 1e6).toFixed(1)} MB`;
const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;
const yn = (b) => (b ? 'yes' : 'no');
const msgOf = (e) => (e && (e.name && e.message ? `${e.name}: ${e.message}` : e.message)) || String(e);
const radio = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
const localTime = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }); } catch { return iso; } };
const fileName = (r) => (r.file && typeof r.file === 'object' ? r.file.name : r.file) || '(unknown file)';
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
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
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
    wakeLock: 'wakeLock' in navigator,
    cores: navigator.hardwareConcurrency || 'n/a',
    memoryGB: navigator.deviceMemory || 'n/a',
    screen: `${screen.width}x${screen.height} @${devicePixelRatio}x`,
    renderer,
  };
}
const device = deviceInfo();

// ---- ISO BMFF / QuickTime box helpers ----
const u32 = (u8, p) => u8[p] * 16777216 + (u8[p + 1] << 16) + (u8[p + 2] << 8) + u8[p + 3];
const fourcc = (u8, p) => String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
const ascii = (u8, a, b) => { let s = ''; for (let i = a; i < b; i++) s += String.fromCharCode(u8[i]); return s; };
function boxes(u8, start, end) {
  const list = []; let p = start;
  while (p + 8 <= end) {
    let size = u32(u8, p), hdr = 8; const type = fourcc(u8, p + 4);
    if (size === 1) { size = u32(u8, p + 8) * 4294967296 + u32(u8, p + 12); hdr = 16; } else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) break;
    list.push({ type, start: p, body: p + hdr, end: p + size });
    p += size;
  }
  return list;
}
const child = (u8, box, type) => boxes(u8, box.body, box.end).find((b) => b.type === type);
const path = (u8, box, ...types) => { let b = box; for (const t of types) { b = b && child(u8, b, t); } return b; };

// Top-level boxes, read 16 bytes at a time, so a 100 MB file is never loaded to find its moov.
async function topBoxes(file) {
  const list = []; let p = 0;
  while (p + 8 <= file.size && list.length < 100) {
    const h = new Uint8Array(await file.slice(p, p + 16).arrayBuffer());
    let size = u32(h, 0), hdr = 8; const type = fourcc(h, 4);
    if (size === 1) { size = u32(h, 8) * 4294967296 + u32(h, 12); hdr = 16; } else if (size === 0) size = file.size - p;
    if (size < hdr || !/^[\x20-\x7e]{4}$/.test(type)) break;
    list.push({ type, start: p, size }); p += size;
  }
  return list;
}

// Decodes a QuickTime well-known data type (keys/ilst and mebx values).
function decodeValue(u8, a, b, type) {
  const n = b - a; const dv = new DataView(u8.buffer, u8.byteOffset + a, n);
  try {
    if (type === 1) return new TextDecoder().decode(u8.subarray(a, b));
    if (type === 23 && n === 4) return +dv.getFloat32(0).toFixed(6);
    if (type === 24 && n === 8) return +dv.getFloat64(0).toFixed(6);
    const signed = [21, 65, 66, 67, 74].includes(type), unsigned = [22, 75, 76, 77, 78].includes(type);
    if (signed || unsigned) {
      if (n === 1) return signed ? dv.getInt8(0) : dv.getUint8(0);
      if (n === 2) return signed ? dv.getInt16(0) : dv.getUint16(0);
      if (n === 4) return signed ? dv.getInt32(0) : dv.getUint32(0);
      if (n === 8) return Number(signed ? dv.getBigInt64(0) : dv.getBigUint64(0));
    }
  } catch { /* fall through */ }
  const bytes = u8.subarray(a, Math.min(b, a + 48));
  const printable = bytes.length && bytes.every((c) => c >= 32 && c < 127);
  return printable ? `"${ascii(u8, a, Math.min(b, a + 96))}"` : `0x${[...bytes].map((c) => c.toString(16).padStart(2, '0')).join('')}${n > 48 ? '...' : ''} (type ${type}, ${n} bytes)`;
}

// QuickTime 'meta' (keys + ilst) anywhere under moov: com.apple.quicktime.* values.
function appleMetadata(u8, moov) {
  const outv = [];
  const visit = (box, depth) => {
    if (depth > 4) return;
    for (const b of boxes(u8, box.body, box.end)) {
      if (b.type === 'meta') {
        let body = b.body;
        if (fourcc(u8, body + 4) !== 'hdlr' && fourcc(u8, body + 8) === 'hdlr') body += 4; // ISO full box
        const kids = boxes(u8, body, b.end);
        const keysBox = kids.find((k) => k.type === 'keys'), ilst = kids.find((k) => k.type === 'ilst');
        const keys = [];
        if (keysBox) {
          let p = keysBox.body + 8; const count = u32(u8, keysBox.body + 4);
          for (let i = 0; i < count && p + 8 <= keysBox.end; i++) { const ks = u32(u8, p); if (ks < 8) break; keys.push(ascii(u8, p + 8, p + ks)); p += ks; }
        }
        if (ilst) {
          for (const item of boxes(u8, ilst.body, ilst.end)) {
            const idx = u32(u8, item.start + 4);
            const name = idx >= 1 && idx <= keys.length ? keys[idx - 1] : fourcc(u8, item.start + 4);
            const data = boxes(u8, item.body, item.end).find((d) => d.type === 'data');
            if (data) outv.push({ key: name, value: decodeValue(u8, data.body + 8, data.end, u32(u8, data.body) & 0xffffff) });
          }
        }
        keys.filter((k) => !outv.some((o) => o.key === k)).forEach((k) => outv.push({ key: k, value: '(no value)' }));
      } else if (['trak', 'udta', 'mdia', 'minf'].includes(b.type)) visit(b, depth + 1);
    }
  };
  visit(moov, 0);
  return outv;
}

// Timed-metadata ('mebx') sample descriptions: local key id -> { key, type }.
function mebxTracks(u8, moov) {
  const outv = [];
  for (const trak of boxes(u8, moov.body, moov.end).filter((b) => b.type === 'trak')) {
    const tkhd = child(u8, trak, 'tkhd'); if (!tkhd) continue;
    const id = u32(u8, tkhd.body + (u8[tkhd.body] === 1 ? 20 : 12));
    const stsd = path(u8, trak, 'mdia', 'minf', 'stbl', 'stsd'); if (!stsd) continue;
    for (const entry of boxes(u8, stsd.body + 8, stsd.end)) {
      if (entry.type !== 'mebx') continue;
      const keysBox = boxes(u8, entry.body + 8, entry.end).find((b) => b.type === 'keys');
      const keys = {};
      if (keysBox) {
        for (const k of boxes(u8, keysBox.body, keysBox.end)) {
          const local = u32(u8, k.start + 4);
          const keyd = child(u8, k, 'keyd'), dtyp = child(u8, k, 'dtyp');
          const name = keyd ? ascii(u8, keyd.body + 4, keyd.end) : '?';
          let type = null;
          if (dtyp) type = u32(u8, dtyp.body) === 0 ? u32(u8, dtyp.body + 4) : ascii(u8, dtyp.body + 4, dtyp.end);
          keys[local] = { key: name, type };
        }
      }
      outv.push({ trackId: id, keys });
    }
  }
  return outv;
}

function decodeMebxSample(u8, keys) {
  const vals = [];
  for (const b of boxes(u8, 0, u8.length)) {
    const k = keys[u32(u8, b.start + 4)] || { key: `local key ${u32(u8, b.start + 4)}`, type: null };
    vals.push(`${k.key} = ${decodeValue(u8, b.body, b.end, typeof k.type === 'number' ? k.type : -1)}`);
  }
  return vals.length ? vals : [`(${u8.length} bytes, no boxes)`];
}

// ---- container parse ----
async function parseFile(file) {
  const tops = await topBoxes(file);
  const moovTop = tops.find((b) => b.type === 'moov');
  if (!moovTop) throw new Error(`no movie header (moov) found; top-level boxes: ${tops.map((b) => b.type).join(' ') || 'none'}`);
  if (moovTop.size > 128e6) throw new Error(`movie header is ${fmtMB(moovTop.size)}, too large for this test`);
  const ftypTop = tops.find((b) => b.type === 'ftyp' && b.size < 4096);
  const moovBuf = await file.slice(moovTop.start, moovTop.start + moovTop.size).arrayBuffer();
  const ftypBuf = ftypTop ? await file.slice(ftypTop.start, ftypTop.start + ftypTop.size).arrayBuffer() : new ArrayBuffer(0);
  const combined = new Uint8Array(ftypBuf.byteLength + moovBuf.byteLength);
  combined.set(new Uint8Array(ftypBuf), 0); combined.set(new Uint8Array(moovBuf), ftypBuf.byteLength);

  await loadScript(MP4BOX_URL);
  const mp4 = self.MP4Box.createFile();
  let info = null, parseErr = null;
  mp4.onError = (e) => { parseErr = e; };
  mp4.onReady = (i) => { info = i; };
  // Sample offsets come from the moov's chunk tables, so they stay valid for the real file.
  const feed = combined.buffer.slice(0); feed.fileStart = 0;
  mp4.appendBuffer(feed); mp4.flush();
  if (parseErr) throw new Error(`container parse error: ${parseErr}`);
  if (!info) throw new Error('mp4box.js could not read the movie header');
  if (info.isFragmented) throw new Error('fragmented MP4 is not supported by this test');
  const vt = info.videoTracks[0];
  if (!vt) throw new Error('no video track in this file');

  const trak = mp4.getTrackById(vt.id);
  let description;
  for (const e of trak.mdia.minf.stbl.stsd.entries) {
    const box = e.avcC || e.hvcC || e.vpcC || e.av1C;
    if (box) { const DS = self.DataStream; const st = new DS(undefined, 0, DS.BIG_ENDIAN); box.write(st); description = new Uint8Array(st.buffer, 8); }
  }
  const config = { codec: vt.codec, codedWidth: vt.video.width, codedHeight: vt.video.height, description, hardwareAcceleration: 'no-preference' };
  const samples = trak.samples.map((s) => ({ offset: s.offset, size: s.size, cts: s.cts, duration: s.duration, is_sync: !!s.is_sync }));

  const stts = trak.mdia.minf.stbl.stts;
  const deltas = {};
  stts.sample_counts.forEach((c, i) => { deltas[stts.sample_deltas[i]] = (deltas[stts.sample_deltas[i]] || 0) + c; });
  const tsc = vt.timescale;
  const spanTicks = stts.sample_counts.reduce((a, c, i) => a + c * stts.sample_deltas[i], 0);
  const spanSec = spanTicks / tsc;
  const tableFps = spanSec > 0 ? samples.length / spanSec : null;
  const deltaList = Object.entries(deltas).sort((a, b) => b[1] - a[1]).map(([d, c]) => `${d} ticks x${c} (${(tsc / d).toFixed(2)} fps)`);
  // Where the sample-table deltas change (a variable-rate file would show its ramps here).
  const runsOfDeltas = stts.sample_counts.length > 1 ? stts.sample_counts.slice(0, 12).map((c, i) => `${c}x${stts.sample_deltas[i]}`).join(' ') : null;

  const m = vt.matrix || [];
  const rotation = m.length >= 2 ? Math.round(Math.atan2(m[1] / 65536, m[0] / 65536) * 180 / Math.PI) : 0;
  const edits = (vt.edits || []).map((e) => ({
    durSec: +(e.segment_duration / info.timescale).toFixed(3), mediaTime: e.media_time,
    rate: +(e.media_rate_integer + e.media_rate_fraction / 65536).toFixed(4),
  }));
  const otherTracks = info.tracks.filter((t) => t.id !== vt.id).map((t) => {
    const tk = mp4.getTrackById(t.id);
    const h = tk && tk.mdia && tk.mdia.hdlr ? tk.mdia.hdlr.handler : t.type;
    return `${h}:${t.codec || '?'}${t.nb_samples != null ? ` (${t.nb_samples} samples)` : ''}`;
  });

  // Apple metadata: moov keys/ilst values, then the timed-metadata samples (first 4 per track).
  const mu8 = new Uint8Array(moovBuf);
  const moovBox = { body: 8, end: mu8.length };
  if (u32(mu8, 0) === 1) moovBox.body = 16;
  let apple = [], mebx = [];
  try { apple = appleMetadata(mu8, moovBox); } catch (e) { apple = [{ key: 'parse error', value: msgOf(e) }]; }
  try {
    for (const t of mebxTracks(mu8, moovBox)) {
      const tk = mp4.getTrackById(t.trackId);
      const list = tk && tk.samples ? tk.samples : [];
      const vals = [];
      for (const s of list.slice(0, 4)) {
        const u8 = new Uint8Array(await file.slice(s.offset, s.offset + Math.min(s.size, 4096)).arrayBuffer());
        vals.push(`at ${(s.cts / s.timescale).toFixed(3)} s: ${decodeMebxSample(u8, t.keys).join('; ')}`);
      }
      mebx.push({ trackId: t.trackId, samples: list.length, keys: Object.values(t.keys).map((k) => `${k.key} (${k.type})`), values: vals });
    }
  } catch (e) { mebx.push({ error: msgOf(e) }); }
  const creation = apple.find((a) => a.key === 'com.apple.quicktime.creationdate');

  return {
    config, samples, timescale: tsc, rotation,
    meta: {
      brands: info.brands.join(','), movieTimescale: info.timescale, movieDurSec: +(info.duration / info.timescale).toFixed(3),
      topBoxes: tops.map((b) => b.type).join(' '), codec: vt.codec, size: `${vt.video.width}x${vt.video.height}`, rotation,
      trackTimescale: tsc, samples: samples.length, spanSec: +spanSec.toFixed(3), tableFps: tableFps && +tableFps.toFixed(2),
      deltaList, runsOfDeltas, edits, otherTracks, syncSamples: samples.filter((s) => s.is_sync).length,
      videoMB: +(samples.reduce((a, s) => a + s.size, 0) / 1e6).toFixed(1), moovKB: Math.round(moovTop.size / 1024),
      apple, mebx, clipId: creation ? String(creation.value) : null,
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

// ---- run state, crash marker, stop ----
let busy = false;
let current = null; // { run, inflight, worker, abort, finishWorker, t0 }
let lastInflightSave = 0;
function saveInflight(force) {
  if (!current) return;
  const now = Date.now();
  if (!force && now - lastInflightSave < 1000) return;
  lastInflightSave = now;
  current.inflight.elapsedMs = Math.round(performance.now() - current.t0);
  current.inflight.savedAt = new Date().toISOString();
  store.set(INFLIGHT_KEY, current.inflight);
}
function setPhase(phase, done, total) {
  if (!current) return;
  const f = current.inflight;
  const changed = f.phase !== phase;
  f.phase = phase; f.progress = done != null ? { done, total } : null;
  saveInflight(changed);
}

// ---- worker run (with watchdog) ----
function runWorker(parsed, model, settings) {
  return new Promise((resolve) => {
    const w = new Worker('pose-worker.js', { type: 'module' });
    const labels = { decode: 'Decode only (WebCodecs)', frames: 'Frame check (duplicates)', load: 'Loading the pose engine', pose: 'Decode plus pose (full model)' };
    let last = performance.now(), phase = 'start', done = 0, total = 0, finished = false;
    const finish = (m) => { if (finished) return; finished = true; clearInterval(dog); w.terminate(); resolve(m); };
    current.finishWorker = finish;
    const dog = setInterval(() => {
      const quiet = performance.now() - last;
      if (quiet > WATCHDOG_MS) finish({ errors: [`worker stopped responding during ${phase} after ${done} of ${total} (no message for ${sec(quiet)}); it was stopped so the run could finish`], hung: true });
    }, 2000);
    w.onmessage = ({ data: m }) => {
      last = performance.now();
      if (m.type === 'pass') {
        current.inflight[m.key] = m.value; current.inflight.errors = m.errors;
        saveInflight(true);
        return;
      }
      if (m.type === 'progress') {
        phase = m.phase; done = m.done; total = m.total;
        setPhase(m.phase, m.done, m.total);
        setStatus(`${labels[m.phase] || m.phase}: ${m.done} of ${m.total}`, m.total ? m.done / m.total : null);
        return;
      }
      finish(m);
    };
    w.onerror = (e) => { e.preventDefault(); finish({ errors: [`worker error: ${e.message || 'unknown (module workers may be unsupported)'}`] }); };
    w.onmessageerror = () => finish({ errors: ['worker message could not be read'] });
    const passes = ['decode'];
    if (settings.frameCheck) passes.push('frames');
    if (settings.pose && model) passes.push('pose');
    const msg = {
      file: parsed.file, samples: parsed.samples, timescale: parsed.timescale, config: parsed.config, rotation: parsed.rotation,
      model: model ? model.slice(0) : null, wasmBase: WASM_BASE, passes, poseMaxSec: settings.maxSec, debug: /debug/.test(location.search),
    };
    w.postMessage(msg, msg.model ? [msg.model] : []);
  });
}

// ---- requestVideoFrameCallback pass at 0.25x over the first N seconds ----
const tapRow = $('tap-row');
function askForTap(signal) {
  return new Promise((resolve) => {
    tapRow.hidden = false;
    setStatus('Safari wants a tap before it plays the clip for the playback check.');
    const done = (v) => { tapRow.hidden = true; $('tap-play').onclick = null; $('tap-skip').onclick = null; clearTimeout(timer); signal.removeEventListener('abort', onAbort); resolve(v); };
    const onAbort = () => done(false);
    signal.addEventListener('abort', onAbort);
    const timer = setTimeout(() => done(false), 120000);
    // play() is called inside the tap, which Safari's autoplay policy accepts.
    $('tap-play').onclick = () => { player.play().then(() => done(true), () => done(false)); };
    $('tap-skip').onclick = () => done(false);
    $('tap-play').focus();
  });
}

async function rvfcPass(file, maxSec, signal) {
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return { skipped: 'requestVideoFrameCallback not supported' };
  const url = URL.createObjectURL(file);
  player.muted = true; player.defaultMuted = true; player.playsInline = true;
  player.setAttribute('muted', ''); player.setAttribute('playsinline', ''); player.setAttribute('webkit-playsinline', '');
  player.hidden = false; player.src = url;
  try {
    await new Promise((res, rej) => {
      player.onloadedmetadata = res; player.onerror = () => rej(new Error(`video element could not load this file (code ${player.error && player.error.code})`));
      setTimeout(() => rej(new Error('video element: no metadata after 20 s')), 20000);
    });
    const elementDur = player.duration;
    const limitSec = Number.isFinite(maxSec) && Number.isFinite(elementDur) ? Math.min(maxSec, elementDur) : (Number.isFinite(elementDur) ? elementDur : 30);
    const seen = new Set(); let presented = 0, callbacks = 0, stopped = false;
    const cb = (now, md) => { callbacks++; seen.add(md.mediaTime); presented = md.presentedFrames; if (!stopped) player.requestVideoFrameCallback(cb); };
    player.requestVideoFrameCallback(cb);
    player.defaultPlaybackRate = 0.25; player.playbackRate = 0.25;
    let how = 'automatically';
    try { await player.play(); }
    catch (e) {
      if (e && e.name !== 'NotAllowedError') throw e;
      how = 'after a tap';
      const ok = await askForTap(signal);
      if (!ok) return { skipped: 'Safari blocked playback', detail: msgOf(e) };
      player.playbackRate = 0.25;
    }
    const t = performance.now();
    const limitMs = limitSec / 0.25 * 1000 + 15000;
    await new Promise((res) => {
      const iv = setInterval(() => {
        setStatus(`Playback check at quarter speed: ${seen.size} frames seen`, player.currentTime / limitSec);
        if (player.ended || player.currentTime >= limitSec || performance.now() - t > limitMs || signal.aborted) { clearInterval(iv); res(); }
      }, 200);
    });
    stopped = true; player.pause();
    const q = player.getVideoPlaybackQuality ? player.getVideoPlaybackQuality() : {};
    return {
      elementDurSec: +elementDur.toFixed(3), playedSec: +player.currentTime.toFixed(3), limitSec: +limitSec.toFixed(1),
      unique: seen.size, callbacks, presented, totalVideoFrames: q.totalVideoFrames, dropped: q.droppedVideoFrames,
      ms: Math.round(performance.now() - t), rate: player.playbackRate, started: how,
    };
  } finally {
    player.pause(); player.removeAttribute('src'); player.load(); URL.revokeObjectURL(url); player.hidden = true;
  }
}

// ---- checks ----
const framesOf = (r) => (r.frames && r.frames.frames) || (r.decode && r.decode.frames) || 0;
function captureEvidence(run, all) {
  const m = run.meta; if (!m) return null;
  const n = framesOf(run); if (!n) return null;
  if (m.tableFps >= 90) return { fps: m.tableFps, how: `the file's own timestamps (${m.tableFps} fps)` };
  if (m.clipId) {
    const ref = all.find((o) => o !== run && !o.crashed && o.meta && o.meta.clipId === m.clipId && o.meta.tableFps >= 90);
    if (ref) return { fps: +(n / ref.meta.spanSec).toFixed(2), how: `run ${ref.n}, the same clip (creation date ${m.clipId}) as a ${ref.meta.tableFps} fps original of ${ref.meta.spanSec} s: ${n} frames / ${ref.meta.spanSec} s` };
  }
  const real = run.settings && run.settings.realSec;
  if (real > 0) return { fps: +(n / real).toFixed(2), how: `your entry of ${real} s filmed: ${n} frames / ${real} s (only as exact as that timing)` };
  return null;
}

function evaluate(run, all = runs) {
  const c = [];
  const nominal = run.recorded === 'other' ? null : +run.recorded;
  const n = framesOf(run);
  const m = run.meta;
  if (run.decode) c.push(['INFO', `Frames delivered: ${n}, timestamped at ${run.decode.fps || 0} fps over ${run.decode.spanSec} s of file time`]);
  // Frame test: unique frames and capture rate (replaces "N frames at 239 fps").
  let uniqueOk = null;
  if (run.frames && run.frames.frames) {
    const f = run.frames; const pct = 100 * f.unique / f.frames;
    uniqueOk = pct >= 95;
    c.push([uniqueOk ? 'PASS' : 'FAIL', `Unique frames: ${f.unique} of ${f.frames} (${pct.toFixed(1)}%; need 95% or more). Duplicates by tenth: ${f.tenths.map((t) => t.dups).join(' ')}`]);
  } else c.push(['NA', run.v === 1 ? 'Unique frames: not measured (version 1 run)' : 'Unique frames: not measured (frame check off or did not run)']);
  let rateOk = null;
  if (nominal && n) {
    const ev = captureEvidence(run, all);
    if (ev) {
      const off = Math.abs(ev.fps - nominal) / nominal;
      rateOk = off <= 0.05;
      c.push([rateOk ? 'PASS' : 'FAIL', `Capture rate: ${ev.fps} fps from ${ev.how}; recorded as ${nominal} (need within 5%, off by ${(off * 100).toFixed(1)}%)`]);
    } else {
      c.push(['UNKNOWN', `Capture rate: this file's timestamps are ${m ? m.tableFps : '?'} fps, so the capture rate can't be read from it. Pick the same clip from Files (the page matches it by creation date), or enter the seconds you filmed.`]);
    }
    if (m && m.spanSec) {
      const real = n / nominal;
      c.push(['INFO', `If captured at ${nominal} fps: real time = ${n} / ${nominal} = ${real.toFixed(2)} s; slow-motion factor = ${m.spanSec} / ${real.toFixed(2)} = ${(m.spanSec / real).toFixed(2)}`]);
    }
  } else if (!nominal) c.push(['NA', 'Capture rate: choose 240 or 120 above to check against a target']);
  if (uniqueOk != null && rateOk != null) c.push([uniqueOk && rateOk ? 'PASS' : 'FAIL', `Frame test overall (unique frames and capture rate): ${uniqueOk && rateOk ? 'pass' : 'fail'}`]);
  if (run.frames && run.frames.endsVsMiddle != null && run.frames.endsVsMiddle >= 2) {
    c.push(['INFO', `The ends of the clip change ${run.frames.endsVsMiddle}x more per frame than the middle: they likely play at normal speed, with frames dropped there (a speed ramp).`]);
  }
  if (run.decode) {
    const lim = 10000 * Math.max(run.decode.frames, 1) / 1200;
    c.push([run.decode.ms < lim ? 'PASS' : 'FAIL', `Decode only: ${sec(run.decode.ms)} for ${run.decode.frames} frames (target under ${sec(lim)}, scaled from 10 s per 1,200 frames)`]);
  } else c.push(['FAIL', 'Decode only: did not run']);
  if (run.pose) {
    const p = run.pose; const k = Math.max(p.posed, 1) / 1200;
    const lim = 60000 * k, stretch = 30000 * k;
    c.push([p.ms < lim ? 'PASS' : 'FAIL', `Decode plus pose (full, ${p.delegate}${p.fallback ? ', GPU fallback' : ''}, worker): ${sec(p.ms)} for ${p.posed} frames${p.maxSec ? ` (first ${p.maxSec} s)` : ''} (target under ${sec(lim)}; stretch under ${sec(stretch)}: ${p.ms < stretch ? 'met' : 'not met'})`]);
  } else if (run.settings && run.settings.pose === false) c.push(['NA', 'Decode plus pose: off for this run']);
  else c.push(['FAIL', 'Decode plus pose: did not run']);
  const nErr = (run.errors || []).length;
  c.push([nErr ? 'FAIL' : 'PASS', `Errors in this run: ${nErr}`]);
  return c;
}

function stabilityCheck() {
  const done = runs.filter((r) => !r.crashed).length;
  if (crashes) return ['FAIL', `Stability: ${crashes} crash or reload detected mid-run across ${runs.length} runs`];
  return done >= 3 ? ['PASS', `Stability: ${done} runs, no crash`] : ['NA', `Stability: ${done} of 3 runs so far, no crash yet`];
}

function verdict(r) {
  if (r.crashed) return 'CRASHED';
  if (r.stopped) return 'STOPPED';
  const tags = evaluate(r).map(([t]) => t);
  return tags.includes('FAIL') ? 'FAIL' : tags.includes('UNKNOWN') ? 'UNKNOWN' : 'PASS';
}

// ---- results text ----
function settingsText(s) {
  if (!s) return null;
  return `settings: pose and playback on ${Number.isFinite(s.maxSec) ? `the first ${s.maxSec} s` : 'the whole clip'} | frame check ${s.frameCheck ? 'on' : 'off'} | pose ${s.pose ? 'on' : 'off'} | playback check ${s.rvfc ? 'on' : 'off'} | trimmed in Photos: ${s.trimmed ? 'yes' : 'no'} | seconds filmed: ${s.realSec || 'not given'}`;
}

function runText(r) {
  const L = [];
  const fileObj = r.file && typeof r.file === 'object' ? r.file : null;
  L.push(`=== Run ${r.n} | ${r.at ? localTime(r.at) : 'time unknown'} | ${fileName(r)} | from ${r.source || '?'}${r.button ? ` | button ${r.button}` : ''} | recorded as ${r.recorded}${r.recorded === 'other' ? '' : ' fps'} | ${verdict(r)}`);
  if (r.crashed) {
    const pr = r.progress ? ` at ${r.progress.done} of ${r.progress.total}` : '';
    L.push(`CRASHED: the tab crashed or the page reloaded during "${r.phase || 'unknown'}"${pr}${r.elapsedMs != null ? `, ${sec(r.elapsedMs)} into the run` : ''}${r.savedAt ? ` (last saved ${localTime(r.savedAt)})` : ''}`);
    if (r.v === 1) L.push('(version 1 run: the page did not save more detail before a crash)');
  }
  if (r.stopped) L.push(`STOPPED: ${r.stopped}`);
  const st = settingsText(r.settings); if (st) L.push(st);
  if (fileObj) L.push(`file: ${fileObj.name} | ${fmtMB(fileObj.size)} | type: ${fileObj.type || '(none)'} | modified: ${fileObj.modified}`);
  const m = r.meta;
  if (m) {
    L.push(`container: brands ${m.brands} | movie timescale ${m.movieTimescale}, duration ${m.movieDurSec} s${m.topBoxes ? ` | top boxes: ${m.topBoxes}` : ''}${m.moovKB ? ` | moov ${m.moovKB} KB` : ''}`);
    L.push(`video: ${m.codec} ${m.size} rot ${m.rotation} | timescale ${m.trackTimescale} | samples ${m.samples} (sync ${m.syncSamples}) | span ${m.spanSec} s | sample-table fps ${m.tableFps} | ${m.videoMB} MB`);
    L.push(`sample deltas: ${m.deltaList.slice(0, 4).join('; ')}${m.deltaList.length > 4 ? `; +${m.deltaList.length - 4} more` : ''}`);
    if (m.runsOfDeltas) L.push(`sample delta runs (count x ticks): ${m.runsOfDeltas}`);
    L.push(`edit list: ${m.edits.length ? m.edits.map((e) => `${e.durSec} s from media ${e.mediaTime} at rate ${e.rate}`).join('; ') : 'none'}`);
    L.push(`other tracks: ${m.otherTracks.join('; ') || 'none'}`);
    if (m.apple) L.push(`apple metadata: ${m.apple.length ? m.apple.map((a) => `${a.key} = ${a.value}`).join('; ') : 'none'}`);
    else if (m.appleKeys) L.push(`apple keys: ${m.appleKeys.join(' ') || 'none'}`);
    for (const t of m.mebx || []) {
      if (t.error) { L.push(`timed metadata: parse error: ${t.error}`); continue; }
      L.push(`timed metadata (mebx, track ${t.trackId}, ${t.samples} samples): keys ${t.keys.join(', ') || 'none'}`);
      for (const v of t.values) L.push(`  ${v}`);
    }
  }
  if (r.hints) L.push(`before the crash: ${r.hints}`);
  if (r.parseMs != null) L.push(`read+parse: ${sec(r.parseMs)}${r.wakeLock ? ` | screen wake lock: ${r.wakeLock}` : ''}${r.visibility ? ` | page hidden: ${r.visibility.length ? r.visibility.join('; ') : 'never'}` : ''}`);
  else if (r.visibility && r.visibility.length) L.push(`page visibility: ${r.visibility.join('; ')}`);
  if (r.configSupported) L.push(`decoder config supported: ${r.configSupported.supported ? 'yes' : 'no'}${r.configSupported.error ? ` (${r.configSupported.error})` : ''}${r.model ? ` | model download: ${r.model.cached ? 'already loaded' : sec(r.model.ms)}` : ''}`);
  if (r.decode) {
    const d = r.decode;
    L.push(`decode only: ${d.frames} frames (${d.unique} unique timestamps) | ${d.fps} fps over ${d.spanSec} s | ${sec(d.ms)}${d.readMB != null ? ` | read ${d.readMB} MB in ${d.slices} slices (largest ${d.maxSliceMB} MB)` : ''}${d.restarts ? ` | decoder restarts ${d.restarts}, samples skipped ${d.skipped}` : ''}`);
  }
  if (r.frames) {
    const f = r.frames;
    L.push(`frame check: ${f.frames} frames, ${f.unique} unique, ${f.dups} duplicates (difference ${f.rule || `under ${f.threshold}`}), ${f.exactZero} identical | difference p10 ${f.p10}, median ${f.median}, p90 ${f.p90} | longest duplicate run ${f.longestRun}${f.longestRun ? ` from frame ${f.longestRunAt}` : ''}${f.dups ? ` | first ${f.firstDup}, last ${f.lastDup}` : ''} | ${sec(f.ms)} (${f.method})`);
    L.push(`frame check by tenth of the clip (duplicates / median difference): ${f.tenths.map((t, i) => `${i + 1}: ${t.dups}/${t.median}`).join(' | ')}`);
    if (f.endsVsMiddle != null) L.push(`ends vs middle change per frame: ${f.endsVsMiddle}x (about ${r.recorded === '120' ? 4 : 8}x would mean the ends play at normal speed, so frames were dropped there)`);
  }
  if (r.pose) {
    const p = r.pose;
    L.push(`decode+pose: ${p.maxSec ? `first ${p.maxSec} s` : 'whole clip'} | model full, ${p.delegate}${p.fallback ? ` (fallback: ${p.fallback})` : ''}, input ${p.input}${p.inputSize ? ` ${p.inputSize}` : ''}${p.rotationApplied ? ` (rotated ${p.rotationApplied})` : ''}, worker | ${p.frames} frames, ${p.posed} posed, ${p.detected} with a person | ${sec(p.ms)} | per frame median ${p.perFrame && p.perFrame.median} ms, p95 ${p.perFrame && p.perFrame.p95} ms | engine load ${sec(p.loadMs)}`);
  }
  if (r.rvfc) {
    const v = r.rvfc;
    L.push(v.skipped ? `rVFC 0.25x: skipped (${v.skipped}${v.detail ? `: ${v.detail}` : ''})`
      : `rVFC 0.25x: ${v.unique} unique frames in ${v.playedSec} s of ${v.elementDurSec} s (started ${v.started}; callbacks ${v.callbacks}, presentedFrames ${v.presented}, totalVideoFrames ${v.totalVideoFrames}, dropped ${v.dropped}) | ${sec(v.ms)}`);
  }
  if (r.workerCaps) L.push(`worker: VideoDecoder ${yn(r.workerCaps.videoDecoder)}, OffscreenCanvas ${yn(r.workerCaps.offscreenCanvas)}, OffscreenCanvas WebGL2 ${yn(r.workerCaps.offscreenWebgl2)}`);
  const errs = r.errors || [];
  L.push(`errors: ${errs.length}${errs.length ? '\n  ' + errs.slice(0, 12).join('\n  ') : ''}`);
  if (!r.crashed) {
    L.push('checks:');
    for (const [tag, msg] of evaluate(r)) L.push(`  ${tag}  ${msg}`);
  }
  return L.join('\n');
}

function headText() {
  const d = device;
  return [
    `FPS SPIKE RESULTS v${SPIKE_VERSION} | ${location.host || 'local file'} | ${new Date().toISOString()}`,
    `device: ${d.ua}`,
    `features: WebCodecs ${yn(d.webcodecs)} | WebGPU ${yn(d.webgpu)} | OffscreenCanvas ${yn(d.offscreenCanvas)} (WebGL2 ${yn(d.offscreenWebgl2)}) | WebGL2 ${yn(d.webgl2)} | rVFC ${yn(d.rvfc)} | wake lock ${yn(d.wakeLock)} | cores ${d.cores} | memory ${d.memoryGB} GB | screen ${d.screen} | GPU ${d.renderer}`,
    `runs: ${runs.length} | crashes detected: ${crashes} | ${stabilityCheck().join('  ')}`,
  ].join('\n');
}
const allText = () => [headText(), ...[...runs].reverse().map(runText)].join('\n\n');

// ---- rendering ----
function render() {
  const list = $('checks');
  list.replaceChildren();
  $('empty').hidden = runs.length > 0;
  [...runs].reverse().forEach((r, i) => {
    const det = document.createElement('details'); det.className = 'run'; det.open = i === 0;
    const sum = document.createElement('summary');
    const v = verdict(r);
    const tag = document.createElement('span'); tag.className = `tag ${v}`; tag.textContent = v;
    const title = document.createElement('span'); title.className = 'run-title';
    title.textContent = `Run ${r.n}: ${fileName(r)} from ${r.source || '?'}`;
    const when = document.createElement('span'); when.className = 'run-when';
    when.textContent = `${r.at ? localTime(r.at) : 'time unknown'}${r.crashed ? ` | crashed during ${r.phase || 'unknown'}` : ''}`;
    sum.append(tag, ' ', title, when);
    det.append(sum);
    if (!r.crashed) {
      const ul = document.createElement('ul');
      for (const [t, msg] of evaluate(r)) {
        const li = document.createElement('li');
        const s = document.createElement('span'); s.className = `tag ${t}`; s.textContent = t;
        li.append(s, ' ', msg); ul.append(li);
      }
      det.append(ul);
    }
    const pre = document.createElement('pre'); pre.className = 'lines'; pre.tabIndex = 0;
    pre.textContent = runText(r);
    const copyOne = document.createElement('button'); copyOne.type = 'button'; copyOne.className = 'btn small'; copyOne.textContent = `Copy run ${r.n}`;
    copyOne.addEventListener('click', () => copyText(runText(r), `Run ${r.n} copied.`));
    det.append(pre, copyOne);
    list.append(det);
  });
  $('out').value = allText();
  $('clear').disabled = busy || runs.length === 0 && crashes === 0;
}

// ---- copy, select all, clear ----
function selectAll(ta) {
  // iOS Safari ignores select() on a read-only textarea; this sequence selects it there too.
  const ro = ta.readOnly;
  ta.readOnly = false; ta.contentEditable = 'true';
  ta.focus();
  try { const range = document.createRange(); range.selectNodeContents(ta); const s = getSelection(); s.removeAllRanges(); s.addRange(range); } catch { /* ok */ }
  ta.setSelectionRange(0, ta.value.length);
  ta.contentEditable = 'false'; ta.readOnly = ro;
}
async function copyText(text, okMsg) {
  const msg = $('copy-status');
  try { await navigator.clipboard.writeText(text); msg.textContent = okMsg; return; } catch { /* fall back */ }
  const ta = $('out'); const before = ta.value; ta.value = text;
  $('all-panel').hidden = false; selectAll(ta);
  let ok = false; try { ok = document.execCommand('copy'); } catch { /* unsupported */ }
  if (text !== before && ok) ta.value = before;
  msg.textContent = ok ? okMsg : 'Copy was blocked. The text is selected in the box below: copy it by hand.';
}

$('copy').addEventListener('click', () => copyText(allText(), 'Copied. Paste it into the chat.'));
$('show-all').addEventListener('click', () => {
  const panel = $('all-panel'); panel.hidden = !panel.hidden;
  $('show-all').setAttribute('aria-expanded', String(!panel.hidden));
  $('show-all').textContent = panel.hidden ? 'Show all results as text' : 'Hide the results text';
  if (!panel.hidden) { $('out').value = allText(); panel.scrollIntoView({ block: 'start' }); }
});
$('select-all').addEventListener('click', () => { selectAll($('out')); $('copy-status').textContent = 'Selected. Use Copy from the menu, or the Copy button.'; });
$('copy-all-2').addEventListener('click', () => copyText(allText(), 'Copied. Paste it into the chat.'));

// Clear: an in-page confirm step (window.confirm is avoided; it can be suppressed on iOS).
$('clear').addEventListener('click', () => {
  $('clear-confirm').hidden = false;
  $('clear-q').textContent = `Delete all ${runs.length} saved runs and the crash counter from this browser?`;
  $('clear-yes').focus();
});
$('clear-no').addEventListener('click', () => { $('clear-confirm').hidden = true; $('clear').focus(); });
$('clear-yes').addEventListener('click', () => {
  if (busy) { $('copy-status').textContent = 'A run is in progress. Stop it first, then clear.'; return; }
  runs = []; crashes = 0;
  ALL_KEYS.forEach((k) => store.del(k));
  const left = ALL_KEYS.filter((k) => { try { const v = localStorage.getItem(k); return v != null && v !== 'null'; } catch { return false; } });
  $('clear-confirm').hidden = true;
  render();
  $('copy-status').textContent = left.length ? `Cleared on screen, but this browser kept: ${left.join(', ')}.` : 'Results cleared.';
  setStatus('Waiting for a clip.');
});

// ---- one run ----
function readSettings() {
  const max = $('max-sec').value;
  const real = parseFloat($('real-sec').value);
  return {
    maxSec: max === 'all' ? null : +max,
    frameCheck: $('do-frames').checked, pose: $('do-pose').checked, rvfc: $('do-rvfc').checked,
    trimmed: $('trimmed').checked, realSec: Number.isFinite(real) && real > 0 ? real : null,
  };
}
function setRunning(on) {
  busy = on;
  document.querySelectorAll('.pickers input[type=file], #settings input, #settings select').forEach((el) => { el.disabled = on; });
  $('stop').hidden = !on;
  $('clear').disabled = on || (runs.length === 0 && crashes === 0);
}

async function runClip(file, button) {
  if (busy) return;
  const settings = readSettings();
  const t0 = performance.now();
  const n = runs.reduce((a, r) => Math.max(a, r.n || 0), 0) + 1;
  const run = {
    v: 2, n, at: new Date().toISOString(), source: radio('source'), recorded: radio('recorded'), button, settings,
    file: { name: file.name, size: file.size, type: file.type, modified: file.lastModified ? new Date(file.lastModified).toISOString() : 'n/a' },
    errors: [], visibility: [],
  };
  const abort = new AbortController();
  current = { run, t0, abort, finishWorker: null, inflight: { n, at: run.at, file: run.file, source: run.source, recorded: run.recorded, button, settings, phase: 'start', visibility: run.visibility } };
  setRunning(true); saveInflight(true);
  let wake = null;
  const onVis = () => {
    run.visibility.push(`${document.visibilityState} during ${current ? current.inflight.phase : '?'} at ${sec(performance.now() - t0)}`);
    saveInflight(true);
    if (document.visibilityState === 'visible' && wake && wake.released && 'wakeLock' in navigator) navigator.wakeLock.request('screen').then((w) => { wake = w; }, () => {});
  };
  document.addEventListener('visibilitychange', onVis);
  try {
    if ('wakeLock' in navigator) {
      try { wake = await navigator.wakeLock.request('screen'); run.wakeLock = 'on'; } catch (e) { run.wakeLock = `refused (${msgOf(e)})`; }
    } else run.wakeLock = 'not supported';
    setPhase('parse'); setStatus('Reading the movie header...');
    const parsed = await parseFile(file);
    parsed.file = file;
    run.parseMs = Math.round(performance.now() - t0);
    run.meta = parsed.meta;
    current.inflight.meta = parsed.meta;
    current.inflight.hints = `${parsed.meta.size} ${parsed.meta.codec}, ${parsed.meta.samples} samples, ${parsed.meta.videoMB} MB of video, pose on ${Number.isFinite(settings.maxSec) ? `the first ${settings.maxSec} s` : 'the whole clip'}, input downscaled to 480 px long side${device.memoryGB !== 'n/a' ? `, device memory ${device.memoryGB} GB` : ''}`;
    saveInflight(true);
    let model = null;
    if (settings.pose) {
      setPhase('model');
      const mres = await getModel();
      run.model = { ms: mres.ms, cached: mres.cached };
      model = mres.buf;
    }
    if (abort.signal.aborted) throw new Error('stopped');
    setPhase('worker');
    const w = await runWorker(parsed, model, settings);
    run.workerCaps = w.caps; run.configSupported = w.configSupported; run.decode = w.decode; run.frames = w.frames; run.pose = w.pose;
    run.errors.push(...(w.errors || []));
    if (run.frames && run.frames.diffs) { window.__diffs = run.frames.diffs; delete run.frames.diffs; }
    if (w.stopped) throw new Error('stopped');
    if (settings.rvfc && !abort.signal.aborted) {
      setPhase('rvfc');
      try { run.rvfc = await rvfcPass(file, settings.maxSec, abort.signal); } catch (e) { run.errors.push(`rVFC: ${msgOf(e)}`); }
    }
    if (abort.signal.aborted) throw new Error('stopped');
    setStatus('Done. Results are below. Tap a run to see every line, or Copy results to paste them into chat.');
  } catch (e) {
    if (abort.signal.aborted) { run.stopped = `you tapped Stop during ${current.inflight.phase}`; setStatus('Stopped. The partial results are saved below.'); }
    else { run.errors.push(`fatal: ${msgOf(e)}`); setStatus(`Stopped: ${msgOf(e)}`); }
  } finally {
    document.removeEventListener('visibilitychange', onVis);
    if (wake) wake.release().catch(() => {});
    store.del(INFLIGHT_KEY);
    current = null;
    runs.push(run); store.set(RUNS_KEY, runs);
    setRunning(false);
    render();
    $('pick-video').value = ''; $('pick-any').value = '';
    window.__spikeDone = (window.__spikeDone || 0) + 1; // for the local Playwright test
  }
}

$('stop').addEventListener('click', () => {
  if (!current) return;
  current.abort.abort();
  if (current.finishWorker) current.finishWorker({ errors: [], stopped: true });
});

// Safari unlocks later play() calls on an element that was played inside a tap. Do that on the
// picker tap, so the playback check after decode and pose is allowed to start on its own.
for (const id of ['label-video', 'label-any']) {
  $(id).addEventListener('click', () => { try { const p = player.play(); if (p) p.catch(() => {}); } catch { /* no source yet */ } });
}
$('pick-video').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) runClip(f, 'video/*'); });
$('pick-any').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) runClip(f, 'any file'); });

render();
if (inflightAtLoad) setStatus(`The last run (${fileName(inflightAtLoad)}) did not finish: the tab crashed or reloaded during ${inflightAtLoad.phase}. It is saved as a crashed run below.`);
window.__spikeReady = true;
