/**
 * js/board.js
 * ----------------------------------------------------------------------------
 * The opt-in "shared board": a visitor explicitly chooses to post their result,
 * after seeing exactly what will be shared. Everyone (including the person who
 * sent the link) can then view the board.
 *
 * This is the honest alternative to a silent location logger: nothing leaves the
 * visitor's browser until they click Share, and they preview it first.
 */

import { buildEmbedUrl, buildOsmLink, zoomForRadius } from './map.js';

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'className') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/**
 * @param {() => ({ precise: {lat,lon,accuracy}|null, ipLocation: object|null })} getResult
 *        Called when the user clicks Share, to read the current best result.
 */
export function initBoard(getResult) {
  $('share-btn').addEventListener('click', () => openShareDialog(getResult));
  $('board-refresh').addEventListener('click', loadBoard);
  $('board-clear').addEventListener('click', clearBoard);

  loadBoard();
  // Light auto-refresh so a live group demo updates on its own.
  setInterval(loadBoard, 8000);
}

/* ------------------------------ share flow ------------------------------ */

function openShareDialog(getResult) {
  const { precise, ipLocation } = getResult();
  const box = $('share-result');

  // What exactly will be posted? Show it before anything is sent.
  const usingPrecise = Boolean(precise);
  const coords = usingPrecise
    ? { lat: precise.lat, lon: precise.lon }
    : ipLocation && ipLocation.latitude != null
      ? { lat: Number(ipLocation.latitude), lon: Number(ipLocation.longitude) }
      : null;

  const place = ipLocation ? [ipLocation.city, ipLocation.region, ipLocation.country].filter(Boolean).join(', ') : '';

  const preview = el('div', { className: 'panel share-preview' },
    el('p', { className: 'panel-title' }, 'You are about to post this to the shared board'),
    el('dl', { className: 'kv' },
      el('dt', {}, 'Shown as'), el('dd', {}, labelValue()),
      el('dt', {}, 'Approx. place'), el('dd', {}, place || '(unknown — may be blank on localhost)'),
      coords ? el('dt', {}, 'Coordinates') : null, coords ? el('dd', { className: 'mono' }, `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`) : null,
      el('dt', {}, 'Precision'), el('dd', {}, usingPrecise ? 'Exact (you allowed precise location)' : 'Approximate (from your IP only)')
    ),
    el('p', { className: 'inline-note' }, 'Your IP is stored only in masked form (e.g. 203.0.x.x). Everyone who opens the board can see this entry. It auto-expires after 24 hours.'),
    el('div', { className: 'actions' },
      el('button', { className: 'btn btn-primary', id: 'share-confirm', onClick: () => doShare(precise) }, 'Yes, post it to the board'),
      el('button', { className: 'btn btn-ghost', onClick: () => { box.replaceChildren(); } }, 'Cancel')
    )
  );
  box.replaceChildren(preview);
}

function labelValue() {
  const v = $('share-label').value.trim();
  return v ? v.slice(0, 24) : 'anonymous';
}

async function doShare(precise) {
  const box = $('share-result');
  box.replaceChildren(el('div', { className: 'loading' }, el('span', { className: 'spin' }), el('span', {}, 'Posting to the board…')));
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: labelValue(), precise: precise || null }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    box.replaceChildren(el('div', { className: 'panel panel-success' },
      el('p', { className: 'panel-title' }, 'Shared ✓'),
      el('p', {}, 'Your entry is on the board below. You can remove everything with “Clear board”.')
    ));
    loadBoard();
  } catch (err) {
    box.replaceChildren(el('div', { className: 'panel panel-error' }, el('p', {}, 'Could not share: ' + err.message)));
  }
}

/* ------------------------------ board view ------------------------------ */

async function loadBoard() {
  try {
    const res = await fetch('/api/board', { cache: 'no-store' });
    const data = await res.json();
    renderBoard(data.entries || [], data.backend);
  } catch {
    $('board-list').replaceChildren(el('p', { className: 'muted' }, 'Could not load the board.'));
  }
}

function renderBoard(entries, backend) {
  $('board-count').textContent = entries.length ? `${entries.length} shared` : 'empty';
  const list = $('board-list');

  if (!entries.length) {
    list.replaceChildren(el('p', { className: 'muted' }, 'No one has shared yet. Click “Share with the group” above, or send the link to a friend and ask them to.'));
    renderBackendNote(backend);
    return;
  }

  const rows = entries.map((e) => {
    const place = [e.city, e.region, e.country].filter(Boolean).join(', ') || '—';
    const coords = e.lat != null && e.lon != null ? `${Number(e.lat).toFixed(4)}, ${Number(e.lon).toFixed(4)}` : '—';
    const mapLink = e.lat != null && e.lon != null
      ? el('a', { className: 'board-map-link', href: buildOsmLink(Number(e.lat), Number(e.lon), zoomForRadius(e.source.startsWith('precise') ? 400 : 25000)), target: '_blank', rel: 'noopener noreferrer' }, 'map ↗')
      : null;
    return el('tr', {},
      el('td', {}, el('strong', {}, e.label)),
      el('td', {}, place),
      el('td', { className: 'mono' }, coords),
      el('td', {}, el('span', { className: 'src-badge', 'data-src': e.source.startsWith('precise') ? 'precise' : 'ip' }, e.source.startsWith('precise') ? 'precise' : 'IP')),
      el('td', { className: 'mono dim' }, e.ipMasked),
      el('td', {}, new Date(e.sharedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      el('td', {}, mapLink)
    );
  });

  list.replaceChildren(
    el('div', { className: 'table-wrap' },
      el('table', { className: 'board-table' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Name'), el('th', {}, 'Place'), el('th', {}, 'Coordinates'),
          el('th', {}, 'Source'), el('th', {}, 'IP (masked)'), el('th', {}, 'Shared'), el('th', {}, '')
        )),
        el('tbody', {}, rows)
      )
    )
  );
  renderBackendNote(backend);
}

function renderBackendNote(backend) {
  const note = $('board-backend');
  if (!note) return;
  if (backend && backend.startsWith('Vercel KV')) {
    note.textContent = 'Storage: Vercel KV — shared across everyone.';
    note.dataset.tone = 'ok';
  } else {
    note.textContent = 'Storage: in-memory. Fine on your Mac, but on Vercel you must add a KV store (see README) or entries won’t be shared between visitors.';
    note.dataset.tone = 'warn';
  }
}

async function clearBoard() {
  if (!confirm('Clear every entry from the shared board?')) return;
  try {
    await fetch('/api/board', { method: 'DELETE' });
    loadBoard();
    $('share-result').replaceChildren();
  } catch {
    /* ignore */
  }
}
