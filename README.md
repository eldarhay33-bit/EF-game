# Last Squad Standing

A browser battle royale built with three.js (r158 from the jsdelivr import map). No build step.

**Modes:** Battle Royale (19 bots, shrinking storm, sea, mountains, tall grass hiding), 1v1 duel arenas, tutorial, online duo/trio/squad and online 1v1 with friends.
**Meta:** coins, points, levels, shop (skins, equipment, starter weapons, maps), daily/weekly missions, 100+ achievement tiers, ULTRA MAX skin and Top 100 board.
**Input:** keyboard + mouse (pointer lock with cursor-steering fallback), touch, Xbox / PlayStation gamepads.
**Languages:** English, Hebrew, Arabic (RTL), Spanish, French, German, Russian, Portuguese, Turkish.

## Run locally
Serve the folder with any static server and open it, for example:
```
powershell -File ..\_serve.ps1 -Root . -Port 8081
```
then http://localhost:8081/ . (Opening index.html straight from disk does not work: browsers block module scripts on `file://`.)

## Deploy
Drag the folder (or `dist/last-squad-standing-3.0.0.zip` unpacked) onto Netlify, or any static host. Bump `VERSION` in `src/boot.js` for every release (cache busting).

## Project layout
- `src/boot.js` loads the scripts in order (add new files to `SCRIPTS`)
- `src/core` utils, settings, i18n and `lang/*.js`, catalog, profile (economy, achievements)
- `src/engine` audio, textures, sky, terrain, models, fx
- `src/world` nature, structures, themes (maps), supply drops
- `src/entities` player, bots + AI, weapons, projectiles, vehicles, loot, zone, skins
- `src/modes` duel, tutorial
- `src/ui` hud, menu, shop, progress, social, input
- `src/net` online board and peer-to-peer play (see `docs/ONLINE.md`)
- `tools/i18n-check.ps1 -Lang he` lists translation keys that a language is missing

## Notes
- Progress is saved in the browser (`localStorage`). Clearing site data resets it.
- All translations were written by an AI assistant: a native review is welcome, especially Arabic, Turkish and Russian.
