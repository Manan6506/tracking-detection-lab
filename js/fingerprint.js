/**
 * js/fingerprint.js
 * ----------------------------------------------------------------------------
 * A browser "fingerprint" is a set of fairly stable details about your device
 * and browser. On their own each is harmless, but combined they can be unusual
 * enough to recognise you again WITHOUT a cookie — which is why trackers use
 * fingerprinting when cookies are blocked or cleared.
 *
 * Everything here runs in YOUR browser and is shown only to you. None of it is
 * sent to the server by this module. The point is to let you SEE what a tracker
 * could read, and roughly how identifying it is.
 *
 * Each "signal" below is something any web page can read with no permission.
 */

/** Collect all signals. Returns an array of { label, value, bits, note }. */
export async function collectFingerprint() {
  const signals = [];
  const add = (label, value, bits, note) => signals.push({ label, value: safe(value), bits, note });

  // --- Screen & window ---------------------------------------------------
  add('Screen size', `${screen.width} × ${screen.height}`, 4.8, 'Your monitor resolution.');
  add('Colour depth', `${screen.colorDepth}-bit`, 1.0);
  add('Device pixel ratio', String(window.devicePixelRatio), 2.0, 'Retina displays report 2 or 3.');
  add('Viewport size', `${window.innerWidth} × ${window.innerHeight}`, 3.0, 'Your window size — changes if you resize.');

  // --- Locale & time -----------------------------------------------------
  const dtf = Intl.DateTimeFormat().resolvedOptions();
  add('Time zone', dtf.timeZone || 'unknown', 3.0, 'A strong hint at your part of the world.');
  add('Locale', dtf.locale || navigator.language, 2.0);
  add('Languages', (navigator.languages || []).join(', ') || navigator.language, 2.5, 'The languages your browser advertises.');
  add('UTC offset', `${-new Date().getTimezoneOffset() / 60} h`, 1.5);

  // --- Device & browser --------------------------------------------------
  add('Platform', navigator.platform || 'unknown', 2.0);
  add('CPU cores', String(navigator.hardwareConcurrency || 'unknown'), 2.0, 'navigator.hardwareConcurrency.');
  add('Device memory', navigator.deviceMemory ? `${navigator.deviceMemory} GB (approx)` : 'not shared', 1.5);
  add('Touch points', String(navigator.maxTouchPoints || 0), 1.0, 'Non-zero on touchscreens.');
  add('Cookies enabled', String(navigator.cookieEnabled), 0.3);

  // --- Do Not Track / Global Privacy Control -----------------------------
  add('Do Not Track', navigator.doNotTrack || 'not set', 0.5, 'A request to not be tracked. Most trackers ignore it.');
  add('Global Privacy Control', 'globalPrivacyControl' in navigator ? String(navigator.globalPrivacyControl) : 'not set', 0.5);

  // --- Canvas fingerprint ------------------------------------------------
  // The same drawing instructions produce subtly different pixels on different
  // GPUs/drivers/fonts. Hashing those pixels gives a surprisingly stable ID.
  const canvas = await canvasHash();
  add('Canvas hash', canvas.hash, 6.0, canvas.note);

  // --- WebGL (graphics hardware) -----------------------------------------
  const webgl = webglInfo();
  add('GPU (WebGL)', webgl.renderer, 5.0, 'Your graphics chip, exposed to any page.');
  if (webgl.vendor) add('GPU vendor', webgl.vendor, 1.0);

  // --- Fonts (a small probe) ---------------------------------------------
  const fonts = detectFonts();
  add('Unusual fonts found', fonts.length ? fonts.join(', ') : 'none of the probed set', 3.0, 'Installed fonts vary by OS and software.');

  // Build one combined hash of the stable signals = the "tracking ID".
  const stable = signals
    .filter((s) => !['Viewport size'].includes(s.label)) // viewport changes on resize
    .map((s) => `${s.label}=${s.value}`)
    .join('|');
  const id = await sha256Hex(stable);

  // Rough total entropy (capped). ~33 bits is enough to single out one person
  // among ~8 billion; this is a teaching estimate, not a precise measurement.
  const totalBits = Math.min(
    signals.reduce((sum, s) => sum + (s.bits || 0), 0),
    40
  );

  return { signals, id, totalBits };
}

function safe(v) {
  return v === undefined || v === null || v === '' ? 'unknown' : String(v);
}

/** Draw text + shapes to a canvas and hash the resulting pixels. */
async function canvasHash() {
  try {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 60;
    const ctx = c.getContext('2d');
    if (!ctx) return { hash: 'unavailable', note: 'Canvas not available.' };
    ctx.textBaseline = 'top';
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(10, 10, 100, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('Tracking Lab 🌍 Ág', 12, 15);
    ctx.strokeStyle = 'rgba(120,0,200,0.5)';
    ctx.arc(60, 30, 20, 0, Math.PI * 1.6);
    ctx.stroke();
    const data = c.toDataURL();
    const hash = await sha256Hex(data);
    return { hash: hash.slice(0, 16) + '…', note: 'A picture drawn off-screen; the exact pixels depend on your GPU and fonts.' };
  } catch {
    return { hash: 'blocked', note: 'Reading the canvas was blocked — some privacy browsers do this.' };
  }
}

/** Read the WebGL renderer/vendor strings (the graphics chip). */
function webglInfo() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return { renderer: 'WebGL unavailable', vendor: null };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    return { renderer: renderer || 'unknown', vendor: vendor || null };
  } catch {
    return { renderer: 'blocked', vendor: null };
  }
}

/**
 * Detect whether a few "marker" fonts are installed, by measuring text width
 * against fallback fonts. A real tracker probes dozens; we probe a handful.
 */
function detectFonts() {
  const probe = ['Menlo', 'Monaco', 'Helvetica Neue', 'Segoe UI', 'Roboto', 'Ubuntu', 'Cantarell', 'Tahoma', 'Courier New', 'Comic Sans MS'];
  const baseFonts = ['monospace', 'sans-serif', 'serif'];
  const testString = 'mmmmmmmmmmlli';
  const size = '72px';

  const span = document.createElement('span');
  span.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;';
  span.textContent = testString;
  document.body.appendChild(span);

  const baseline = {};
  for (const base of baseFonts) {
    span.style.fontFamily = base;
    span.style.fontSize = size;
    baseline[base] = { w: span.offsetWidth, h: span.offsetHeight };
  }

  const found = [];
  for (const font of probe) {
    let detected = false;
    for (const base of baseFonts) {
      span.style.fontFamily = `'${font}',${base}`;
      if (span.offsetWidth !== baseline[base].w || span.offsetHeight !== baseline[base].h) {
        detected = true;
        break;
      }
    }
    if (detected) found.push(font);
  }
  document.body.removeChild(span);
  return found;
}

/** SHA-256 hex digest using the built-in Web Crypto API. */
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
