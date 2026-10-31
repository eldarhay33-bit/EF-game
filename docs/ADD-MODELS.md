# Adding 3D models (GLB)

The world can load external `.glb` / `.gltf` models. You drop a file in `assets/models/`, add one entry to `assets/models.json`, and it appears in the game: instanced (fast), casting shadows, with collision, identical for every online player. Two hand-made examples (`lamp-post.glb`, `hay-bale.glb`) and 45 CC0 models by Kenney ship with the game (see "Bundled models" below).

## 1. Prepare the model
- Format: **GLB** (glTF Binary). In Blender: File -> Export -> glTF 2.0 -> Format "glTF Binary (.glb)", Include "Apply Modifiers", +Y Up.
- Units: 1 unit = 1 metre. A door is about 2 m high, a person about 1.8 m. Use `"scale"` in the manifest if the model is too big or small.
- Keep it light: a plain model should stay under ~5,000 triangles and ~500 KB with textures of 1024 px or smaller. Props that repeat (trees, crates) are drawn as instances, so one model can be placed hundreds of times. A more detailed model (7,000 to 20,000 triangles) is fine when it has level-of-detail files, see "Level of detail" below.
- World props are static: skeletons and animations are ignored there. Weapons and animated characters have their own paths, see "Guns" and "Characters" below.
- Compression (optional): Draco-compressed GLBs load automatically (decoder is fetched from Google's CDN on demand).

## 2. Add it to `assets/models.json`
```json
{
  "models": [
    {
      "id": "watchtower",
      "file": "models/watchtower.glb",
      "scale": 1,
      "mat": "wood",
      "collider": "auto",
      "walkable": false,
      "place": [ { "x": 60, "z": -40, "ry": 0.5 } ],
      "scatter": { "count": 10, "biomes": ["field"], "maxSlope": 0.15, "minRoadDist": 6, "scaleMin": 0.9, "scaleMax": 1.2, "seed": 3 },
      "lootTier": 2
    }
  ]
}
```
| field | meaning |
|---|---|
| `id`, `file` | name and path under `assets/` (required) |
| `scale`, `rotY`, `yOffset` | uniform scale, extra rotation (radians), lift above the ground |
| `origin` | default centres the footprint and puts the bottom on the ground; `"keep"` uses the model's own origin (the lamp post does, so its pole sits exactly at the placement point) |
| `place` | list of `{ x, z, ry, scale, y }`; the map is -220..220 on both axes, x east, z south |
| `scatter` | seeded random placement: `count`, `biomes` (`field`, `desert`, `mountain`), `maxSlope`, `minRoadDist`, `scaleMin/Max`, `seed`, `region {x,z,r}`. It never lands on water, roads or other structures, and is the same for all players |
| `collider` | `"auto"` (box or circle from the bounds), `"none"`, or `{ "type": "box"\|"circle", "w", "d", "h", "walkable", "k" }` in metres; `k` shrinks or grows the automatic size (0.85 for a round rock so nobody bumps into empty air) |
| `lod` | `[d1, d2]`: distances in metres where the simpler files `NAME_lod1.glb` / `NAME_lod2.glb` take over (see "Level of detail" below), or `"auto"` (distances from the model's size) |
| `far` | beyond this distance (metres) the model is not drawn at all (default: always drawn) |
| `parts` | list of node names of one file that are separate props (a rock set): each part becomes its own variant, like `variants` |
| `mat` | what bullets hit: `concrete`, `wood` or `metal` (impact effects and sounds) |
| `walkable` | players can stand on top of the box collider (rooftops, platforms) |
| `lootTier` | 0-3: adds a loot spot at each placement |
| `lootY` | height of the loot spot above the model's base (a chest: 0.4) |
| `variants` | list of files instead of `file`: the entry is repeated for each file and the scatter `count` / `place` list is shared out between them (one entry = a mix of 4 rocks) |
| `recolor` | `{ "materialName": "#rrggbb" }`: replaces colours by material name for this entry only |
| `castShadow`, `roughness`, `lit` | `castShadow: false` for tiny things such as flowers; `roughness` for converted flat materials (default 0.9); `lit: false` keeps an "unlit" export flat |
| `enabled` | `false` hides an entry without deleting it |

Top level of the manifest: `"palette": { "materialName": "#rrggbb" }` recolours every model that has a material with that name (an entry's own `recolor` wins), `"lodBias": 1` multiplies all level-of-detail distances (0.7 = switch to the simple versions sooner, for slower PCs). Flat "unlit" exports (Kenney) are converted to normal lit materials automatically, so they take sun, shadows and fog.

Debugging: in the browser console `Assets.info` lists the real size in metres of every entry (after `scale`) and its triangles per level, `Assets.loaded` / `Assets.failed` the ids; the props are groups named `asset:<id>` in `G.scene` (one instanced mesh per level inside).

## Level of detail (detailed models only where you can see the detail)
A scanned rock has 60,000+ triangles: fine for one, impossible for a hundred. So every detailed model comes as three files and the game draws each copy with the one that fits its distance to the camera (re-checked about twice a second, with a little hysteresis so nothing flickers):
1. `NAME.glb` close up: 7,000 to 18,000 triangles, textures inside the file
2. `NAME_lod1.glb` medium distance: 1,800 to 4,000 triangles, no textures (it borrows the first file's material by name)
3. `NAME_lod2.glb` far away: 450 to 900 triangles

Make them with the tool (needs nothing but PowerShell, it compiles `tools\LodTool.cs` on the fly; about a second per model):
```
powershell -File tools\make-lods.ps1 -In C:\downloads\boulder_01_1k.gltf -OutDir assets\models\ph -Name boulder_01 -Lod0 18000 -Lod1 4000 -Lod2 900
```
Options: `-Split` makes every top-level node of the file its own object (rock sets: then list the node names in `parts`), `-Lod0 0` keeps the original detail, `-Lod1 -1` skips a level, `-MaxErr` is the safety stop (a level may end up with more triangles than asked when a thin or open shell cannot be reduced cleanly, the log prints the worst error). It reads `.gltf` (with its `.bin` and textures) and `.glb`, bakes the node transforms, merges pieces that share a material, and keeps UV seams closed so the textures never tear.

Then add `"lod": [40, 100]` to the entry: LOD1 from 40 m, LOD2 from 100 m. Rule of thumb: LOD1 at about 20 times the model's size, LOD2 at about 55 times. Check the result in the game: walk toward a model and watch for popping; move the distances if you see it.

Then reload the game. A model that fails to load is skipped with a warning in the browser console (F12), it never stops the game.

## Bundled models
All CC0, downloaded on 2026-10-27 with the owner's approval; credits and authors in `assets/CREDITS.md`.
- **Poly Haven** (https://polyhaven.com, 1K textures, `assets/models/ph/`): ten photo-scanned models, each with three levels of detail: `boulder_01`, `namaqualand_boulder_03` (sandstone), `rock_moss_set_01` and `_02` (13 single mossy rocks), `rock_face_01` (cliff chunk), `tree_stump_01`, `Barrel_01` (explosive), `old_military_crate`, `wooden_crate_01`, `treasure_chest`. Downloads were 29.9 MB of source files (up to 100,000 triangles each); the game ships 24.6 MB because the meshes were reduced.
- **Quaternius** Ultimate Gun Pack (CC0, `assets/models/guns/`, nine guns) and the **Quaternius** Universal Base Characters + Universal Animation Library (CC0, `assets/models/q/`, two bodies and 43 shared clips, dressed in code): see "Guns" and "Characters" below and `assets/CREDITS.md`.
- **Kenney** (`assets/models/kenney/`): Nature Kit 2.1 (mushrooms, bushes, flowers, palms, cacti; teal and orange by design, so `models.json` has a `palette` that turns it into natural colours) and Survival Kit 2.0 (tent, campfire; needs `survival/Textures/colormap.png`). They are low-poly props for the small stuff that Poly Haven does not have.

Where they are in the game: rocks, stumps and mossy boulders scattered over the fields (sandstone in the desert, cliff chunks near the mountain), barrels, crates and 8 loot chests scattered around, four fixed camps (olive tents, fire, military crates, barrel, wooden crate and a loot chest) at the places listed in the `place` arrays. All of it is seeded, so every online player sees the same world. More from Poly Haven: pick a model, download the 1K glTF, run `tools\make-lods.ps1`, add an entry. Their trees are far too heavy for a browser game (60 MB to 900 MB of geometry each), their rocks, crates, barrels and stumps are fine.

## 3. Where to get models
CC0 (free for any use): Kenney.nl, Quaternius.com. Poly Pizza and Sketchfab mix licences: check each model and keep the credit if it asks for one (CC-BY). Always keep a note of where each file came from.

## Guns (modelled weapons)
Nine guns use real models (Quaternius Ultimate Gun Pack, CC0, `assets/models/guns/*.glb`, 40 to 125 KB each); the minigun, the RPG and the Phantom-X are built from parts (rounded boxes, lathe shapes, rings; much more detailed since 4.4.0, `GM.assemble` in `src/engine/models.js`; no good CC0 model of them exists). A modelled gun replaces only the body: sights, muzzle flash, magazine and shell ejection come from the tables in `src/engine/models.js`, so every attachment still works. The model is turned and scaled to the size of the procedural gun it replaces (`GM.prepGlb`), so a new file needs no manual measuring.
1. Convert the gun: OBJ + MTL to GLB with `powershell -File tools\obj2glb.ps1 -In C:\downloads\Gun.obj -OutDir assets\models\guns` (a whole folder works too; a GLB needs no conversion). The pack's guns point their barrel towards +X with +Y up and `GM.prepGlb` turns them to the game's -Z; a gun from another source with different axes needs its own turn there.
2. Map it in `GM.glbCfg` (`src/engine/models.js`): `ar: { f: 'AssaultRifle2_1' }`; add `scoped: true` for a gun that has its own scope built in (the sniper and the DMR).
3. Colours: the pack's colours are dark, `GM.glbBoost` (2.2) brightens plain materials, metal is calmed down (metalness 0.25) so it does not turn sky-blue under the sky reflection.
A file that is missing or broken is skipped with a console warning and the procedural gun stays.

## Characters (skeletons and animations)
Every skin is a skeletal character: one of two Quaternius bodies (male / female, CC0, `assets/models/q/`) dressed in code. `src/entities/qrig.js` (class `QRig`) answers to exactly the same calls as the old procedural character (`root`, `update(dt, state)`, `setGun`, `setShadows`, `gun`, `hips`, `camK`), so the lobby, the player, the bots, the tutorial and the online players use it without changes. If the files or the animations fail to load, `Character.build` falls back to the procedural soldier.
- What a skin is: an entry of `SKINS` in `src/entities/skins.js` with a `q` block: `g` ('m' or 'f' body), `tone` (light / mid / dark), `hair` (hair files of `models/q/hair`) and `hc` (hair colour), `suit` (colours per body part, pattern `pat` such as stripe or camo, `glow` and `lines` for light lines, `metal` / `rough`), `gear` (a list such as `helmet`, `goggles`, `vest`, `pack`, `knees`, `boots:sneaker`, built by `src/entities/suit.js`) and `gc` (gear colours). The name of the skin goes in all nine `src/core/lang/*.js` files (`skin.<id>`). `SKIN_ROSTER` in `src/core/profile.js` must be raised when skins are removed or renamed (players get the price back in coins).
- The legs, body and head are animated by clips of the Universal Animation Library (`models/q/anim.glb`): idle, walk, jog, sprint, crouch idle and walk, jump, swim, death and driving, blended by ground speed; the legs turn towards the movement direction relative to the look direction (`Character.moveDir`), so walking backwards and strafing look right.
- The gun is carried by the chest bone and both arms are solved with two-bone IK onto the grip and the foregrip (`Character.q.hold` says where each kind of gun sits and where the hands are), so every weapon sits in the hands (low-ready, sprint carry, aim, reload with the other hand on the magazine, recoil, parachute, bike with both hands on the bars); the fingers curl around the grip.
- Looking up and down bends the spine and head, the gun lifts the rest of the way.
- Far away characters are animated less often; the skinned parts of a body are merged into one draw call.
- Rebuilding the files: `powershell -File tools\make-chars.ps1 -Src <folder with the two unpacked packs> -Dst assets\models\q`. Phones load the 512 px textures (`models/q/tex/s`).
- Pitfalls that cost time (do not undo them): glTF materials come with `vertexColors = true` and render black when merged without a colour attribute; merged geometries need identical attributes; the mixer writes a bone only when its animated value changes, so bones that code bends afterwards are put back to the mixer's pose before every bend (`TWEAK` list, otherwise the bend piles up); the bones' own axes are not aligned with the model, so every bend is a rotation in model space (`turn`); the animation weights must always add up to 1.
## Bikes (modelled motorcycles)
The four bikes (scooter, sport, raider, hyper) are built from parts in `src/entities/vehicles.js` unless a model is named in `assets/models/bikes/bikes.json` (it ships empty). Put the .glb next to it and add an entry:
```json
{ "sport": { "file": "my-bike.glb", "length": 2.0, "yaw": 0, "seat": [0, 0.8, 0.15] } }
```
- The model stands on the ground with its front towards -z and y up (`yaw` turns it, `length` in metres or `scale` sizes it).
- Nodes called `wheel_f` / `wheel_r` / `fork` (or "front wheel", "rear wheel", "handlebar", "steer") are found by name: the wheels turn about their centres, the fork turns about the steering head and carries the front wheel. A model without such nodes works too and is simply rigid.
- `seat` is where the rider sits, in metres after scaling (default: 62 % of the height, a little behind the middle). A file that is missing or broken is skipped with a console warning and the built-in bike stays.
- Please keep the model at a few thousand triangles: up to 40 bikes stand in the world.

## Trees
High and Ultra show modelled trees (`src/world/trees.js`, `assets/models/mk/`, the Stylized Nature MegaKit by Quaternius, CC0), Low, Medium and phones the cheap card trees of `src/world/nature.js`. To change the trees: `powershell -File tools\make-trees.ps1 -Zip <the pack's zip>` shows what is extracted and converted (the big PNGs become 1024 px JPEG / PNG), `Trees.FILES` lists the files per species (`pine`, `oak`); the positions come from `Nature.build`. Three levels of detail are made at load time from each model, nothing to prepare. Photographs of the ground have normal maps next to them (`assets/tex/NAME_n.jpg`).

## Not supported yet
A character that is not made for the Quaternius (UE-style, 65 bone) skeleton.

## עברית - בקצרה
1. מכינים מודל בפורמט GLB (ב-Blender: Export ← glTF Binary), במטרים, עד כמה אלפי משולשים.
2. שמים את הקובץ ב-`assets/models/`.
3. מוסיפים בלוק ל-`assets/models.json` (דוגמה למעלה): `place` למיקומים מדויקים או `scatter` לפיזור אקראי קבוע.
4. טוענים מחדש את המשחק. התנגשות, צללים והצגה לכל השחקנים כבר מטופלים.
5. אפשר לתת כמה קבצים לאותה רשומה עם `variants` (למשל 4 סוגי סלעים), ולצבוע מחדש לפי שם חומר עם `palette` או `recolor`.
6. כלולים כבר דגמים חופשיים (CC0): עשרה דגמי Poly Haven באיכות גבוהה (סלעים, גדם, חבית, ארגזים, תיבת אוצר) וכמה דגמים פשוטים של Kenney. הקרדיטים ב-`assets/CREDITS.md`.
7. דגם כבד (עשרות אלפי משולשים) צריך שלוש רמות פירוט: מפורט קרוב, פשוט יותר באמצע, פשוט מאוד רחוק. הכלי `tools\make-lods.ps1` יוצר אותן אוטומטית (שנייה אחת לדגם), ואז מוסיפים לרשומה `"lod": [40, 100]` (מרחקים במטרים). המשחק בוחר לכל עותק את הרמה לפי המרחק שלו מהמצלמה.
8. תשעה נשקים הם דגמים אמיתיים (Quaternius, CC0, בתיקייה `assets/models/guns`): ממירים OBJ ל-GLB עם `tools\obj2glb.ps1` ומוסיפים שורה ב-`GM.glbCfg` בקובץ `src/engine/models.js`. כוונת, להבת ירי ומחסנית עדיין נבנים בקוד.
9. כל הסקינים הם דמויות עם שלד ואנימציות (Quaternius, CC0, בתיקייה `assets/models/q`): שני גופים (גבר ואישה) שמולבשים בקוד עם צבעים, דוגמאות וציוד (`src/entities/skins.js`, `src/entities/suit.js`). הרובה נשען על החזה והידיים מכוונות אליו (IK). אם הקבצים לא נטענים חוזרת הדמות הישנה.