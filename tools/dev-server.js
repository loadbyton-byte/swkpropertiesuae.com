// Local preview server for public/.
// Images and fonts live on the production host (they are not in this repo), so
// any missing /assets/images/* request is answered with a generated gradient
// placeholder; that keeps layouts testable offline. Usage: node tools/dev-server.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'public');
const PORT = Number(process.argv[2]) || 8765;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
};

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function placeholder(url) {
  const h = hash(url);
  const hue = h % 360, hue2 = (hue + 40) % 360;
  const label = decodeURIComponent(url.split('/').pop().split('?')[0]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,28%)"/><stop offset="1" stop-color="hsl(${hue2},55%,14%)"/></linearGradient></defs><rect width="900" height="1200" fill="url(#g)"/><circle cx="650" cy="260" r="120" fill="hsl(${hue2},70%,60%)" opacity=".25"/><text x="50%" y="52%" fill="#fff" fill-opacity=".55" font-family="sans-serif" font-size="40" text-anchor="middle">${label}</text></svg>`;
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    return fs.createReadStream(file).pipe(res);
  }
  if (p.startsWith('/assets/images/')) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    return res.end(placeholder(p));
  }
  const nf = path.join(ROOT, '404.html');
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
