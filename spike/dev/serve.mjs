// Static server for local testing: node dev/serve.mjs [root=spike] [port=8766]
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..')); const port = +process.argv[3] || 8766;
// Apply spike/vercel.json headers too, so local tests run under the same CSP and caching.
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const extra = (u) => Object.assign({}, ...vercel.headers.filter((h) => new RegExp(`^${h.source}$`).test(u)).flatMap((h) => h.headers.map((x) => ({ [x.key]: x.value }))));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.json': 'application/json', '.task': 'application/octet-stream' };
http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(root, u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { ...extra(u), 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Content-Length': fs.statSync(f).size });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('listening', port));
