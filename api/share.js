/**
 * api/share.js  —  Vercel Serverless Function (POST)
 * ----------------------------------------------------------------------------
 * Called ONLY when a visitor clicks "Share with the group". It builds a board
 * entry from their request (IP-derived location, plus precise coords if they
 * chose to send them) and stores it. Nothing is stored unless this is called.
 */

import { buildEntry } from '../lib/share-entry.js';
import { addEntry } from '../lib/board-store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Use POST to share.' });
    return;
  }

  // Vercel parses JSON bodies for us; guard anyway.
  const body = typeof req.body === 'object' && req.body ? req.body : {};

  try {
    const entry = await buildEntry(
      { headers: req.headers, socketAddress: req.socket ? req.socket.remoteAddress : undefined },
      body
    );
    await addEntry(entry);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, entry });
  } catch (err) {
    res.status(500).json({ error: 'Could not save to the board: ' + err.message });
  }
}
