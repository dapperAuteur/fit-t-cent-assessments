// Drives the page in headless Chromium with synthetic clips and prints the results text.
// Usage (server running: node dev/serve.mjs):
//   CHROME_ARGS=--use-angle=metal node dev/run-local.mjs <chrome-headless-shell path> <clip> [<clip> ...]
// Env:
//   MAXSEC=10|all     pose and playback range (default: the page's default, 10)
//   RVFC=0            skip the playback check
//   BLOCKPLAY=tap|skip  make video.play() fail outside a user gesture (like Safari's policy), then
//                     tap the page's Play button (tap) or its Skip button (skip)
//   CRASH=1           start the first clip, reload the page during pose, and print the crash card
//   CLEAR=1           after the runs, test Clear results (confirm step, storage emptied)
//   SHOT=path.png     screenshot path
// Needs playwright-core (npm i in dev/).
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';
const [exe, ...clips] = process.argv.slice(2);
const env = process.env;
const b = await chromium.launch({ executablePath: exe, args: (env.CHROME_ARGS || '').split(' ').filter(Boolean) });
const ctx = await b.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
if (env.BLOCKPLAY) {
  await ctx.addInitScript(() => {
    const real = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!navigator.userActivation.isActive) return Promise.reject(new DOMException('The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.', 'NotAllowedError'));
      return real.call(this);
    };
  });
}
const p = await ctx.newPage();
const net = [];
p.on('request', (r) => net.push(r.url()));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text().slice(0, 300)); });
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
const url = env.URL || 'http://localhost:8766/';
await p.goto(url);
await p.waitForFunction('window.__spikeReady === true');

// Peak resident memory of all browser processes, sampled once a second (this Mac only).
let peakMB = 0;
const sampler = setInterval(() => {
  try {
    const out = execSync("ps -axo rss=,command= | grep -i 'chrome-headless-shell' | grep -v grep | awk '{s+=$1} END {print s}'").toString().trim();
    peakMB = Math.max(peakMB, Math.round(+out / 1024));
  } catch { /* ignore */ }
}, 1000);

async function pick(clip, i) {
  const recorded = /-120-/.test(clip) ? '120' : '240';
  const source = /orig-|h264-240|hevc-/.test(clip) ? 'Files' : 'Photos';
  await p.check(`input[name=recorded][value="${recorded}"]`);
  await p.check(`input[name=source][value="${source}"]`);
  if (env.MAXSEC) await p.selectOption('#max-sec', env.MAXSEC);
  if (env.RVFC === '0') await p.uncheck('#do-rvfc'); else await p.check('#do-rvfc');
  await p.setInputFiles(i % 2 ? '#pick-any' : '#pick-video', clip);
}

if (env.CRASH) {
  await pick(clips[0], 0);
  await p.waitForFunction(() => /pose/.test(document.getElementById('status').textContent) && /[1-9]\d* of/.test(document.getElementById('status').textContent), null, { timeout: 300000, polling: 200 });
  await p.reload();
  await p.waitForFunction('window.__spikeReady === true');
  console.log('status after reload:', await p.textContent('#status'));
  console.log(await p.textContent('#checks details[open] pre'));
} else {
  for (const [i, clip] of clips.entries()) {
    const t = Date.now();
    await pick(clip, i);
    if (env.BLOCKPLAY) {
      // Wait for the tap prompt (or the end of the run), then tap Play or Skip like a person would.
      await p.waitForFunction((n) => window.__spikeDone === n || !document.getElementById('tap-row').hidden, i + 1, { timeout: 600000, polling: 200 });
      if (await p.isVisible('#tap-row')) await p.click(env.BLOCKPLAY === 'skip' ? '#tap-skip' : '#tap-play');
    }
    await p.waitForFunction((n) => window.__spikeDone === n, i + 1, { timeout: 900000, polling: 500 });
    console.error(`[run] ${clip.split('/').pop()}: ${((Date.now() - t) / 1000).toFixed(1)} s wall, peak browser RSS so far ${peakMB} MB`);
  }
}

await p.click('#copy');
const copied = await p.evaluate(() => navigator.clipboard.readText());
console.log(copied);
await p.click('#show-all');
const shown = await p.inputValue('#out');
console.log('\ncopy block matches the "all results as text" box:', copied.replace(/^FPS SPIKE[^\n]*\n/, '') === shown.replace(/^FPS SPIKE[^\n]*\n/, ''));
await p.click('#select-all');
const sel = await p.evaluate(() => { const t = document.getElementById('out'); return t.selectionEnd - t.selectionStart === t.value.length; });
console.log('select all selects the whole box:', sel);
console.log('cards:', await p.locator('#checks details').count(), '| open:', await p.locator('#checks details[open]').count());
if (env.CLEAR) {
  await p.click('#clear');
  console.log('confirm shown:', await p.isVisible('#clear-confirm'), '|', await p.textContent('#clear-q'));
  await p.click('#clear-yes');
  const keys = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fps-spike') && localStorage.getItem(k) !== 'null'));
  console.log('after clear: cards', await p.locator('#checks details').count(), '| stored keys', JSON.stringify(keys), '|', await p.textContent('#copy-status'));
  await p.reload(); await p.waitForFunction('window.__spikeReady === true');
  console.log('after reload: cards', await p.locator('#checks details').count());
}
clearInterval(sampler);
console.log('peak resident memory of all browser processes (this Mac, headless):', peakMB, 'MB');
const offsite = net.filter((u) => !u.startsWith('http://localhost') && !u.startsWith('blob:'));
console.log('requests outside localhost (blob: excluded):', offsite.length, offsite.join(' '));
await p.screenshot({ path: env.SHOT || 'spike-shot.png', fullPage: true });
await b.close();
