# Last Squad Standing - handoff (v3.1.0)

## v3.1.0 changes
- FIXED "sometimes it does not shoot": `Player.lastShot` kept the previous match's clock value, so after a long match you could not fire for minutes into the next one (Player.reset now clears all clock stamps). Clicks shorter than a frame are latched (`fireQueueT`) and a tap cancels sprint.
- FIXED crash when the player holds no weapon (viewmodel kept a stale weapon).
- Healing items: bar above the ammo (bandage 6, medkit 7, shield potion 8, big shield 9, grenades G/F/X/B), clickable; H / Q still pick the best item. Bandage heals up to 75 HP, medkit to 100.
- Drop weapon: Z (gamepad: hold X/Square, touch: bin button). Dropped weapons keep their magazine.
- Ammo is picked up automatically when walking over it, with "+30 5.56" notes.
- Graphics: vibrance + split-toned grading, stronger bloom, brighter sky/lighting, vivid grass and water, brighter varied tree colours (green, yellow, orange, blossom), rarity-coloured guns, sunset-gradient lobby.
- 15 new skins (32 total): cowboy, panda, ninja, pirate, viking, pumpkin, robot, knight, alien, unicorn, neon rider, ghost, frost king, magma lord, celestial guardian. New accessory types live in `src/entities/skins.js` (`addLook`).

Run locally: serve the project root with any static server (e.g. `powershell -File ../_serve.ps1 -Root . -Port 8081`) and open http://localhost:8081/ .
No build step. three.js r158 comes from the jsdelivr import map in index.html. Netlify: drag the folder or `dist/last-squad-standing-3.1.0.zip` (unpacked). NOTHING IS DEPLOYED YET and it must not be without the owner's approval.

## State
All five planned steps are done and were checked in the preview pane (details below). See README.md for the layout and docs/ONLINE.md for the network design.

### Verified
- Boot, lobby, all tabs, no console errors. Mouse look: pointer lock cannot be granted to scripted events, the cursor-steering fallback was tested (yaw follows the cursor). Fire works (pistol mag drops, hits land).
- 4-minute BR fuzz (Game.step(1/30), Player.invuln), insane-difficulty BR, offline duel, full tutorial (14 steps): no exceptions.
- Translations: `tools\i18n-check.ps1 -Lang <code>` = 0 missing for en, he, es, fr, de, ru, pt, tr, ar (503 keys). RTL (he, ar) layout checked in the lobby.
- Online, two tabs through the public PeerJS broker: invite/accept/party, 1v1 duel (hits, kill, score, round 2 with swapped spawns), co-op duo (loot, bots as puppets, zone, guest damage to host bots, loot pickup sync, victory screen on both).

### Not verified / known limits
- Not tested on two real machines or on a phone (touch UI and gamepad were written but never exercised on hardware).
- Squad/trio with 3-4 real players untested; bikes and supply drops are not synced in co-op (see docs/ONLINE.md).
- Mouse pointer lock itself was not exercised (needs a real click on a visible window).
- Translations are AI-written, no native review.
- The preview pane does not run requestAnimationFrame while hidden: test by calling `Game.step(1/30)` in a loop (see QA recipe).

## QA recipe
In the page console (or the preview JS tool): `Game.start({mode:'br'}); Player.invuln = true; for (let i=0;i<7200 && G.state==='playing';i++) Game.step(1/30);` then check the console for `[game]` / `[bot]` errors. Same with `{mode:'duel'}` and `{mode:'tutorial'}` (call `Tutorial.skip()` to advance).

## Notes
- PowerShell: never use Get-Content/Set-Content on files with non-ASCII text; use [System.IO.File]::ReadAllText/WriteAllText with UTF8Encoding($false) or the editor tools.
- boot.js uses Date.now() cache busting on localhost and VERSION in production: bump VERSION per release.
- Language files: keys single-quoted (the checker parses them), values double-quoted.