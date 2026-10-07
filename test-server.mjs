// Local test server: static files + the real Vercel API functions.
// Mirrors Vercel routing: /api/send-otp, /api/verify-otp.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

process.env.NODE_ENV = 'development'; // send-otp returns devOtp in JSON

const send = (await import('./api/send-otp.js')).default;
const verify = (await import('./api/verify-otp.js')).default;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const readBody = () => new Promise((ok) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok(b); } });
  });

  if (url.pathname === '/api/send-otp' || url.pathname === '/api/verify-otp') {
    req.body = await readBody();
    req.method = 'POST';
    const fn = url.pathname.endsWith('verify-otp') ? verify : send;
    // mimic express-like res
    const wrapped = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      json(o) {
        res.writeHead(this.statusCode, { 'Content-Type': 'application/json', ...this.headers });
        res.end(JSON.stringify(o));
        console.log(`[api] ${url.pathname} -> ${this.statusCode}`, JSON.stringify(o).slice(0, 120));
      },
    };
    return fn(req, wrapped);
  }

  // static
  let p = normalize(join('.', decodeURIComponent(url.pathname)));
  if (p === '.' || p === '' || url.pathname === '/') p = 'index.html';
  try {
    const s = await stat(p);
    if (s.isDirectory()) p = join(p, 'index.html');
  } catch { /* fallthrough */ }
  try {
    const buf = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'text/plain' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found: ' + p);
  }
}).listen(8788, () => console.log('test server on http://localhost:8788'));
