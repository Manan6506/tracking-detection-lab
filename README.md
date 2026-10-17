# Tracking Detection Lab

An educational web app that shows you, honestly and in real time, **what a website and the third-party trackers inside it learn about you the moment you arrive** — your IP, your approximate location, and your browser fingerprint — and how that data is used to target ads.

It's the "other side" of location detection: not *you* asking for your location, but a *server* quietly receiving it, with no prompt, just because your browser connected.

> This demonstrates tracking so you can understand and defend against it. It is a transparent demo, not a covert tracker: every visitor sees their own data on their own screen, nothing is stored, and no real ad networks are involved.

---

## What it shows

1. **What the server already knows** — the IP address, User-Agent, language, and (on Vercel) the city your IP maps to. All received automatically, with no click and no permission. This is what *every* server you contact gets, including embedded ad/analytics companies.
2. **Your browser fingerprint** — 19 permission-free signals (screen, timezone, languages, CPU, canvas, WebGL/GPU, fonts…) combined into one near-unique ID that survives clearing cookies. Computed in your browser, shown only to you.
3. **How the data targets ads** — the audience "segments" a tracker could tag you with, and a mock real-time-bidding request, built from your actual data.
4. **Precise location** — the one signal that still needs your explicit consent. Allow it and compare with the IP guess.
5. **The group board (opt-in)** — the honest way to "see everyone's location". Each visitor types a name and clicks **Share**, previews exactly what will be posted, and only then does their city/coordinates appear on a shared board you can watch. See [The group board](#the-group-board-sharing-with-friends) below.
6. **How to protect yourself**, and **how it all works** under the hood.

### Why there's no "silently see my friends' location" button

A link that captures whoever clicks it — grabbing precise location if they allow, falling back to their IP location if they deny — and reports it to the sender is an *IP logger / location grabber*. Even among friends, the person clicking doesn't know their coordinates are being sent to someone else, and the "fall back to IP if they deny" part is specifically designed to locate people who declined. That's the stalkerware pattern this lab teaches people to defend against, so it isn't built. The **group board** does the same demo honestly: each person opts in with a visible preview.

---

## How it's built

Plain HTML/CSS/JavaScript, no framework. The only server-side code is one small function that reads the incoming request and hands it back to you.

```
index.html              The page
css/styles.css          Styling (light + dark, responsive)
js/app.js               Orchestrates the sections
js/server-info.js       Calls /api/whoami
js/fingerprint.js       Computes the browser fingerprint (client-side, shown to you only)
js/board.js             The opt-in group board: share preview, post, live list
js/geolocation.js       Browser precise-location request + friendly errors
js/coordinates.js       Validation / distance / formatting helpers
js/map.js               OpenStreetMap embed + link URLs
lib/collect.js          Shared "what the server sees" logic (IP, geo, headers)
lib/board-store.js      Board storage: Vercel KV if configured, else in-memory
lib/share-entry.js      Builds one board entry from a share request
api/whoami.js           GET  — what the server sees about you
api/share.js            POST — add your result to the board (opt-in)
api/board.js            GET/DELETE — read or clear the board
dev-server.mjs          Local Node server mirroring all three APIs
package.json            type: module; Node 18+
vercel.json             Vercel config
```

**Why two servers?** The IP and geo lookup must happen on a server. `api/whoami.js` is that server on Vercel. `dev-server.mjs` is the same thing on your Mac for local testing. Both call the identical `lib/collect.js`, so behaviour matches.

---

## Run it on your MacBook

You need **Node.js** (you have `v22`). From this folder:

```bash
node dev-server.mjs
```

Then open **http://localhost:3000**. Press **Ctrl + C** to stop.

> Don't use `python3 -m http.server` here — it can't run `/api/whoami`, so the server view won't load. Use `node dev-server.mjs`.

**On localhost you'll see IP `127.0.0.1` and no city.** That's correct: a server on your own machine can't see your public IP. To see the real thing — and to test with teammates — deploy it (next section).

---

## Deploy to Vercel (so teammates elsewhere can try it)

This is the best way to see it work, because Vercel gives the server your real public IP **and** adds city/latitude/longitude geo headers for free.

**Option A — from the website (no install):**
1. Put this folder in a GitHub repo (see *Git* below).
2. Go to [vercel.com](https://vercel.com), sign in, **Add New → Project**, and import the repo.
3. Framework preset: **Other**. No build command, no environment variables. Click **Deploy**.
4. You'll get a URL like `https://your-lab.vercel.app`. Share it with your team.

**Option B — from the terminal:**
```bash
npm i -g vercel
vercel
```
Follow the prompts (accept the defaults), then `vercel --prod` for a production URL.

Each teammate who opens the URL sees **their own** IP, city and fingerprint. Compare them — people in different cities or countries will see different locations, and VPN users will see their VPN's location. That's the demonstration.

> Please tell teammates it's a tracking demo before sending it. Showing people what's collected about them is the point; collecting it without their knowledge would not be.

---

## The group board (sharing with friends)

The board lets your group actually *see everyone's* locations in one place — the catch, by design, is that each person opts in.

**How it works for a visitor:** open the link → they see their own data → in section 5 they type a name and click **Share my result with the group** → a preview shows exactly what will be posted (name, approximate place, coordinates, and whether it's precise or IP-only) → they confirm. Their entry then appears on the board, which everyone can see and which auto-refreshes.

**To make the board work in production you must add a KV store** (one-time, free, ~2 minutes). Without it, each Vercel serverless instance has its own memory, so entries won't be shared reliably.

1. Open your project on **vercel.com** → **Storage** tab → **Create Database** → **KV** (Upstash Redis) → accept the defaults → **Create**.
2. When asked, **connect** it to this project. Vercel adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables automatically — the code reads them.
3. **Redeploy** (Deployments tab → ⋯ → Redeploy, or push any commit). The board's footer should now read *"Storage: Vercel KV — shared across everyone."*

**Privacy of the board:** each entry stores a name, coarse location, coordinates, source and time, plus a **masked** IP (e.g. `203.0.x.x`). It auto-expires after 24 hours, the list is capped, and anyone can press **Clear board** to wipe it immediately. Precise coordinates are stored only for people who allowed precise location *and* chose to share.

---

## Privacy and what this demo does **not** do

- **No storage.** `lib/collect.js` reads each request, replies, and forgets. There is no database, no log file, no profile kept. (Vercel keeps its own standard access logs, as any host does; this app writes none of its own.)
- **No third-party trackers.** A Content Security Policy in `index.html` blocks every outbound connection except to this site itself, `get.geojs.io` (IP → city) and `openstreetmap.org` (map tiles). You can confirm this in your browser's Network panel.
- **Your fingerprint never leaves your browser** in this code. A real tracker *would* send it to its server — that's the lesson — but this app only displays it.
- **No covert collection.** It doesn't pretend to be another site, and it doesn't build dossiers on named people. Each visitor sees only their own reading.
- **External services:** GeoJS receives your IP (to return a city) only when you're not on localhost; OpenStreetMap receives coordinates for the map; the browser's own location service is used only if you click *Allow* in section 4. Each has its own privacy policy.

---

## Limitations

- **IP geolocation is approximate** — city-level at best, and it reflects your ISP, VPN or relay, not your device. Can be 100+ km off.
- **This demo sees only one page.** Real tracking power comes from the *same* company's code being on thousands of sites, linking your visits. This app embeds no real trackers, so it can't and doesn't do that.
- **Fingerprint entropy (~40 bits here) is a teaching estimate**, not a precise uniqueness measurement. The signals also shift across browsers and updates.
- **GeoJS / OpenStreetMap are free services** with no uptime guarantee, and ad/privacy blockers may block the IP lookup (you'll see the location simply fail — itself a useful result).
- **Vercel's free tier** is enough for a team demo, but serverless functions have usage limits.
- **Not production software.** No rate limiting, no caching, no abuse protection.

---

## Test checklist

- [ ] `node dev-server.mjs` → `http://localhost:3000` loads with no console errors
- [ ] Section 1 shows your IP and User-Agent automatically, with the "no prompt" flag
- [ ] On localhost it correctly says `127.0.0.1` / local, and explains why
- [ ] Section 2 shows a fingerprint ID, ~entropy, and ~19 signals (canvas hash, GPU, fonts…)
- [ ] Reloading keeps the fingerprint ID the same
- [ ] Section 3 lists audience segments and a bid request containing your real IP
- [ ] Section 4: precise location prompts, then (if allowed) shows coordinates and the map
- [ ] The map renders with a marker once coordinates exist
- [ ] Section 5: typing a name + **Share** shows a preview; confirming adds a row to the board
- [ ] A precise share shows a "precise" badge and coordinates; an IP share shows "IP"
- [ ] **Clear board** empties it
- [ ] **Clear** wipes every section; **Re-run** reloads the passive reads
- [ ] At phone width there's no sideways scrolling
- [ ] On the deployed Vercel URL, a non-local IP shows a real city (test from your phone on mobile data)
- [ ] On Vercel with KV added, the board footer says "Vercel KV" and two devices see each other's entries

### What was actually tested during development

Tested in the Claude desktop app's built-in browser (Chromium), desktop and 375 px widths, dark theme.

**Tested for real:**
- `/api/whoami` via the local Node server: returns the real User-Agent and `127.0.0.1` on localhost.
- **Server-side GeoJS lookup** by sending a public IP in `X-Forwarded-For` (`8.8.8.8` → "Google LLC", United States) — this is the code path that runs on Vercel.
- **Vercel geo headers** parsed correctly, including percent-decoding (`São Paulo`) — the production path.
- Fingerprint computed live (real Apple M4 GPU via WebGL, canvas hash, 19 signals, ~40 bits).
- Ad-profile segments and the mock bid request, built from the real collected data.
- The map rendering with a marker, and the OpenStreetMap link.
- **The group board end to end** (in-memory backend): `/api/share` and `/api/board` via curl (IP share with a real public IP filled a real city + coordinates); and in the browser, the share preview, confirming an IP share and a precise share, the board listing both with correct badges/masked IP/map link, and **Clear board**.
- No sideways scrolling at 375 px; no console errors.

**Tested with a stand-in:**
- Precise-location **success** and the map it draws were verified by stubbing `getCurrentPosition` in the test tab, because the built-in test browser can't grant real location. The code path (validation, distance-from-IP, map) is real; only the coordinates were fake.

**Not yet tested — please check these yourself:**
- A **real Vercel deployment** end to end (I can't deploy to your account). The server logic is verified locally with forwarded/geo headers, but you should confirm the live URL.
- **The KV-backed board on Vercel** — tested only with the in-memory backend locally. Add a KV store and confirm two devices see each other's shares.
- A **real "Allow"** on your own Mac, and a real GPS/Wi-Fi reading.
- **Teammates in other locations** opening the deployed URL and using the board.
- **Safari and Firefox**, which expose fewer fingerprint signals and may block the canvas read.

---

## Git (optional, needed for the website deploy option)

This folder isn't a git repo yet. To make one:

```bash
git init
git add -A
git commit -m "Tracking Detection Lab"
```

Then create an empty repo on GitHub and follow its "push an existing repository" instructions. (Tell me if you'd like me to set this up.)

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Section 1 says "Could not reach /api/whoami" | You're on a plain static server. Use `node dev-server.mjs`, or the Vercel URL. |
| Yellow "JavaScript hasn't started" banner | You opened the file directly. Run the dev server and use `http://localhost:3000`. |
| IP shows `127.0.0.1`, no city | Expected on localhost. Deploy to Vercel to see your public IP. |
| Location fails on the deployed site | An ad/privacy blocker may be blocking GeoJS, or the IP lookup timed out. Vercel's own geo headers should still fill in the city. |
| Map is grey for a few seconds | OpenStreetMap tiles are loading; needs internet. |
| Fingerprint "Canvas: blocked" | A privacy browser (Brave, Tor) blocked the canvas read — a feature, not a bug. |
| Board entries vanish / friends don't see each other's shares | No KV store on Vercel. Add one (see *The group board*) and redeploy. The footer should say "Vercel KV". |
