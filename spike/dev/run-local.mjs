// Drives the page in headless Chromium with a synthetic clip and prints the results text.
// Usage (server running: node dev/serve.mjs):
//   CHROME_ARGS=--use-angle=metal node dev/run-local.mjs <chrome-headless-shell path> <clip> [<clip> ...]
// Needs playwright-core (npm i in dev/).
import { chromium } from 'playwright-core';
const [exe, ...clips] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: exe, args: (process.env.CHROME_ARGS || '').split(' ').filter(Boolean) });
const ctx = await b.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const net = [];
p.on('request', (r) => net.push(r.url()));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text().slice(0, 300)); });
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
await p.goto(process.env.URL || 'http://localhost:8766/');
await p.waitForFunction('window.__spikeReady === true');
for (const [i, clip] of clips.entries()) {
  const recorded = /-120-/.test(clip) ? '120' : '240';
  await p.check(`input[name=recorded][value="${recorded}"]`);
  await p.check('input[name=source][value="Files"]');
  await p.setInputFiles(i % 2 ? '#pick-any' : '#pick-video', clip);
  await p.waitForFunction((n) => window.__spikeDone === n, i + 1, { timeout: 600000, polling: 1000 });
}
await p.click('#copy');
const copied = await p.evaluate(() => navigator.clipboard.readText());
const shown = await p.inputValue('#out');
console.log(copied);
console.log('\ncopy block matches the on-screen text:', copied === shown);
console.log('requests outside localhost:', net.filter((u) => !u.startsWith('http://localhost')).length);
console.log('requests:', [...new Set(net.map((u) => new URL(u).pathname))].join(' '));
await p.screenshot({ path: process.env.SHOT || 'spike-shot.png', fullPage: true });
await b.close();
