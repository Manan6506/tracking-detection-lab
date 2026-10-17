/**
 * js/server-info.js
 * ----------------------------------------------------------------------------
 * Asks our own /api/whoami endpoint "what did the server just see about me?"
 * and returns it. The server already received all of this simply because the
 * page loaded — this call just shows it back to you.
 */

export async function fetchServerView() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('/api/whoami', {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`The server responded with HTTP ${res.status}.`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The request to /api/whoami timed out.');
    // Most likely cause: the page is being served by a plain static server with
    // no /api function (e.g. python3 -m http.server). Point the user at the fix.
    throw new Error(
      'Could not reach /api/whoami. Run the project with "node dev-server.mjs" (not a plain static server), or open the deployed Vercel URL.'
    );
  }
}
