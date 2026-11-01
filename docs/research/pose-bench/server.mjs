import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve(process.argv[2] || '.'); const port = +process.argv[3] || 8765;
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.wasm':'application/wasm', '.mp4':'video/mp4', '.jpg':'image/jpeg', '.task':'application/octet-stream' };
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const h = { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' };
  if (process.env.COI) { h['Cross-Origin-Opener-Policy']='same-origin'; h['Cross-Origin-Embedder-Policy']='require-corp'; }
  res.writeHead(200, h); fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('listening', port));
