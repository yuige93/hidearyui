import fs from 'node:fs';
import path from 'node:path';
import { sendAuthRequired, trustedAccess } from './access-control.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
export function loadAssets(root) {
  const files = new Map();
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && MIME[path.extname(file)]) {
        const route = '/' + path.relative(root, file).split(path.sep).join('/');
        files.set(route, { body: fs.readFileSync(file), type: MIME[path.extname(file)] });
      }
    }
  }
  walk(root);
  if (!files.has('/index.html')) throw new Error('Build output is missing index.html');
  return files;
}
export function createHandler(files, { authenticate } = {}) {
  return (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (!trustedAccess(req, authenticate)) { sendAuthRequired(res); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end(); return; }
    let route;
    try { route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.statusCode = 400; res.end(); return; }
    if (route === '/healthz') { res.setHeader('Content-Type', 'application/json'); res.end(req.method === 'HEAD' ? undefined : '{"status":"ok","app":"cosmic-schedule"}'); return; }
    if (route === '/') route = '/index.html';
    const file = files.get(route);
    if (!file) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', file.type);
    res.setHeader('Content-Length', file.body.length);
    // Keep personalized content and all assets out of shared caches.
    res.end(req.method === 'HEAD' ? undefined : file.body);
  };
}
