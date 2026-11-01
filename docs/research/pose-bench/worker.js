import { FilesetResolver, PoseLandmarker } from '/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
import { MP, decodeAll, makeLandmarker, stats } from '/common.js';
self.onmessage = async ({ data }) => {
  try {
    const vision = await FilesetResolver.forVisionTasks(`${MP}/wasm`, true);
    const canvas = data.delegate === 'GPU' ? new OffscreenCanvas(1, 1) : undefined;
    const pl = await makeLandmarker(vision, PoseLandmarker, data.model, data.delegate, canvas);
    let found = 0; const per = []; const t = performance.now();
    const n = await decodeAll({ config: data.config, samples: data.samples }, async (f) => { const t0 = performance.now(); const r = pl.detectForVideo(f, f.timestamp / 1000); per.push(performance.now() - t0); found += r.landmarks.length ? 1 : 0; });
    const total = performance.now() - t;
    self.postMessage({ frames: n, detected: found, totalMs: +total.toFixed(0), effFps: +(n / total * 1000).toFixed(1), perFrame: stats(per) });
  } catch (e) { self.postMessage({ error: String(e && e.stack || e) }); }
};
