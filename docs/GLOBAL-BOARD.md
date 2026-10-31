# Global leaderboard (ULTRA MAX Top 100)

The game already contains the whole client: it reads the top 100, writes your score after every match and refreshes the table every 30 seconds.
What it needs is ONE shared database. It is free and takes about five minutes. After that every player sees the same table, with nothing to configure.

## Setup (Firebase, free Spark plan)
1. Go to https://console.firebase.google.com and create a project (Analytics can be off).
2. Build -> Realtime Database -> Create database. Pick a location, start in locked mode.
3. Copy the database URL shown at the top (looks like `https://NAME-default-rtdb.firebaseio.com`).
4. Rules tab: paste the contents of `docs/firebase-rules.json` and Publish.
   (If you do not want sign-in, use `docs/firebase-rules-open.json` instead: simpler, but anyone can overwrite any entry.)
5. Recommended (signed rules): Build -> Authentication -> Sign-in method -> enable **Anonymous**.
   Project settings (gear) -> General -> copy the **Web API key**.
6. Open `board-config.json` (next to `index.html`) and fill the two values:
   ```json
   { "url": "https://NAME-default-rtdb.firebaseio.com", "apiKey": "AIza..." }
   ```
   Leave `apiKey` empty if you chose the open rules. (Regions outside the US use `https://NAME-default-rtdb.REGION.firebasedatabase.app`.)
7. Bump `VERSION` in `src/boot.js`, re-deploy. Done.

Players can still override the URL in Friends -> "Online server" (handy for testing with a second database).

## How it works
- Entries live under `/leaderboard/<key>` as `{ name, points, lvl, ts }`. With sign-in the key is the anonymous Firebase user id, and the rules only let that user write that key.
- The table is fetched with `orderBy="points"&limitToLast=100`, which needs the `.indexOn` rule (included). Without it the client falls back to downloading everything.
- Only players wearing the ULTRA MAX skin can submit. If the database cannot be reached the last good copy is shown ("last saved copy").

## Limits
- Points are calculated on the player's device, so a determined cheater can send any number up to the rule limit (100 million). Rules stop malformed data, other people's entries and absurd values, but not a modified client. For a competitive ladder you would need a server that replays or verifies matches.
- The API key is public by design (it only identifies the Firebase project); security comes from the rules.
- Free-plan limits (1 GB stored, 10 GB/month download) are far above what a 100-row table needs.

## עברית - בקצרה
1. נכנסים ל-console.firebase.google.com ויוצרים פרויקט חינמי.
2. Realtime Database -> Create database -> מעתיקים את הכתובת.
3. בלשונית Rules מדביקים את `docs/firebase-rules.json` ולוחצים Publish.
4. Authentication -> Sign-in method -> מפעילים Anonymous, ומעתיקים את ה-Web API key מהגדרות הפרויקט.
5. פותחים את `board-config.json` (ליד index.html), ממלאים `url` ו-`apiKey` ומעלים מחדש. אין צורך לגעת בקוד.
מאותו רגע כל השחקנים רואים את אותה טבלה, והיא מתעדכנת אוטומטית.