/**
 * api/board.js  —  Vercel Serverless Function (GET, DELETE)
 * ----------------------------------------------------------------------------
 * GET    → the list of volunteered entries (newest first).
 * DELETE → clears the board (the "Clear board" button). Open to anyone, since
 *          this is a demo; everything in it was volunteered and expires anyway.
 */

import { listEntries, clearBoard, backendName } from '../lib/board-store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'DELETE') {
      await clearBoard();
      res.status(200).json({ ok: true, cleared: true });
      return;
    }
    const entries = await listEntries();
    res.status(200).json({ entries, backend: backendName() });
  } catch (err) {
    res.status(500).json({ error: 'Could not read the board: ' + err.message });
  }
}
