# Renaming the game / changing the logo

Everything that carries the game's name lives in ONE file: `src/core/brand.js`.

1. **Edit `BRAND`** in that file: the name, the short name (home-screen label), the words of the lobby wordmark, the description and share texts, the colour and the picture paths. Keep it valid JSON (the tool reads it as data).
2. **Put the new pictures** where `logo`, `emblem`, `ogImage` and `icons` point:
   - `assets/brand/logo.svg`: the wide logo (loading screen, rotate screen, Settings > About).
   - `assets/brand/emblem.svg`: the square crest (top left of the lobby, an install icon).
   - `assets/brand/og-image.png`: the 1200 x 630 picture that chat apps show for a link.
   - `assets/icons/`: `favicon-32.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (keep the picture inside the middle 80 %, phones crop the rest), `apple-touch-icon.png` (180 x 180).
   The current ones are drawn by `tools/make-logo.ps1` (the lettering is made of paths, no font needed). For a picture sent by the owner, every size can be made from one PNG with the headless Edge that `make-logo.ps1` already uses.
3. **Run** `powershell -File tools\apply-brand.ps1`. It rewrites the files that cannot read `brand.js`: `index.html` (title, description, share texts, icons, the two logo pictures between the `<!--brand:head-->` markers), `manifest.webmanifest` and the list of kept files in `sw.js`. `tools\release.ps1` runs it by itself, and `apply-brand.ps1 -Check` only reports a mismatch.
4. The credit line ("Created by DCeator", key `ui.credit` in the nine files of `src/core/lang`) is separate: keep the exact spelling.

**Never rename** the `lss-` prefix of the data stored in the browser (profile, settings, board cache, install banner) and of the online ids (`src/net/p2p.js`): a different prefix wipes every saved profile and splits online rooms between versions. It is an internal id, players never see it.

The version number is not part of the brand and is never shown (see `docs/DEPLOY-AND-UPDATES.md`).
