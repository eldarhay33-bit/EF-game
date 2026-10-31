<p align="center"><img src="assets/brand/logo.png" alt="Last Squad Standing" width="520"></p>

# Last Squad Standing

**Created by DCeator.** A browser battle royale built with three.js (r158 from the jsdelivr import map). No build step. Installs as an app on computers and phones and updates itself (see `docs/DEPLOY-AND-UPDATES.md`).

**Modes:** Battle Royale (19 bots, shrinking storm, sea, mountains, tall grass hiding), 1v1 duel arenas, tutorial (16 steps, phone and computer), online battle royale and online 1v1 against real players of your level (bots fill the empty places and the game says so), duo / trio / squad and 1v1 with friends.
**Opponents:** there is no difficulty picker: your level (win rate, eliminations, points, play time, the last matches) decides how good the bots are, what equipment they wear and who you meet online.
**Meta:** coins, points, levels, shop (19 realistic skins, five tiers of helmet / vest / pack / boots / gloves that are worn on the character and protect by tier, starter weapons, maps), daily/weekly missions, 100+ achievement tiers, ULTRA MAX skin and Top 100 board.
**Vehicles:** four bikes that cannot hurt their rider, with flips and barrel rolls (hold jump in the air, then S / W / A / D), trick callouts and missions. **Rare find:** the Phantom-X (1 in 10,000, with a test option in the settings).
**Input:** keyboard + mouse (pointer lock with cursor-steering fallback), touch, Xbox / PlayStation gamepads.
**Graphics (High and Ultra):** photographic ground, buildings, roofs and planks (Poly Haven CC0), a 3D blade-grass carpet around the player, photographic HDRI skies, character portraits in the shop; the game steps the quality down by itself when the frame rate drops.
**Phones:** a light graphics profile, a rotate-your-phone screen, full screen and an installable web app (PWA: Add to Home Screen / Install). A native APK or iOS app is not built from this code.
**Languages:** English, Hebrew, Arabic (RTL), Spanish, French, German, Russian, Portuguese, Turkish.

## Run locally
Serve the folder with any static server and open it, for example:
```
powershell -File ..\_serve.ps1 -Root . -Port 8081
```
then http://localhost:8081/ . (Opening index.html straight from disk does not work: browsers block module scripts on `file://`.)

## Deploy and release
Drag the folder (or `dist/last-squad-standing-<version>.zip` unpacked) onto Netlify, or any static host (HTTPS is needed for the installable app and the service worker). To make a release run `powershell -File tools\release.ps1 -Version 4.3.0 -Zip`: it puts the new number into `src/boot.js`, `sw.js` and `version.json` (installed copies update themselves when it changes) and builds the zip. Details: `docs/DEPLOY-AND-UPDATES.md`.

## Project layout
- `src/boot.js` loads the scripts in order (add new files to `SCRIPTS`)
- `src/core` utils, `brand.js` (the name, logo and texts: the ONE place to rename the game, see `docs/REBRAND.md`), settings (and `Device`), i18n and `lang/*.js`, catalog, profile (economy, achievements), `skill.js` (the player's level and what follows from it), `updater.js` (finds and loads new versions)
- `src/engine` audio, textures, sky, terrain, models, fx
- `src/world` nature, structures, themes (maps), supply drops, `grass3d.js` (the blade carpet)
- `src/entities` player, bots + AI, weapons, projectiles, vehicles, loot, zone, skins (`skins.js` roster, `qrig.js` skeletal character, `suit.js` suit shader and gear, `gear.js` the five tiers of shop equipment worn on the body)
- `src/modes` duel, tutorial
- `src/ui` hud, menu, shop, progress, social, input, `thumbs.js` (skin portraits)
- `src/net` online board, peer-to-peer play and the search for online matches (`p2p.js`, `matchmaking.js`; see `docs/ONLINE.md`)
- `server/` the lobby server that puts online players together (`matchmaker.js` the logic, `worker.js` + `wrangler.toml` for Cloudflare's free plan, `dev-lobby.html` to test it without a server; setup in `server/README.md` and `docs/ONLINE-SETUP-HE.md`, design in `docs/ONLINE-PLAN.md`); `online-config.json` holds its address (empty = online matches are against bots)
- `tools/i18n-check.ps1 -Lang he` lists translation keys that a language is missing
- `tools/make-lods.ps1` makes the detailed / medium / far versions of a 3D model (see `docs/ADD-MODELS.md`)
- `tools/obj2glb.ps1` converts OBJ models (such as the free Quaternius packs) to GLB, `tools/prune-glb.ps1` keeps only the animations / meshes you need of a GLB
- `tools/apply-brand.ps1` copies the name / logo paths from `src/core/brand.js` into `index.html`, the manifest and `sw.js`
- `tools/release.ps1` makes a release (version number everywhere + zip; the number is never shown to players), `tools/make-logo.ps1` draws the logo and renders the app icons / link picture (`assets/brand`, `assets/icons`), `tools/test-update.ps1` tests the self-update with a real Edge
- `tools/make-chars.ps1` builds `assets/models/q` (the characters) from the two Quaternius packs; `tools/unused-tex/` holds downloaded textures that the game does not use yet (not part of the package)

## 3D models
Add your own .glb props: see `docs/ADD-MODELS.md` (`assets/models.json`). Ten photo-scanned CC0 models from Poly Haven (rocks, stump, barrel, crates, treasure chest, each with three levels of detail that switch by distance) plus a few Kenney props are already in the world; credits in `assets/CREDITS.md`. `tools/make-lods.ps1` makes the levels of detail for any model you add.

Nine guns are real models (Quaternius, CC0). Every skin is an animated character (Quaternius Universal Base Characters + Universal Animation Library, CC0, dressed in code with a suit shader and gear) that carries the gun with both hands on it; if their files do not load the old procedural gun and soldier are used. The ground, sky and rocks use Poly Haven CC0 photographs and scans (the ground photographs only on High / Ultra). See "Guns" and "Characters" in `docs/ADD-MODELS.md`.

## Global leaderboard
See `docs/GLOBAL-BOARD.md` (free Firebase database, five minutes, fill in `board-config.json`).

## Notes
- Progress is saved in the browser (`localStorage`). Clearing site data resets it.
- All translations were written by an AI assistant: a native review is welcome, especially Arabic, Turkish and Russian.
