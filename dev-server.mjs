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
import { buildEntry } from './lib/share-entry.js';
import { addEntry, listEntries, clearBoard, backendName } from './lib/board-store.js';

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

  // --- API endpoints — mirror the Vercel functions in /api -----------------
  const reqLike = { headers: req.headers, socketAddress: req.socket.remoteAddress };
  const sendJson = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj, null, 2));
  };

  if (url.pathname === '/api/whoami') {
    sendJson(200, await describeVisitor(reqLike));
    return;
  }

  if (url.pathname === '/api/share') {
    if (req.method !== 'POST') return sendJson(405, { error: 'Use POST to share.' });
    try {
      const body = await readJsonBody(req);
      const entry = await addEntry(await buildEntry(reqLike, body));
      return sendJson(200, { ok: true, entry });
    } catch (err) {
      return sendJson(500, { error: 'Could not save to the board: ' + err.message });
    }
  }

  if (url.pathname === '/api/board') {
    try {
      if (req.method === 'DELETE') {
        await clearBoard();
        return sendJson(200, { ok: true, cleared: true });
      }
      return sendJson(200, { entries: await listEntries(), backend: backendName() });
    } catch (err) {
      return sendJson(500, { error: 'Could not read the board: ' + err.message });
    }
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

/** Read and JSON-parse a request body (with a small size cap). */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 100_000) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

server.listen(port, host, () => {
  console.log(`Tracking Lab (dev) running at http://localhost:${port}`);
  if (lan) {
    console.log(`LAN mode: reachable at http://<your-Mac's-IP>:${port}  (find it: ipconfig getifaddr en0)`);
    console.log('Stop it with Ctrl+C when you are done — it is visible to your network.');
  }
  console.log('Press Ctrl+C to stop.');
});
