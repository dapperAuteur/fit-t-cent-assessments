// Shared by bench.html (main thread) and worker.js.
export const MP = '/node_modules/@mediapipe/tasks-vision';
// `src` is a URL or a File/Blob (the iPhone spike passes the picked file).
export async function demux(src) {
  const MP4Box = self.MP4Box;
  const buf = typeof src === 'string' ? await (await fetch(src)).arrayBuffer() : await src.arrayBuffer();
  return new Promise((resolve, reject) => {
    const file = MP4Box.createFile(); const samples = []; let config;
    file.onError = reject;
    file.onReady = (info) => {
      const t = info.videoTracks[0];
      const trak = file.getTrackById(t.id);
      let description;
      for (const e of trak.mdia.minf.stbl.stsd.entries) {
        const box = e.avcC || e.hvcC || e.vpcC || e.av1C;
        if (box) { const DS = self.DataStream; const s = new DS(undefined, 0, DS.BIG_ENDIAN); box.write(s); description = new Uint8Array(s.buffer, 8); }
      }
      config = { codec: t.codec, codedWidth: t.video.width, codedHeight: t.video.height, description, hardwareAcceleration: 'no-preference' };
      file.setExtractionOptions(t.id, null, { nbSamples: Infinity }); file.start();
    };
    file.onSamples = (id, user, s) => { samples.push(...s); };
    buf.fileStart = 0; file.appendBuffer(buf); file.flush();
    const fps = samples.length > 1 ? +(samples.length / ((samples.at(-1).cts - samples[0].cts) / samples[0].timescale + samples[0].duration / samples[0].timescale)).toFixed(1) : null;
    resolve({ config, samples, bytes: buf.byteLength, fps });
  });
}
// Streams decode; calls onFrame(frame) (async) for each frame and closes it after. Backpressure keeps <= maxPending frames alive.
export async function decodeAll({ config, samples }, onFrame, maxPending = 4) {
  const pending = []; let wake; let err;
  const dec = new VideoDecoder({ output: (f) => { pending.push(f); wake && wake(); }, error: (e) => { err = e; wake && wake(); } });
  dec.configure(config);
  let fed = 0, done = 0;
  const feed = () => { while (fed < samples.length && dec.decodeQueueSize < 8 && pending.length < maxPending) { const s = samples[fed++]; dec.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: Math.round(1e6 * s.cts / s.timescale), duration: Math.round(1e6 * s.duration / s.timescale), data: s.data })); } };
  feed(); let flushed = null;
  while (done < samples.length) {
    if (err) throw err;
    if (!pending.length) { if (fed >= samples.length && !flushed) flushed = dec.flush(); await new Promise(r => { wake = r; setTimeout(r, 50); }); wake = null; feed(); continue; }
    const f = pending.shift();
    try { await onFrame(f, done); } finally { f.close(); }
    done++; feed();
  }
  if (flushed) await flushed; dec.close(); return done;
}
export async function makeLandmarker(vision, PoseLandmarker, model, delegate, canvas) {
  return PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `/models/pose_landmarker_${model}.task`, delegate }, runningMode: 'VIDEO', numPoses: 1, ...(canvas ? { canvas } : {}) });
}
export const stats = (a) => { const s = [...a].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: s.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(1) }; };
