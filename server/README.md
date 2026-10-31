# The lobby server

It puts online players together: players of about the same level, one of them as the host. It does NOT carry the game: a match is played peer-to-peer (WebRTC, `src/net/p2p.js`), so a free plan is enough.
Design and limits: `docs/ONLINE-PLAN.md`. Step-by-step setup in Hebrew for the owner: `docs/ONLINE-SETUP-HE.md`.

| file | what it is |
|---|---|
| `matchmaker.js` | the logic (queues, rating bands, waits, host choice). A plain script: a global in the browser, `module.exports` in a worker / Node. |
| `worker.js` | Cloudflare Worker + Durable Object (`Lobby`): holds the WebSockets (Hibernation API), runs the matchmaker, a 2-second alarm while somebody waits. |
| `wrangler.toml` | the Cloudflare configuration (a SQLite-backed Durable Object, which is what the free plan allows). |
| `dev-lobby.html` | stands in for the worker while testing: the game tabs of one browser talk to it over a `BroadcastChannel` (`?mm=local` in the game's address). |

## Deploy (Cloudflare free plan, no card needed as far as known)
1. A free account: https://dash.cloudflare.com/sign-up
2. Node.js (LTS): https://nodejs.org
3. In this folder:
   ```
   npx wrangler login
   npx wrangler deploy
   ```
   The second command prints the address, `https://lss-lobby.<account>.workers.dev`.
4. Put it in `online-config.json` in the game's folder (wss, not https): `{ "lobby": "wss://lss-lobby.<account>.workers.dev" }`, then publish the game again (new version number, `tools\release.ps1`).
5. Optional: `ALLOWED_ORIGINS` in `wrangler.toml` (the address of the game's site) makes the lobby refuse other pages. Deploy again after changing it.
An empty `lobby` in `online-config.json` means: no server. "Find match" then starts a match against bots and says so.

## Protocol (JSON over one WebSocket per searching player)
Client to server: `{ t: 'q', mode: 'br' | 'duel', id, n, skin, lo, r, hs }` (ticket: id = the peer id, n = name, skin, lo = equipment tiers, r = level 0..100, hs = how good a host the device is), `{ t: 'c' }` cancel, `{ t: 'p' }` ping every 15 s.
Server to client: `{ t: 'w', mode, s, n }` status (seconds waited, players searching), `{ t: 'm', id, mode, role: 'host' | 'guest', host, members: [{ u, n, skin, r, lo }], bots, br }` a match, `{ t: 'x', why: 'timeout' }` (duel: nobody of the same level in time).
The client closes the socket as soon as it has a match; the host then waits for the others on PeerJS (`Net.publicMatch`), the guests connect to the host.

## Rules (`matchmaker.js`)
- Players of about the same level: the band starts at +-15 rating points and widens by 10 every 8 seconds.
- Battle royale: 20 places. Starts at once with 20 players, after 15 s with at least 10 (10 real players are enough), after 60 s with whoever is there; bots fill the rest (the host runs them, around the average level of the real players).
- Duel: two players; after 30 s without a partner the client plays against a bot (the screen says so).
- Host = the best device (`hs`: desktop 100, tablet 60, phone 30, minus 30 for data saver and 25 for a connection slower than 4G), the longest waiting one if equal.

## Cost and limits (Cloudflare free plan, checked 2026-10-31: https://developers.cloudflare.com/durable-objects/platform/pricing)
100,000 requests a day for Durable Objects (WebSocket messages count: an incoming message is billed 1 in 20), 13,000 GB-s of duration a day; past that the lobby fails until 00:00 UTC and the game plays against bots. Per searching player a match costs about 100 requests (a ticket, a ping every 15 s, an alarm every 2 s shared by everybody), so thousands of matches a day fit. The paid plan (about 5 dollars a month) raises the limits.

## Test without a server
Open `server/dev-lobby.html?fast=1` in one tab (waits shortened: a battle royale starts with 2 players after 3 s, a duel waits 10 s) and the game in two more tabs of the same browser:
`/?mm=local&u=alice&n=Alice` and `/?mm=local&u=bob&n=Bob&k=cyber` (`u` gives each tab its own peer id), then "Play online" > "Find match" in both. Keep the lobby tab in front when testing timeouts (a hidden tab runs its timers slowly).
The matchmaker itself has no network code: it can be unit-tested by calling `enqueue(ticket, now)` and `tick(now)` with invented times.
