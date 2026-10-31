# Putting the game online, installing it, and updates that arrive by themselves

Last Squad Standing is a web app (PWA): the same files run in a browser tab and, after "install", as an app with its own icon on a computer, an Android phone / tablet or an iPhone / iPad.
Nothing is published until the owner decides to (the project's rule: never deploy or upload without asking).

## 1. Hosting (once)
Any static host over HTTPS works (the browser only allows installing and the service worker on HTTPS or localhost).
- **Netlify drag and drop**: unpack `dist/last-squad-standing-<version>.zip` (or take the project folder) and drop the folder on https://app.netlify.com/drop . The files `_headers` (and `netlify.toml` for Git deploys) set the cache rules that updates need.
- **GitHub + Netlify (recommended for automatic publishing)**: put the folder in a GitHub repository, in Netlify choose "Import from Git", publish directory `.`, no build command. From then on every `git push` publishes by itself.
- **GitHub Pages** also works (Settings > Pages > the branch). It cannot set the headers, the game copes with that (the service worker asks the server again for the files that matter).
After the first publish, open the site once and set the real address in `index.html`'s `og:image` / `twitter:image` (they need an absolute URL for link previews), e.g. `https://yourname.netlify.app/assets/brand/og-image.png`.

## 2. Installing
- **Computer (Chrome / Edge)**: the install icon appears in the address bar, and the game's own button (the arrow in the lobby's top bar, or Settings > About > Install the app) opens the same dialog. The first visit also shows a banner once.
- **Android (Chrome)**: the same banner / button ("Install the app"), or the browser menu > "Install app".
- **iPhone / iPad (Safari)**: Apple gives no install dialog: tap Share, then "Add to Home Screen". The game's button shows these steps.
An installed copy opens full screen, works without a connection after the first visit and has its own icon (the crest, `assets/icons`).

## 3. Updates
Every installed copy (and every browser tab) finds out about a new version by itself:
1. the page asks the server for `version.json` (a few bytes, never cached) a few seconds after it starts, every 20 minutes, when the player comes back to the app and when the connection returns;
2. the browser also re-reads `sw.js` whenever the app is opened; a changed `sw.js` replaces the service worker at once;
3. as soon as the lobby is on screen the game shows "A new update is ready - updating..." and reloads. It never interrupts a match: it waits for the lobby. (Since 4.3.0 the version number is not shown anywhere: not in the title, the loading screen, the lobby, Settings > About or this message; it only drives the updates.)
Settings > About has a "Check for updates" button for the impatient.

### How to make a release (this is what makes the update reach everybody)
```
powershell -File tools\release.ps1 -Version 4.3.0 -Zip
```
It first runs `tools\apply-brand.ps1` (the name and logo files of `src/core/brand.js` into `index.html`, the manifest and `sw.js`), then writes the number into `src/boot.js`, `sw.js` and `version.json` (the same number everywhere, otherwise the update is not noticed), works out the **assets code** (a short hash of the models / textures / skies: it changes only when one of those files does, so players do not download 60 MB again for a small update) and builds `dist/last-squad-standing-4.3.0.zip`. Then publish the folder (drag it to Netlify, or `git push`).
Never publish changed files with the old number: installed copies would keep what they have.

## 4. What is cached where
| files | strategy |
|---|---|
| `index.html`, `src/*`, `css/*`, `manifest.webmanifest`, `assets/brand`, `assets/icons` | network first (always fresh when online), a copy is kept for offline |
| `assets/models`, `assets/sky`, `assets/tex`, `assets/models.json`, three.js from the CDN | cache first, kept in `lss-assets-<assets code>`, replaced only when that code changes |
| `version.json` | never cached |

## 4b. Online matches (optional second piece)
The game itself is static files. Online battle royale / 1v1 with strangers also needs the small lobby server of `server/` (Cloudflare, free): `docs/ONLINE-SETUP-HE.md` (steps, Hebrew), `server/README.md`, `docs/ONLINE-PLAN.md`. Its address goes into `online-config.json`; with the file empty the game works and "Find match" plays against bots.

## 5. Language and credit
English is the default language of the game (a new player always starts in English, whatever the browser's language is; the choice is saved in Settings). "Created by DCeator" (translated in all nine languages, key `ui.credit`) is on the loading screen, at the bottom of the lobby, in Settings > About, on the pause menu and on the "rotate your phone" screen; `<meta name="author">`, the link preview picture and the README carry it too.

---
## בעברית, בקצרה
1. **להעלות לרשת (פעם אחת):** גוררים את התיקייה (או את קובץ ה-zip אחרי שמפרקים אותו) ל-https://app.netlify.com/drop , או מחברים תיקיית GitHub ל-Netlify כדי שכל `git push` יפרסם לבד. בלי העלאה לאתר HTTPS אי אפשר להתקין כאפליקציה.
2. **התקנה:** במחשב (Chrome / Edge) יש אייקון התקנה בשורת הכתובת וגם כפתור במשחק (החץ למטה בתפריט, או הגדרות ← אודות). באנדרואיד: באנר "התקן את המשחק כאפליקציה". באייפון: שיתוף ← "הוסף למסך הבית".
3. **עדכונים אוטומטיים:** בכל פעם שמעלים גרסה חדשה לשרת, כל מי שהתקין (וגם מי שפותח בדפדפן) מקבל אותה לבד: המשחק בודק מול `version.json`, וברגע שהלובי על המסך הוא נטען מחדש לגרסה החדשה. אף פעם לא באמצע משחק.
4. **איך מוציאים גרסה:** `powershell -File tools\release.ps1 -Version 4.3.0 -Zip` — זה מעדכן את המספר בכל המקומות ובונה zip. חשוב: כל גרסה חדשה חייבת מספר חדש, אחרת העדכון לא יתפוס.
