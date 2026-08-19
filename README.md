# Demolition — Wreck It

A hypercasual physics-demolition PWA. Tap where you want to hit — the
wrecking ball flies in from the viewer's position toward that point — and
level as much of the structure as you can in 6 shots and 30 seconds. Hit the
orange TNT blocks for chain-reaction explosions. The camera looks straight
down the structure (tap-to-target, ball between you and the wall) rather
than a side-on slingshot view.

## Files
- `index.html` — page shell, HUD, overlays, styling
- `game.js` — Matter.js physics, slingshot input, explosions, scoring, PWA hooks
- `manifest.json` — makes it installable ("Add to Home Screen")
- `sw.js` — service worker for offline play after first load
- `icon-192.png`, `icon-512.png` — app icons

No build step. No dependencies to install locally — Matter.js loads from a CDN
in the browser.

## Deploy for free (pick one)

### Option A — Vercel (recommended, ~2 minutes)
1. Go to https://vercel.com and sign up (free, no card needed).
2. Click **Add New → Project → Upload** (or drag this folder onto the
   dashboard if prompted).
3. Deploy. Vercel gives you a live URL like `demolition-xyz.vercel.app`.
4. That's it — the game is live and installable.

### Option B — Netlify (drag-and-drop)
1. Go to https://app.netlify.com/drop
2. Drag the whole `demolition-game` folder onto the page.
3. You get an instant live URL.

### Option C — GitHub Pages (free, ties to a repo)
1. Create a new GitHub repo, upload these files to it.
2. Repo → Settings → Pages → Source: `main` branch, `/root`.
3. Your game goes live at `https://<username>.github.io/<repo-name>/`.

Any of these give you an HTTPS URL — required for the "Install" prompt and
service worker to work.

## Testing installability
Open the deployed URL on a phone (Chrome/Android or Safari/iOS):
- **Android/Chrome**: you'll see an "Install App" button appear (bottom
  right) or the browser's own install banner.
- **iOS/Safari**: no auto-prompt (Apple doesn't support it) — tell users to
  tap Share → "Add to Home Screen." Worth mentioning in your video captions.

## For your TikTok/Reels funnel
- Film 2–3 runs, keep the best 15–20 seconds — the TNT chain reactions are
  the most watchable moments, lead with one.
- Put the live URL in your bio; captions like "link in bio, no download
  needed" work well since it's a web link, not an app store listing.
- The game auto-shows a result card with % destroyed — good for a
  "beat my score" hook in captions.

## Editing / iterating
Everything is in plain HTML/CSS/JS — no framework. To tweak difficulty:
- `MAX_SHOTS`, `timeLeft` (starting values) in `game.js`
- Structure size: `cols`, `rows`, `blockW` in the `layout()` function
- TNT count: the `tntSlots` loop (`while (tntSlots.size < 3)`)
- Depth "punch" strength on impact: `Z_SCALE` and `Z_MAX` in `game.js` (how
  dramatically hit blocks scale toward/away from camera)

Come back to this chat any time you want a second game, a difficulty pass,
sound effects, or a shared hub page linking multiple games together.
