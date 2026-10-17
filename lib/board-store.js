/**
 * lib/board-store.js
 * ----------------------------------------------------------------------------
 * Storage for the OPT-IN shared board. A visitor only ever lands here after
 * clicking "Share with the group", so everything stored was volunteered.
 *
 * Two backends, picked automatically:
 *   - Vercel KV / Upstash Redis  — when KV_REST_API_URL + KV_REST_API_TOKEN
 *     env vars are present (i.e. you added a KV store in your Vercel project).
 *     This is what makes the board work for real across many visitors.
 *   - In-memory  — otherwise (local `node dev-server.mjs`, or Vercel with no KV).
 *     Fine for local testing; on serverless it won't persist reliably, which is
 *     why the README tells you to add KV before sharing the link.
 *
 * Privacy choices baked in:
 *   - We store only what's needed to show the board: a label, coarse location,
 *     coordinates, source and time. The raw IP is MASKED before storing.
 *   - Entries auto-expire after 24h (KV TTL), and the list is capped.
 */

const KEY = 'tracking-lab:board';
const MAX_ENTRIES = 100;
const TTL_SECONDS = 24 * 60 * 60; // the whole board self-empties after a day

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const useKv = Boolean(KV_URL && KV_TOKEN);

// In-memory fallback (module-level: survives across requests within one running
// process, e.g. the local dev server).
const memory = [];

/** Send one Redis command to the Upstash/Vercel KV REST API. */
async function kv(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`KV command ${command[0]} failed (HTTP ${res.status}).`);
  const data = await res.json();
  return data.result;
}

/** Add one volunteered entry to the front of the board. */
export async function addEntry(entry) {
  if (useKv) {
    const value = JSON.stringify(entry);
    await kv(['LPUSH', KEY, value]);
    await kv(['LTRIM', KEY, '0', String(MAX_ENTRIES - 1)]);
    await kv(['EXPIRE', KEY, String(TTL_SECONDS)]);
  } else {
    memory.unshift(entry);
    if (memory.length > MAX_ENTRIES) memory.length = MAX_ENTRIES;
  }
  return entry;
}

/** Read the whole board, newest first. */
export async function listEntries() {
  if (useKv) {
    const arr = await kv(['LRANGE', KEY, '0', String(MAX_ENTRIES - 1)]);
    return (arr || []).map((s) => safeParse(s)).filter(Boolean);
  }
  return [...memory];
}

/** Empty the board (used by the Clear button). */
export async function clearBoard() {
  if (useKv) await kv(['DEL', KEY]);
  else memory.length = 0;
}

export function backendName() {
  return useKv ? 'Vercel KV' : 'in-memory (not shared across serverless instances — add KV)';
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Reduce a raw IP to something far less identifying before we store it. */
export function maskIp(ip) {
  if (!ip) return 'unknown';
  if (ip.includes(':')) {
    // IPv6: keep only the first block.
    return ip.split(':')[0] + ':…';
  }
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return 'masked';
}
