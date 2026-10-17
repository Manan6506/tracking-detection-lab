/**
 * dev-server.mjs  —  local development server (Node, no dependencies)
 * ----------------------------------------------------------------------------
 * Vercel runs api/whoami.js for you in production. On your own Mac there is no
 * Vercel, so this tiny server stands in: it serves the static files AND answers
 * /api/whoami using the exact same lib/collect.js logic.
 *
 * Run it:
 *     node dev-server.mjs            → http://localhost:3000 (this Mac only)
 *     node dev-server.mjs 8080       → a different port
 *     node dev-server.mjs --lan      → also reachable from your network
 *
 * Note: on localhost the server sees your IP as 127.0.0.1, so there is no public
 * location to show. That is itself a lesson. Deploy to Vercel (see README) to
 * see your real public IP and city, and to test with teammates elsewhere.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describeVisitor } from './lib/collect.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const lan = args.includes('--lan');
const port = Number(args.find((a) => /^\d+$/.test(a))) || 3000;
const host = lan ? '0.0.0.0' : '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // The API endpoint — mirrors the Vercel function.
  if (url.pathname === '/api/whoami') {
    const result = await describeVisitor({
      headers: req.headers,
      socketAddress: req.socket.remoteAddress,
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(result, null, 2));
    return;
  }

  // Static files. Default to index.html.
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  // Prevent path traversal: resolve and confirm it stays inside ROOT.
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Tracking Lab (dev) running at http://localhost:${port}`);
  if (lan) {
    console.log(`LAN mode: reachable at http://<your-Mac's-IP>:${port}  (find it: ipconfig getifaddr en0)`);
    console.log('Stop it with Ctrl+C when you are done — it is visible to your network.');
  }
  console.log('Press Ctrl+C to stop.');
});
