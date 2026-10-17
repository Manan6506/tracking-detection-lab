/**
 * map.js
 * ----------------------------------------------------------------------------
 * Builds OpenStreetMap URLs. We use OpenStreetMap's own embeddable map page
 * inside an <iframe>, so no mapping library is needed.
 *
 *   Embed:  https://www.openstreetmap.org/export/embed.html?bbox=W,S,E,N&layer=mapnik&marker=LAT,LON
 *   Link:   https://www.openstreetmap.org/?mlat=LAT&mlon=LON#map=ZOOM/LAT/LON
 *
 * Privacy note: loading either URL sends the coordinates (in the URL) and your
 * IP address to openstreetmap.org, because that's how the map tiles get loaded.
 * The embed cannot draw an accuracy circle, so we size the visible area (the
 * "bounding box") to roughly match how uncertain each result is.
 */

const METERS_PER_DEGREE_LAT = 111320; // ≈ length of 1° of latitude anywhere on Earth

/**
 * Bounding box around a point. Longitude degrees shrink towards the poles,
 * so we divide by cos(latitude) to keep the box roughly square on the ground.
 */
export function boundingBox(lat, lon, radiusMeters) {
  // Web maps can't show beyond about ±85° latitude, so centre the box no further
  // out than ±84° (a marker closer to a pole won't be visible, but the link still works).
  const centerLat = clamp(lat, -84, 84);
  const dLat = radiusMeters / METERS_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.01);
  const dLon = radiusMeters / (METERS_PER_DEGREE_LAT * cosLat);
  return {
    south: clamp(centerLat - dLat, -85, 85),
    north: clamp(centerLat + dLat, -85, 85),
    west: clamp(lon - dLon, -180, 180),
    east: clamp(lon + dLon, -180, 180),
  };
}

/** URL for the <iframe>. viewRadiusMeters controls how zoomed-in the map is. */
export function buildEmbedUrl(lat, lon, viewRadiusMeters) {
  const box = boundingBox(lat, lon, viewRadiusMeters);
  const params = new URLSearchParams({
    bbox: [box.west, box.south, box.east, box.north].map((n) => n.toFixed(6)).join(','),
    layer: 'mapnik',
    marker: `${lat.toFixed(6)},${lon.toFixed(6)}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${params}`;
}

/** URL to open the location on openstreetmap.org in a new tab. */
export function buildOsmLink(lat, lon, zoom = 16) {
  const la = lat.toFixed(6);
  const lo = lon.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=${zoom}/${la}/${lo}`;
}

/** Pick a map zoom level (0 = whole world, 19 = a single building) for an uncertainty radius. */
export function zoomForRadius(meters) {
  if (!Number.isFinite(meters)) return 12;
  if (meters <= 50) return 18;
  if (meters <= 150) return 17;
  if (meters <= 400) return 16;
  if (meters <= 1000) return 15;
  if (meters <= 3000) return 14;
  if (meters <= 8000) return 13;
  if (meters <= 20000) return 11;
  if (meters <= 60000) return 10;
  return 8;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
