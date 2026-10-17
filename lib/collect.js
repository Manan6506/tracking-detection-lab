/**
 * lib/collect.js
 * ----------------------------------------------------------------------------
 * The "server's eye view" of a visitor.
 *
 * This is the heart of the lesson: when your browser asks any web server for a
 * page, the request ARRIVES with information attached. The server doesn't have
 * to ask permission and no prompt is shown — this is simply how HTTP works.
 * Every server you ever contact (the website itself, and every ad/analytics
 * company whose code the site embeds) receives at least this much.
 *
 * This module turns an incoming request into a plain object describing what the
 * server can see. It runs in two places with the SAME logic:
 *   - api/whoami.js        → on Vercel, in production
 *   - dev-server.mjs       → on your Mac, for local testing
 *
 * It intentionally does NOT store anything. It reads the request, builds a
 * reply, and forgets. There is no database and no log of who visited.
 */

/**
 * The public IP address the request came from.
 *
 * Browsers never send your IP in the page; the network layer reveals it. Behind
 * a proxy or CDN (like Vercel), the real client IP is passed along in the
 * `x-forwarded-for` header — a comma-separated list, with the original client
 * first. We read that, and fall back to the raw socket address for local runs.
 */
export function clientIp(headers, socketAddress) {
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    // "client, proxy1, proxy2" → take the first entry (the original client).
    return forwarded.split(',')[0].trim();
  }
  const real = headers['x-real-ip'];
  if (real) return real.trim();
  // Local dev: the TCP socket address. ::1 / 127.0.0.1 means "this same Mac".
  return normaliseLocalhost(socketAddress || '');
}

function normaliseLocalhost(addr) {
  const a = addr.replace(/^::ffff:/, ''); // strip IPv4-in-IPv6 prefix
  return a === '::1' ? '127.0.0.1' : a;
}

export function isLocalIp(ip) {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

/**
 * Location that Vercel attaches to the request for free.
 *
 * When this is deployed on Vercel, Vercel looks your IP up in a geo database at
 * its edge and adds `x-vercel-ip-*` headers before your code even runs. That is
 * the production equivalent of what a real ad network's own geo database does.
 * Locally these headers don't exist, so this returns nulls and the caller does
 * an IP lookup instead (see geolocateIp below).
 */
export function vercelGeo(headers) {
  const city = decodeHeader(headers['x-vercel-ip-city']);
  const country = headers['x-vercel-ip-country'] || null;
  const region = decodeHeader(headers['x-vercel-ip-country-region']);
  const lat = headers['x-vercel-ip-latitude'];
  const lon = headers['x-vercel-ip-longitude'];
  const timezone = headers['x-vercel-ip-timezone'] || null;

  if (!city && !country && !lat) return null; // not on Vercel, or no data

  return {
    source: 'Vercel edge geo headers',
    city,
    region,
    country,
    latitude: lat ? Number(lat) : null,
    longitude: lon ? Number(lon) : null,
    timezone,
  };
}

// Vercel percent-encodes header values that contain non-ASCII (e.g. "São Paulo").
function decodeHeader(value) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Look an IP up in a public geo database (server-side).
 *
 * Used only when the Vercel headers aren't present (i.e. local development, or
 * another host). We do it from the server so the browser never has to, which is
 * also exactly how a real ad network would do it. GeoJS needs no API key.
 *
 * Returns null on any failure — the caller treats location as simply unknown.
 */
export async function geolocateIp(ip) {
  if (!ip || isLocalIp(ip)) {
    return { source: 'none', note: 'Local address — your real public IP is not visible to a server running on your own machine. Deploy to Vercel to see it.' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'location-detection-lab (educational demo)' },
    });
    clearTimeout(timer);
    if (!res.ok) return { source: 'geojs', error: `HTTP ${res.status}` };
    const d = await res.json();
    return {
      source: 'GeoJS IP database (server-side lookup)',
      city: d.city || null,
      region: d.region || null,
      country: d.country || null,
      latitude: d.latitude ? Number(d.latitude) : null,
      longitude: d.longitude ? Number(d.longitude) : null,
      timezone: d.timezone || null,
      network: d.organization_name || d.organization || null,
    };
  } catch (err) {
    return { source: 'geojs', error: err.name === 'AbortError' ? 'timed out' : 'lookup failed' };
  }
}

/**
 * Build the full "what the server sees" object for one request.
 * `req` only needs { headers, socketAddress }.
 */
export async function describeVisitor(req) {
  const headers = lowercaseKeys(req.headers || {});
  const ip = clientIp(headers, req.socketAddress);

  // Prefer Vercel's own geo headers; otherwise do our own IP lookup.
  let location = vercelGeo(headers);
  if (!location) location = await geolocateIp(ip);

  return {
    receivedAt: new Date().toISOString(),
    network: {
      ip,
      isLocal: isLocalIp(ip),
      // These headers are sent by the browser on every request, unasked.
      userAgent: headers['user-agent'] || null,
      acceptLanguage: headers['accept-language'] || null,
      // Referer tells a site which page you came FROM — how an embedded tracker
      // learns which article you were reading when its code loaded.
      referer: headers['referer'] || null,
      // Modern "client hints": some browsers volunteer extra device info.
      platform: stripQuotes(headers['sec-ch-ua-platform']),
      mobile: headers['sec-ch-ua-mobile'] || null,
      brands: stripQuotes(headers['sec-ch-ua']),
      dnt: headers['dnt'] || null, // "Do Not Track" request, widely ignored
    },
    location,
  };
}

function lowercaseKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  return out;
}

function stripQuotes(value) {
  return value ? value.replace(/"/g, '') : null;
}
