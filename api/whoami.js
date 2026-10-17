/**
 * api/whoami.js  —  Vercel Serverless Function
 * ----------------------------------------------------------------------------
 * This is the ONLY server-side code that runs in production. When your browser
 * requests /api/whoami, Vercel runs this function and hands it the request.
 *
 * It replies with everything the server can tell about you from the request
 * alone — no permission prompt, no tracking cookie required. That reply is sent
 * straight back to the same visitor so they can SEE it. Nothing is stored.
 *
 * This is the honest, visible version of what a real ad or analytics server
 * does silently on millions of sites.
 */

import { describeVisitor } from '../lib/collect.js';

export default async function handler(req, res) {
  const result = await describeVisitor({
    headers: req.headers,
    socketAddress: req.socket ? req.socket.remoteAddress : undefined,
  });

  // No-store: make it clear this is a fresh read every time, never cached.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(JSON.stringify(result, null, 2));
}
