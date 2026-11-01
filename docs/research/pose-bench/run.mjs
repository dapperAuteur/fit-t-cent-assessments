// Usage: npm i && npm run fetch-assets && npm run make-clip && npm run serve, then in another shell:
//   CHROME_ARGS=--use-angle=metal node run.mjs <path to chrome-headless-shell> "$(cat cfg-full.json)"
// Prints one JSON line per test. See ../stack-swot.md section 2.1 for how to read them.
import { chromium } from 'playwright-core';
const [exe, cfgJson] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: exe, args: (process.env.CHROME_ARGS || '').split(' ').filter(Boolean) });
const p = await b.newPage();
p.on('console', m => { const t = m.text(); if (!t.startsWith('RESULT')) console.error('[page]', t.slice(0, 300)); });
p.on('pageerror', e => console.error('[pageerror]', e.message));
await p.goto('http://localhost:8765/bench.html'); await p.waitForFunction('window.ready === true');
const res = await p.evaluate((c) => window.run(c), JSON.parse(cfgJson));
for (const r of res) console.log(JSON.stringify(r));
await b.close();
