# Online play: the plan, what exists, what is reserved

## What the owner asked for (2026-10-30, answers to the questionnaire of the same day)
- Online battle royale (everything added later too) and online 1v1 with strangers, on a REAL server, free ("choose the free one, complete the limits with the recommended option").
- When there are not enough players (10 are enough) the game says that some or all players are bots, in the 1v1 too.
- No bot difficulty: the player meets bots or people of his own level (points, win rate, eliminations, play time). Waits: up to a minute in the battle royale, 30 s in a duel.
- Optional Google sign-in (same progress on phone and computer, a protected name in the table). NOT built yet.
- A worldwide Top 100 and a ranked mode with 3-month seasons: remember it and take it into account, do NOT build it yet (see "Reserved").

## Architecture: a free lobby server + peer-to-peer matches (hybrid)
```
  player A ──WebSocket──┐                                  ┌── player B
  player B ──WebSocket──┼─> Cloudflare Worker + Durable Object "Lobby" (matchmaker.js)
  player C ──WebSocket──┘       who plays with whom, who hosts, how many bots
        |                                                    |
        └──────── WebRTC (PeerJS), star around the host: the game itself ─────┘
                  the host also runs the bots (net/p2p.js)
```
Why not a server that runs the game: the free plan of Cloudflare gives 100,000 requests a day (every WebSocket message counts, 1 in 20 for the incoming ones) and little CPU, the game's world (three.js, bots, loot) is built around the browser and would have to be rewritten to run headless, and a stream of 20 messages a second per player would use the daily quota in a few hours. Matchmaking needs a handful of messages per player, the match traffic goes peer-to-peer and costs nothing. That is the "recommended option" (P2P) completing what a free server cannot do. The code is split so that a paid, authoritative server can take over later: `matchmaker.js` is independent of the transport and the game traffic is a small set of messages (docs/ONLINE.md).
Sources for the limits: https://developers.cloudflare.com/durable-objects/platform/pricing (checked 2026-10-31).

## What exists (v4.3.0)
- `server/matchmaker.js`, `server/worker.js`, `server/wrangler.toml`, `server/dev-lobby.html`, `server/README.md`; `docs/ONLINE-SETUP-HE.md` (the owner's steps).
- `src/net/matchmaking.js`: the "Find match" flow, the "looking for players" screen, the fall-back to bots (no server set up, no connection, nobody came, the others could not be connected), `online-config.json` for the address.
- `src/net/p2p.js`: public parties (`pbr` = everybody against everybody, `duel`), `Net.publicMatch` / `autoStart`, equipment and level in the hello, FFA end rule, host-left cancellation.
- `src/core/skill.js`: the rating the server matches on (`Skill.rating()`), the bots' level and equipment.
- Labels: `Game.compose()` / `announceCrowd()` (all other players are bots / N real players, M bots / your opponent is a bot or a real person), the `[BOT]` tag in the kill feed of a match with real players.

## Match flow
1. Ticket to the lobby (`Matchmaking.find`). 2. The lobby answers with a status every 2 s and, when it has a group, with the match. 3. Everybody connects to PeerJS with the peer id of the ticket; guests connect to the host and send `join`; the host starts when everybody promised is there or after 14 s with whoever came. 4. `go` -> the usual co-op start (host runs the world and the bots, guests get loot / zone / bots as puppets) with `ffa = true`: nobody is on a team, `hitRemote` hurts everybody, the host ends the match when one player is left or no real player is.
Fall-backs (each shows its reason and starts a match against bots): no `online-config.json` address, the lobby cannot be reached (8 s), nothing within 95 s, the lobby sends a one-player match (battle royale after 60 s alone) or a duel timeout, PeerJS unreachable, the host never starts (26 s).

## Public battle royale: how it differs from the squad co-op
- `Net.ffa`: `team = null` for everybody, the host's bots fight the guests too, a kill by a guest is credited by the victim's `dead` message (`by`), the place of a dead player is `Net.myRank` (alive bots + alive people + 1).
- A guest who dies sees his result at once; the host who dies keeps the world running for the others (banner "You are out: rank N") and sees his result when the match ends.
- The host leaving cancels the match for the guests: "The host left the match", nothing is counted (`extra.noStats` in `Game.finish`). There is no host migration.
- 20 places = real players + bots (`botCount = 20 - players`), the bots are drawn around the average level of the real players.

## Honest limits
- A host decides a lot (the world, the bots, when the match ends) and every player simulates and shoots for himself: a determined cheater can cheat inside a match. Results of public matches are not verified by anything.
- WebRTC may fail behind strict NATs (no TURN server: the free PeerJS broker only gives STUN) and a phone is a poor host; the lobby prefers desktops as hosts. In that case the player gets the "could not connect" fall-back.
- The uplink of the host carries the whole match (about 4 Mbit/s for 10 players with the current messages): fine on a desktop line, marginal on mobile data.
- Tested in the browser pane with a lobby tab (`server/dev-lobby.html`) and two game tabs on the public PeerJS broker: battle royale with 2 players + 18 bots (damage, kill credit, ranks, win), 1v1, cancel, timeouts, the three fall-backs, clean teardown. NOT tested: the real Cloudflare deployment (no Node.js on the build machine; the `Lobby` class was tested with mocked WebSockets), two real machines, more than 2 players, a phone as guest or host.

## Reserved (owner: "remember it and take it into account, do not build it yet")
Worldwide Top 100, refreshed whenever somebody opens it, regardless of the ULTRA MAX skin, all games; a ranked mode that resets every 3 months with a table by placement that also feeds the all-time table (ranked pays more than a normal match). The assistant's opinion (2026-10-30) and the design that fits what exists:
- Two tables of 100: "season" (rating points, reset every 3 months) and "all time" (total points, never reset). A ranked match gives the all-time table more points than a normal one (for example x2). The ULTRA-only rule of `Online.submitScore()` goes away.
- Seasons = calendar quarters from the server's clock (no cron: "reset" is a new key, `2026-Q4`), old seasons stay as history. Tiers with generic metal names and an own top name (for example Bronze, Silver, Gold, Platinum, Diamond, Master, "Last Squad" for the top 100); rating points by place plus eliminations, an entry cost in the high tiers, a soft reset (drop two tiers, not to zero), cosmetic rewards only. No names or ranks copied from other games.
- Bots: an elimination of a bot is worth little (about a quarter) and a ranked match needs enough real players, otherwise it is a normal match.
- Cheating is the real problem: with peer-to-peer matches and no server that runs the game, anybody can post a false score. Without a server only hardening is possible (a ceiling of points per match, rules in the database, two players reporting the same result); a table that can be trusted needs an authoritative server (or at least server-checked results). The table starts empty: no invented players.
- Technique: one read of 100 rows when the table is opened (cached for a minute), writes only when a value rises; Cloudflare D1 / KV in the same account would do (the Firebase code in `online.js` is the older option). Identity: an anonymous id now, optional Google sign-in (Firebase Authentication, the ID token checked by the worker) for the same progress on every device and a protected name. Basic filtering of names; real moderation needs a person.
- The rating already exists (`Skill.rating()` 0..100 and the last ten results); a ranked rating would be a separate number per season next to it.

## Roadmap
1. Deploy the lobby (owner: Cloudflare account, Node.js; the assistant asks before every download and before deploying). 2. Optional Google sign-in. 3. Results validation + the global table + ranked seasons (above). 4. TURN for the players behind strict NATs. 5. An authoritative server (paid) if the game grows.
