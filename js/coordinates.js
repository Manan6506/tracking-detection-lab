/**
 * coordinates.js
 * ----------------------------------------------------------------------------
 * Small, dependency-free helpers for working with latitude/longitude:
 *   - parsing and validating values typed by a person
 *   - validating values returned by APIs (never trust external data blindly)
 *   - measuring the distance between two points
 *   - formatting numbers for display
 *
 * Latitude  = degrees north (+) or south (−) of the equator,        range −90…90
 * Longitude = degrees east (+) or west (−) of the prime meridian,   range −180…180
 * Both browsers and IP-geolocation APIs use the WGS 84 coordinate system (the
 * same one GPS uses), so values from different sources can be compared directly.
 */

export const LAT_MIN = -90;
export const LAT_MAX = 90;
export const LON_MIN = -180;
export const LON_MAX = 180;

// Accepts plain decimal numbers only: "48.8584", "-0.12", "+2", ".5".
// We are deliberately strict so beginners can see exactly what counts as valid.
// (Number("") is 0 and Number("1e2") is 100 in JavaScript — surprising for a form!)
const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Parse one coordinate typed by a person.
 * @param {string} raw   The text from an <input>.
 * @param {"latitude"|"longitude"} kind
 * @returns {{ ok: true, value: number } | { ok: false, error: string }}
 */
export function parseCoordinateInput(raw, kind) {
  const text = String(raw ?? '').trim();
  const [min, max] = kind === 'latitude' ? [LAT_MIN, LAT_MAX] : [LON_MIN, LON_MAX];
  const label = kind === 'latitude' ? 'Latitude' : 'Longitude';

  if (text === '') {
    return { ok: false, error: `${label} is required.` };
  }
  // A common mistake in many countries: using a comma as the decimal separator.
  if (/^[+-]?\d+,\d+$/.test(text)) {
    return { ok: false, error: `Use a dot as the decimal separator, e.g. ${text.replace(',', '.')}.` };
  }
  // Degrees-minutes-seconds such as 48°51'30"N, or a hemisphere letter, are a different notation we don't parse.
  if (/[°'"′″]/.test(text) || /^[NSEW]|[NSEW]$/i.test(text)) {
    return { ok: false, error: `Enter decimal degrees (e.g. 48.8584), not degrees/minutes/seconds or N/S/E/W letters. Use a minus sign for south or west.` };
  }
  if (!DECIMAL_PATTERN.test(text)) {
    return { ok: false, error: `"${text}" isn’t a plain decimal number. Enter decimal degrees such as ${kind === 'latitude' ? '48.8584' : '2.2945'}.` };
  }

  const value = Number(text);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `${label} must be a finite number.` };
  }
  if (value < min || value > max) {
    return { ok: false, error: `${label} must be between ${min} and ${max} (you entered ${text}).` };
  }
  return { ok: true, value };
}

/**
 * Check a latitude/longitude pair that came from code or an API.
 * Accepts numbers or numeric strings (some APIs return "19.07" as text).
 * @returns {{ ok: true, lat: number, lon: number } | { ok: false, error: string }}
 */
export function validateLatLon(lat, lon) {
  const latNum = typeof lat === 'string' ? Number(lat.trim()) : lat;
  const lonNum = typeof lon === 'string' ? Number(lon.trim()) : lon;

  if (lat === null || lat === undefined || lat === '' || lon === null || lon === undefined || lon === '') {
    return { ok: false, error: 'Coordinates are missing.' };
  }
  if (typeof latNum !== 'number' || typeof lonNum !== 'number' || !Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return { ok: false, error: 'Coordinates are not valid numbers.' };
  }
  if (latNum < LAT_MIN || latNum > LAT_MAX) {
    return { ok: false, error: `Latitude ${latNum} is outside −90…90.` };
  }
  if (lonNum < LON_MIN || lonNum > LON_MAX) {
    return { ok: false, error: `Longitude ${lonNum} is outside −180…180.` };
  }
  return { ok: true, lat: latNum, lon: lonNum };
}

/** 0,0 is a real place ("Null Island", in the Gulf of Guinea) but usually means "missing data". */
export function isNullIsland(lat, lon) {
  return lat === 0 && lon === 0;
}

/**
 * Great-circle distance between two points using the haversine formula.
 * Treats the Earth as a sphere (radius 6,371 km) — accurate to within ~0.5%,
 * which is far better than the uncertainty of any location method here.
 * @returns {number} distance in metres
 */
export function distanceMeters(a, b) {
  const R = 6371008.8; // mean Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* ------------------------------ formatting ------------------------------ */

/** 48.858400 → "48.85840° N". Five decimals ≈ 1 metre, plenty for display. */
export function formatCoordinate(value, kind) {
  const hemisphere = kind === 'latitude' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  return `${Math.abs(value).toFixed(5)}° ${hemisphere}`;
}

/** Signed decimal form used in links and copy-paste: "48.85840, 2.29450". */
export function formatPair(lat, lon) {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/** 12 → "12 m", 1520 → "1.5 km", 152000 → "152 km". */
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 100000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000).toLocaleString()} km`;
}

/**
 * Turn a browser accuracy radius into a plain-English hint.
 * These bands are rough rules of thumb, not guarantees: the browser does not
 * tell the page which signals (GPS, Wi-Fi, cell, IP) it actually used.
 */
export function describeAccuracy(meters) {
  if (!Number.isFinite(meters)) return 'Unknown accuracy.';
  if (meters <= 20) return 'Very precise — typical of satellite (GPS/GNSS) positioning outdoors.';
  if (meters <= 150) return 'Street-level — typical of Wi-Fi-assisted positioning.';
  if (meters <= 1500) return 'Neighbourhood-level — few Wi-Fi signals, or cell-tower positioning.';
  if (meters <= 25000) return 'Town-level — likely cell towers or very limited signals.';
  return 'Very coarse — the browser may have fallen back to an IP-based guess.';
}
