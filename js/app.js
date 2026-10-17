/**
 * js/app.js — ties the Tracking Detection Lab together.
 * ----------------------------------------------------------------------------
 * Flow when the page loads:
 *   1. Show the "server view" — what /api/whoami received (IP, location, headers).
 *      This happens automatically, to make the point that it needed no click and
 *      no permission: loading the page already sent all of it.
 *   2. Show your browser fingerprint (computed in your browser, shown only to you).
 *   3. Build a plain-English "ad targeting profile" from that real data, and a
 *      mock ad-bid request, to show how the data gets USED.
 *   4. Offer the contrast: precise GPS/Wi-Fi location still needs your permission.
 *
 * Privacy: results live only in memory on this page. This script sends nothing
 * anywhere except the one /api/whoami call to our own server. A "Clear" button
 * wipes the screen. See the Privacy section on the page.
 */

import { fetchServerView } from './server-info.js';
import { collectFingerprint } from './fingerprint.js';
import { requestBrowserPosition, explainGeolocationError, isGeolocationSupported } from './geolocation.js';
import { validateLatLon, formatCoordinate, formatDistance, distanceMeters, describeAccuracy } from './coordinates.js';
import { buildEmbedUrl, buildOsmLink, zoomForRadius } from './map.js';

/* ------------------------------ state (in memory only) ------------------------------ */
const state = { server: null, fingerprint: null, browser: null };

/* ------------------------------ tiny DOM helper ------------------------------ */
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'className') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function kv(rows) {
  const dl = el('dl', { className: 'kv' });
  for (const [label, value, mono] of rows) {
    if (value === null || value === undefined || value === '') continue;
    dl.append(el('dt', {}, label), el('dd', { className: mono ? 'mono' : null }, value));
  }
  return dl;
}

/* ============================== 1. server view ============================== */

async function loadServerView() {
  const box = $('server-result');
  box.replaceChildren(spinner('Reading what the server received…'));

  try {
    const data = await fetchServerView();
    state.server = data;
    renderServerView(data);
    buildProfile();
    showMapFromServer();
  } catch (err) {
    box.replaceChildren(
      el('div', { className: 'panel panel-error' },
        el('p', { className: 'panel-title' }, 'Could not load the server view'),
        el('p', {}, err.message)
      )
    );
    $('server-status').textContent = 'Error';
    $('server-status').dataset.state = 'error';
  }
}

function renderServerView(data) {
  const net = data.network;
  const loc = data.location || {};
  const localNote = net.isLocal;

  $('server-status').textContent = localNote ? 'Local address' : 'Received';
  $('server-status').dataset.state = localNote ? 'warning' : 'success';

  const locationRows = [];
  if (loc.city || loc.region || loc.country) {
    locationRows.push(['Approx. location', [loc.city, loc.region, loc.country].filter(Boolean).join(', ')]);
  }
  if (loc.latitude != null && loc.longitude != null) {
    locationRows.push(['Coordinates', `${Number(loc.latitude).toFixed(4)}, ${Number(loc.longitude).toFixed(4)}`, true]);
  }
  if (loc.timezone) locationRows.push(['Time zone (from IP)', loc.timezone]);
  if (loc.network) locationRows.push(['Network / ISP', loc.network]);
  if (loc.source) locationRows.push(['Location source', loc.source]);
  if (loc.note) locationRows.push(['Note', loc.note]);
  if (loc.error) locationRows.push(['Location lookup', `failed (${loc.error})`]);

  $('server-result').replaceChildren(
    el('div', { className: 'panel panel-success' },
      el('p', { className: 'panel-title' }, localNote ? 'What the server sees (local run)' : 'What the server already knows'),
      el('p', { className: 'auto-flag' }, '▲ You did not click anything and saw no prompt. All of this arrived the instant the page loaded.'),
      el('h4', {}, 'Your network identity'),
      kv([
        ['Public IP address', net.ip, true],
        ['Sent by your browser, unasked:', null],
      ]),
      kv([
        ['User-Agent', net.userAgent],
        ['Accept-Language', net.acceptLanguage],
        ['Came from (Referer)', net.referer || '(none this time — would reveal the page you arrived from)'],
        ['Platform hint', net.platform],
        ['Browser brands', net.brands],
        ['“Do Not Track”', net.dnt ? `${net.dnt} (sites may ignore this)` : 'not set'],
      ]),
      locationRows.length ? el('h4', {}, 'Location worked out from your IP (no permission needed)') : null,
      locationRows.length ? kv(locationRows) : null,
      localNote
        ? el('p', { className: 'inline-note' }, 'You are on localhost, so the server sees 127.0.0.1 and can’t geolocate you. Deploy to Vercel (see the README) to see your real public IP and city — that is also how teammates elsewhere will each see their own.')
        : null
    )
  );
}

function showMapFromServer() {
  const loc = state.server && state.server.location;
  if (!loc) return;
  const check = validateLatLon(loc.latitude, loc.longitude);
  if (!check.ok) return;
  showOnMap('ip', check.lat, check.lon, 25000, `IP-based location${loc.city ? ' · ' + loc.city : ''}`);
}

/* ============================== 2. fingerprint ============================== */

async function loadFingerprint() {
  $('fp-result').replaceChildren(spinner('Reading your browser fingerprint…'));
  try {
    const fp = await collectFingerprint();
    state.fingerprint = fp;
    renderFingerprint(fp);
    buildProfile();
  } catch (err) {
    $('fp-result').replaceChildren(el('div', { className: 'panel panel-error' }, el('p', {}, 'Fingerprint failed: ' + err.message)));
  }
}

function renderFingerprint(fp) {
  $('fp-status').textContent = `${fp.signals.length} signals`;
  $('fp-status').dataset.state = 'success';

  const rows = el('div', { className: 'fp-grid' });
  for (const s of fp.signals) {
    rows.append(
      el('div', { className: 'fp-item' },
        el('div', { className: 'fp-label' }, s.label),
        el('div', { className: 'fp-value mono' }, s.value),
        s.note ? el('div', { className: 'fp-note' }, s.note) : null
      )
    );
  }

  const bits = fp.totalBits;
  const oneIn = Math.round(2 ** bits).toLocaleString();

  $('fp-result').replaceChildren(
    el('div', { className: 'panel' },
      el('div', { className: 'fp-id' },
        el('div', {},
          el('div', { className: 'fp-id-label' }, 'Your fingerprint ID (this browser)'),
          el('code', { className: 'fp-id-value' }, fp.id.slice(0, 32) + '…')
        ),
        el('div', { className: 'fp-entropy' },
          el('span', { className: 'fp-entropy-num' }, `~${bits.toFixed(0)} bits`),
          el('span', { className: 'fp-entropy-sub' }, `rough uniqueness — about 1 in ${oneIn}`)
        )
      ),
      el('p', { className: 'inline-note' }, 'Computed in your browser and shown only to you — this module sends none of it anywhere. A tracker, though, could send exactly these values to its own server to recognise you again without any cookie. Reload the page: the ID stays the same.'),
      rows
    )
  );
}

/* ============================== 3. ad-targeting profile ============================== */

function buildProfile() {
  const box = $('profile-result');
  if (!state.server) {
    box.replaceChildren(el('p', { className: 'muted' }, 'Waiting for the server view…'));
    return;
  }
  const loc = state.server.location || {};
  const net = state.server.network;
  const fp = state.fingerprint;

  // Guess coarse "segments" the way an ad network would, from data we actually
  // have. These are deliberately shallow — the lesson is the mechanism, and how
  // thin the signals are, not accuracy.
  const segments = [];
  if (loc.country) segments.push(`Country: ${loc.country}`);
  if (loc.city) segments.push(`Metro: ${loc.city}`);
  if (loc.timezone) segments.push(`Day-part by TZ: ${loc.timezone}`);
  const lang = (net.acceptLanguage || '').split(',')[0];
  if (lang) segments.push(`Language: ${lang}`);
  if (net.platform) segments.push(`Device: ${net.platform}`);
  if (net.brands && /mobile/i.test(net.mobile || '')) segments.push('Form factor: mobile');
  if (loc.network) segments.push(`Connection: ${loc.network}`);
  if (fp) segments.push(`Stable ID: ${fp.id.slice(0, 12)}… (survives cookie clearing)`);

  // A simplified version of a real-time-bidding "bid request": the packet an ad
  // slot broadcasts to advertisers, who bid to show you an ad, in ~100 ms.
  const bidRequest = {
    id: 'demo-' + Math.random().toString(36).slice(2, 10),
    device: {
      ip: net.ip,
      ua: net.userAgent,
      language: lang || undefined,
      geo: loc.latitude != null ? { lat: Number(loc.latitude), lon: Number(loc.longitude), city: loc.city, country: loc.country, type: 'ip' } : undefined,
      os: net.platform || undefined,
    },
    user: fp ? { id: fp.id.slice(0, 24), buyeruid: 'from-fingerprint' } : undefined,
    imp: [{ id: '1', banner: { w: 300, h: 250 } }],
    note: 'Simplified illustration of an OpenRTB-style bid request. In reality this is sent to dozens of advertisers at once.',
  };

  box.replaceChildren(
    el('div', { className: 'panel' },
      el('h4', {}, 'Audience segments a tracker could tag you with'),
      segments.length
        ? el('ul', { className: 'segments' }, segments.map((s) => el('li', {}, s)))
        : el('p', { className: 'muted' }, 'Not enough data yet (you may be on localhost).'),
      el('p', { className: 'inline-note' }, 'A real ad network adds the sites you visit over time (via its code embedded on each one) to build interests like “shopping for shoes” or “planning travel”. This demo can’t see your other tabs, so it shows only what one page already reveals.'),
      el('h4', {}, 'How it gets used: a mock ad-bid request'),
      el('pre', { className: 'code-block' }, el('code', {}, JSON.stringify(bidRequest, null, 2))),
      el('p', { className: 'inline-note' }, 'When you load a page with an ad slot, a packet like this is auctioned to advertisers in about 100 milliseconds. The winner’s ad is what you see. Your IP, rough location and an ID are part of the lot.')
    )
  );
}

/* ============================== 4. precise-location contrast ============================== */

async function requestPreciseLocation() {
  const box = $('precise-result');
  if (!isGeolocationSupported()) {
    box.replaceChildren(el('div', { className: 'panel panel-error' }, el('p', {}, 'This browser has no Geolocation API.')));
    return;
  }
  $('precise-btn').disabled = true;
  box.replaceChildren(spinner('Asking the browser for precise location — watch for the permission prompt…'));

  try {
    const pos = await requestBrowserPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    const c = pos.coords;
    const check = validateLatLon(c.latitude, c.longitude);
    if (!check.ok) throw { code: 'INVALID', message: check.error };
    state.browser = { lat: check.lat, lon: check.lon, accuracy: c.accuracy };

    const serverLoc = state.server && state.server.location;
    let gap = null;
    if (serverLoc && serverLoc.latitude != null) {
      const d = distanceMeters({ lat: check.lat, lon: check.lon }, { lat: Number(serverLoc.latitude), lon: Number(serverLoc.longitude) });
      gap = formatDistance(d);
    }

    box.replaceChildren(
      el('div', { className: 'panel panel-success' },
        el('p', { className: 'panel-title' }, 'You granted precise location'),
        kv([
          ['Latitude', formatCoordinate(check.lat, 'latitude'), true],
          ['Longitude', formatCoordinate(check.lon, 'longitude'), true],
          ['Accuracy', `± ${formatDistance(c.accuracy)} — ${describeAccuracy(c.accuracy)}`],
          gap ? ['Distance from the IP guess', `${gap} away`] : null,
        ].filter(Boolean)),
        el('p', { className: 'inline-note' }, 'This is far more precise than the IP guess — and it only reached the page because you clicked Allow. That permission barrier is exactly why trackers lean on IP and fingerprinting, which need no consent.')
      )
    );
    showOnMap('precise', check.lat, check.lon, Math.max(c.accuracy * 2, 200), 'Precise location (you allowed it)');
  } catch (error) {
    if (error && error.code === 'INVALID') {
      box.replaceChildren(el('div', { className: 'panel panel-error' }, el('p', {}, error.message)));
    } else {
      const info = explainGeolocationError(error, { timeoutMs: 15000, secureContext: window.isSecureContext === true });
      box.replaceChildren(
        el('div', { className: 'panel panel-error' },
          el('p', { className: 'panel-title' }, info.title),
          el('p', {}, info.explanation),
          el('p', { className: 'inline-note' }, 'Note how the IP-based guess above still worked without any of this. That is the whole point.')
        )
      );
    }
  } finally {
    $('precise-btn').disabled = false;
  }
}

/* ============================== map ============================== */

let mapActive = false;
function showOnMap(source, lat, lon, radius, caption) {
  const frame = $('map-iframe');
  frame.src = buildEmbedUrl(lat, lon, radius);
  frame.hidden = false;
  $('map-empty').hidden = true;
  $('map-caption').textContent = caption;
  const link = $('map-link');
  link.href = buildOsmLink(lat, lon, zoomForRadius(radius));
  link.hidden = false;
  mapActive = true;
}

/* ============================== utilities ============================== */

function spinner(text) {
  return el('div', { className: 'loading' }, el('span', { className: 'spin', 'aria-hidden': 'true' }), el('span', {}, text));
}

function clearAll() {
  state.server = state.fingerprint = state.browser = null;
  $('server-result').replaceChildren(el('p', { className: 'muted' }, 'Cleared. Reload the page to collect again.'));
  $('fp-result').replaceChildren(el('p', { className: 'muted' }, 'Cleared.'));
  $('profile-result').replaceChildren(el('p', { className: 'muted' }, 'Cleared.'));
  $('precise-result').replaceChildren(el('p', { className: 'muted' }, 'Cleared.'));
  for (const id of ['server-status', 'fp-status']) { $(id).textContent = 'Idle'; $(id).dataset.state = 'idle'; }
  const frame = $('map-iframe');
  frame.removeAttribute('src');
  frame.hidden = true;
  $('map-empty').hidden = false;
  $('map-link').hidden = true;
  $('map-caption').textContent = 'No location shown yet.';
}

/* ============================== init ============================== */

function init() {
  $('boot-warning').remove();
  $('fact-secure').textContent = window.isSecureContext ? 'Yes (HTTPS or localhost)' : 'No — precise location will be blocked';
  $('fact-origin').textContent = window.location.origin;

  $('precise-btn').addEventListener('click', requestPreciseLocation);
  $('clear-btn').addEventListener('click', clearAll);
  $('refresh-btn').addEventListener('click', () => { loadServerView(); loadFingerprint(); });

  // Auto-run the two passive reads, to demonstrate they need no click.
  loadServerView();
  loadFingerprint();
}

init();
