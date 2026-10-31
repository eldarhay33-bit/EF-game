# Online play (src/net/p2p.js, src/net/matchmaking.js, src/ui/social.js)

Matches are played peer-to-peer: players connect directly over WebRTC with PeerJS. The only external service for that is PeerJS's free public broker (0.peerjs.com), used to find each other. The library is loaded lazily from jsDelivr the first time someone goes online.
Since 4.3.0 there is also an optional LOBBY SERVER (server/, Cloudflare free plan) that puts strangers of the same level together for the online battle royale and the online 1v1 ("Play online" > "Find match"): see `docs/ONLINE-PLAN.md` (design, limits), `server/README.md` and `docs/ONLINE-SETUP-HE.md` (setup). Without it everything else works and "Find match" starts a match against bots and says so.

- Peer id = `lss-` + username (lowercase letters, digits, `_`, max 16). A username that is already online is rejected ("already in use").
- Friends are stored in `Profile.d.friends` (usernames). Presence = "can I open a connection to that peer".
- Star topology: guests connect only to the party host. The host relays state between guests.

## Modes
| Party mode | What runs |
|---|---|
| duo / trio / squad | The host runs the normal Battle Royale including the bots. Guests get the host's loot list, plane route and zone, and see the bots as puppets (`Remote` with `puppet: true`) driven by 8 Hz snapshots. Teammates are on team `A` (no friendly fire). The match ends when the team is wiped out or every bot is dead (decided by the host). |
| duel | Both clients run `Duel` with `opts.net`. Guest takes the opposite spawn. Best of three; the host decides round timeouts. |
| pbr (public battle royale, from the lobby server) | Like the squad co-op (the host runs the world and the bots) but everybody against everybody: `Net.ffa`, `team = null`, 20 places = players + bots (`net.botCount`), the bots are drawn around the average level (`net.rating`). A guest who dies finishes at once (rank = `Net.myRank`), the host who dies keeps the world running; the host ends the match when one player is left or no real player is (`on_end` carries the winner `w`). The host leaving cancels the match for the guests (`noStats`). |
| duel from the lobby server | The same duel; the party is made by `Net.publicMatch` (`auto: true`) and dissolves with the match. |

## Authority
Every player simulates themselves and does the hit detection for their own shots. Damage is sent to the victim (`hit`), who applies it to the real `Player`. Bot damage from a guest goes to the host (`bh`). Explosions are simulated only by the thrower; receivers spawn visual-only copies (`visual: true` in `Projectiles`).

## Messages (JSON, `t` = type)
`hi` name / skin / equipment tiers `lo` / level `r` handshake (the same fields travel in `join` and in the party members, so everybody builds the others with the right gear) · `inv` / `join` / `no` / `leave` / `party` party management · `go` start (duel: map, coop: wait for `init`) · `init` + `il` (world description + loot in chunks of 25, WebRTC drops big messages) · `st` player state 12 Hz · `bs` bot snapshot 8 Hz · `zn` zone 1 Hz · `sh` shot visuals · `th` grenade/rocket visuals · `hit` / `bh` damage · `dead` / `bk` deaths · `ls` / `lr` loot spawn/remove · `end` match result · `dto` duel round timeout · `bye` left the match.

## Limits (known)
- Bikes are not synced: in co-op guests have no vehicles (host-only), supply drops are host-only.
- Pausing stops your simulation, so teammates see you frozen.
- No reconnect: if the host leaves, guests are sent to the end screen.
- Behind strict NATs WebRTC may fail without a TURN server (the free PeerJS broker only provides STUN).

## Testing with two tabs
Settings are shared between tabs of one browser, so open the second tab with overrides:
`/?u=alice&n=Alice` and `/?u=bob&n=Bob&k=cyber` (username, display name, skin). The overrides are kept in memory, but the next `Settings.set` of that tab saves them with everything else: clear the test browser's storage afterwards.
Matches found by the lobby: open `server/dev-lobby.html?fast=1` in a third tab and use `/?mm=local&u=alice&n=Alice` and `/?mm=local&u=bob&n=Bob&k=cyber`, then "Play online" > "Find match" in both (details in `server/README.md`). Driving a hidden tab from a script: call `Game.step(1 / 30)` in a loop with a short `await` every few steps, the pane runs no animation frames for hidden tabs.

## Optional global board
Paste a Firebase Realtime Database URL (rules: read/write true) into Friends -> "Online server" to share the ULTRA MAX Top 100.
