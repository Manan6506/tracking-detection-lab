/**
 * lib/share-entry.js
 * ----------------------------------------------------------------------------
 * Turns a "share" request into the entry we store on the board.
 *
 * The visitor's browser POSTs at most: a label (nickname) and, ONLY if they
 * allowed precise location, the coordinates. The server adds the IP-derived
 * location it already sees. We never store the precise coordinates of someone
 * who didn't choose to send them.
 */

import { describeVisitor } from './collect.js';
import { maskIp } from './board-store.js';

const LABEL_MAX = 24;

export async function buildEntry(req, body) {
  const view = await describeVisitor(req);
  const loc = view.location || {};

  // Clean the label: trim, cap length. Rendered with textContent on the client,
  // so it can't inject HTML regardless.
  let label = typeof body.label === 'string' ? body.label.trim().slice(0, LABEL_MAX) : '';
  if (!label) label = 'anonymous';

  // Use precise coordinates only if the visitor actually sent valid ones.
  const precise = validatePrecise(body.precise);

  const entry = {
    id: 'e_' + Math.random().toString(36).slice(2, 10),
    label,
    sharedAt: new Date().toISOString(),
    ipMasked: maskIp(view.network.ip),
    city: loc.city || null,
    region: loc.region || null,
    country: loc.country || null,
    source: precise ? 'precise (allowed)' : 'ip',
    lat: precise ? precise.lat : loc.latitude ?? null,
    lon: precise ? precise.lon : loc.longitude ?? null,
    accuracyM: precise ? precise.accuracy : null,
  };
  return entry;
}

function validatePrecise(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const accuracy = Number.isFinite(Number(p.accuracy)) ? Number(p.accuracy) : null;
  return { lat, lon, accuracy };
}
