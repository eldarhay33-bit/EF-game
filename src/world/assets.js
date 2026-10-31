// External 3D models (GLB / glTF). Drop a file into assets/models/, add one entry to assets/models.json and it shows up in the world:
// instanced for speed, casting shadows, with automatic collision. See docs/ADD-MODELS.md for the full guide and the entry format.
// Detailed props can carry level-of-detail files (made with tools/make-lods.ps1): the full model is drawn close to the camera, simpler copies farther away.
// Everything is deterministic (seeded placement) so all players in an online match see the same props.
const Assets = {
  loaded: [], failed: [], info: {}, palette: {}, lodSets: [], lodBias: 1,

  async build(scene, onProgress) {
    let man;
    try { const r = await fetch('assets/models.json?v=' + (window.ASSET_VER || 0), { cache: 'no-store' }); if (!r.ok) return; man = await r.json(); } catch (e) { return; }
    this.palette = (man && man.palette) || {};
    this.lodBias = +(man && man.lodBias) > 0 ? +man.lodBias : 1;
    const defs = this.expand((man && man.models) || []);
    if (!defs.length) return;
    let loader;
    try {
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js')]);
      loader = new GLTFLoader(); const dr = new DRACOLoader(); dr.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/'); loader.setDRACOLoader(dr);
    } catch (e) { console.warn('[assets] loader unavailable', e); return; }
    if (typeof GM !== 'undefined' && GM.preload) await GM.preload(loader);          // modelled guns (falls back to the procedural ones when a file is missing)
    if (typeof Vehicles !== 'undefined' && Vehicles.preload) await Vehicles.preload(loader);          // modelled bikes, when assets/models/bikes/bikes.json names any
    if (typeof Character !== 'undefined' && Character.preload) await Character.preload(loader);          // skeletal characters (same fallback)
    // every file is fetched once, even when several entries share it (rock sets, level-of-detail files)
    const wanted = new Set(); for (const d of defs) { wanted.add(d.file); for (const f of this.lodFiles(d)) wanted.add(f); }
    const files = new Map(); let done = 0;
    const load = f => {
      if (!files.has(f)) files.set(f, loader.loadAsync('assets/' + f + '?v=' + (window.ASSET_VER || 0)).then(g => g, err => { console.warn('[assets] could not load', f, err && err.message); return null; }).then(g => { done++; if (onProgress) onProgress(done, wanted.size); return g; }));
      return files.get(f);
    };
    const results = await Promise.all(defs.map(async def => {
      const g = await load(def.file);
      if (!g) { this.failed.push(def.id); return null; }
      return { def, g, lods: await Promise.all(this.lodFiles(def).map(load)) };
    }));
    for (const r of results) { if (!r) continue; try { this.place(scene, r.def, r.g, r.lods); this.loaded.push(r.def.id); } catch (e) { this.failed.push(r.def.id); console.warn('[assets] could not place', r.def.id, e); } }
    if (this.lodSets.length) { World.updaters.push(dt => this.update(dt)); this.update(0, true); }
  },

  // "variants": [file, file, ...] or "parts": [node name, ...] (several props inside one file) turn one entry into several with the same settings:
  // the scatter count and the "place" list are shared out between them
  expand(models) {
    const out = [];
    for (const m of models) {
      if (!m || m.enabled === false || !m.id) continue;
      const list = Array.isArray(m.variants) && m.variants.length ? m.variants.map(f => ({ file: f })) : Array.isArray(m.parts) && m.parts.length && m.file ? m.parts.map(p => ({ file: m.file, part: p })) : null;
      if (list) {
        const n = list.length;
        list.forEach((v, i) => {
          const d = Object.assign({}, m, { id: m.id + '-' + i }, v); delete d.variants; delete d.parts;
          d.place = (m.place || []).filter((_, k) => k % n === i);
          if (m.scatter) { const c = Math.floor(m.scatter.count / n) + (i < m.scatter.count % n ? 1 : 0); if (c > 0) d.scatter = Object.assign({}, m.scatter, { count: c, seed: (m.scatter.seed || 1) * 31 + i }); else delete d.scatter; }
          out.push(d);
        });
      } else if (m.file) out.push(m);
    }
    return out;
  },

  // level-of-detail files sit next to the model: NAME.glb -> NAME_lod1.glb, NAME_lod2.glb ("lod": [distance1, distance2] in metres, or "auto")
  lodFiles(def) {
    if (!def.lod) return [];
    const base = def.file.replace(/\.(glb|gltf)$/i, ''), n = Array.isArray(def.lod) ? def.lod.length : 2;
    return Array.from({ length: n }, (_, i) => base + '_lod' + (i + 1) + '.glb');
  },
  lodDist(def, foot) {
    const size = Math.max(foot.w, foot.d, foot.h);
    const d = Array.isArray(def.lod) ? def.lod : [size * 18 + 6, size * 45 + 20];
    return d.map(v => v * this.lodBias);
  },

  // Flat "unlit" exports (Kenney packs) become normal lit materials so they take sun, shadows and fog like every other prop.
  // Colours can be replaced by material name: the manifest's top-level "palette" applies to every model, an entry's own "recolor" wins over it (CSS colours).
  lit(mat, def) {
    this._lit = this._lit || new Map();
    const conv = m => {
      if (!m) return m;
      const hex = (def.recolor && def.recolor[m.name]) || this.palette[m.name], basic = m.isMeshBasicMaterial && def.lit !== false;
      if (!basic && !hex) return m;
      if (!this._lit.has(m)) {
        const r = basic ? new THREE.MeshStandardMaterial({ name: m.name, color: m.color, map: m.map, vertexColors: m.vertexColors, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, roughness: def.roughness !== undefined ? def.roughness : 0.9, metalness: 0 }) : m.clone();
        if (hex) r.color.set(hex);
        this._lit.set(m, r);
      }
      return this._lit.get(m);
    };
    return Array.isArray(mat) ? mat.map(conv) : conv(mat);
  },

  // sharper textures at grazing angles and the same environment light as the other props
  tune(mt, def) {
    for (const m of [].concat(mt)) {
      if (!m) continue;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) { const t = m[key]; if (t && !t.userData.tuned) { t.anisotropy = Math.max(1, Math.min(8, Tex.aniso || 1)); t.userData.tuned = true; } }
      if (m.envMapIntensity !== undefined) m.envMapIntensity = def.envMapIntensity || 0.8;
    }
  },

  partRoot(g, def) { return (def.part && g.scene.getObjectByName(def.part)) || g.scene; },
  meshesOf(root) { const out = []; root.traverse(o => { if (o.isMesh) out.push(o); }); return out; },

  // ground points for one entry: explicit "place" list plus a seeded "scatter"
  points(def, foot) {
    const out = [];
    for (const p of def.place || []) out.push({ x: p.x, z: p.z, y: p.y, ry: p.ry || 0, s: p.scale || 1 });
    const sc = def.scatter; if (!sc) return out;
    let h = 2166136261; for (const ch of def.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rng = mulberry32((sc.seed || 1) * 7919 + (h >>> 0)), reg = sc.region || { x: 0, z: 0, r: MAP.half - 14 }, biomes = sc.biomes || ['field'], r0 = Math.max(foot.w, foot.d) / 2;
    let n = 0;
    for (let tries = 0; tries < (sc.count || 10) * 60 && n < (sc.count || 10); tries++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * reg.r, x = reg.x + Math.cos(a) * d, z = reg.z + Math.sin(a) * d, s = lerp(sc.scaleMin || 1, sc.scaleMax || 1, rng()), ry = rng() * Math.PI * 2;
      if (Math.abs(x) > MAP.half - 14 || Math.abs(z) > MAP.half - 14) continue;
      if (!biomes.includes(biomeAt(x, z)) || waterDepth(x, z) > 0.05 || slopeAt(x, z) > (sc.maxSlope !== undefined ? sc.maxSlope : 0.15)) continue;
      if (distToRoad(x, z) < (sc.minRoadDist !== undefined ? sc.minRoadDist : 4) || inExcl(x, z, r0 * s)) continue;
      if (sc.avoidStructures !== false && Grid.query(x - r0 * s - 0.5, z - r0 * s - 0.5, x + r0 * s + 0.5, z + r0 * s + 0.5).length) continue;
      out.push({ x, z, ry, s }); n++;
    }
    return out;
  },

  place(scene, def, gltf, lodGltfs) {
    const root = this.partRoot(gltf, def); root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const k = def.scale || 1, base = new THREE.Matrix4();
    if (def.origin === 'keep') base.identity(); else base.makeTranslation(-ctr.x, -box.min.y, -ctr.z);          // default: model stands on the ground with its footprint centred
    const foot = { w: size.x * k, d: size.z * k, h: size.y * k }; this.info[def.id] = { w: +foot.w.toFixed(2), d: +foot.d.toFixed(2), h: +foot.h.toFixed(2) };
    const pts = this.points(def, foot); if (!pts.length) return;
    const P = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3(), E = new THREE.Euler(), mats = [];
    for (const p of pts) {
      const gy = (p.y !== undefined ? p.y : terrainHeight(p.x, p.z)) + (def.yOffset || 0), sc = p.s * k;
      P.compose(V.set(p.x, gy, p.z), Q.setFromEuler(E.set(0, p.ry + (def.rotY || 0), 0)), Sc.set(sc, sc, sc)).multiply(base); mats.push(P.clone());
    }
    const lodRoots = (lodGltfs || []).map(g => g ? this.partRoot(g, def) : null);
    if (lodRoots.some(Boolean)) this.placeLod(scene, def, root, lodRoots, pts, mats, foot);
    else this.meshesOf(root).forEach(o => {
      const mt = this.lit(o.material, def), im = new THREE.InstancedMesh(o.geometry, mt, pts.length), M = new THREE.Matrix4();
      pts.forEach((p, i) => { M.copy(mats[i]).multiply(o.matrixWorld); im.setMatrixAt(i, M); });
      im.name = 'asset:' + def.id; im.instanceMatrix.needsUpdate = true; im.castShadow = def.castShadow !== false; im.receiveShadow = true; im.computeBoundingSphere();
      this.tune(mt, def); scene.add(im);
    });
    // collision: "auto" derives a box / circle from the model's bounds, or give { type, w, d, h, walkable, k } yourself, or "none" (k shrinks or grows the auto size, handy for round rocks)
    const col = def.collider === undefined ? 'auto' : def.collider, spec = typeof col === 'object' ? col : {}, mat = def.mat || 'concrete', kk = spec.k || 1;
    pts.forEach(p => {
      const gy = (p.y !== undefined ? p.y : terrainHeight(p.x, p.z)) + (def.yOffset || 0);
      if (def.lootTier !== undefined) World.lootSpots.push({ x: p.x, z: p.z, y: gy + (def.lootY || 0), tier: def.lootTier });
      if (col === 'none') return;
      const cw = (spec.w !== undefined ? spec.w : size.x * k * kk) * p.s, cd = (spec.d !== undefined ? spec.d : size.z * k * kk) * p.s, ch = (spec.h !== undefined ? spec.h : size.y * k) * p.s;
      const ry = p.ry + (def.rotY || 0), c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)), bw = cw * c + cd * s, bd = cw * s + cd * c, big = Math.max(bw, bd), small = Math.min(bw, bd);
      const type = spec.type || (big < 2 && big / Math.max(0.01, small) < 1.35 || small < 0.4 ? 'circle' : 'box');          // small round or thin things (barrels, poles) get a circle
      if (type === 'circle') addCollider({ type: 'circle', x: p.x, z: p.z, r: Math.max(0.18, (small < 0.4 ? big : (bw + bd) / 2) / 2), bottom: gy, top: gy + ch, mat });
      else addCollider({ type: 'box', minX: p.x - bw / 2, maxX: p.x + bw / 2, minZ: p.z - bd / 2, maxZ: p.z + bd / 2, bottom: gy, top: gy + ch, walkable: !!(spec.walkable !== undefined ? spec.walkable : def.walkable), mat });
    });    return pts.length;
  },

  // Level of detail: one instanced mesh per level, every instance is drawn by the level that matches its distance to the camera (see update()).
  // The simpler levels carry no textures: they borrow the materials of the detailed model by name.
  placeLod(scene, def, root, lodRoots, pts, mats, foot) {
    const group = new THREE.Group(); group.name = 'asset:' + def.id; scene.add(group);
    const levels = [{ root, from: 0 }];
    const dist = this.lodDist(def, foot);
    lodRoots.forEach((r, i) => { if (r) levels.push({ root: r, from: dist[i] }); });
    const byName = new Map(); let first = null; const M = new THREE.Matrix4();
    levels.forEach((lv, li) => {
      lv.root.updateMatrixWorld(true); lv.meshes = [];
      for (const o of this.meshesOf(lv.root)) {
        let mt;
        if (li === 0) { mt = this.lit(o.material, def); this.tune(mt, def); for (const m of [].concat(mt)) if (m) { if (m.name) byName.set(m.name, m); first = first || m; } }
        else mt = byName.get([].concat(o.material)[0].name) || first;
        const im = new THREE.InstancedMesh(o.geometry, mt, pts.length), sub = new Float32Array(pts.length * 16);
        im.count = 0; im.visible = false; im.frustumCulled = false; im.castShadow = def.castShadow !== false; im.receiveShadow = true; im.name = 'asset:' + def.id + ':lod' + li;
        pts.forEach((p, i) => { M.copy(mats[i]).multiply(o.matrixWorld).toArray(sub, i * 16); });
        group.add(im); lv.meshes.push({ im, sub });
      }
    });
    const n = pts.length, set = { def, group, levels, dist: levels.slice(1).map(l => l.from), far: (def.far !== undefined ? def.far : 1e9) * (def.far !== undefined ? this.lodBias : 1), n, px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n), cur: new Int8Array(n).fill(-2), next: new Int8Array(n) };
    pts.forEach((p, i) => { set.px[i] = p.x; set.pz[i] = p.z; set.py[i] = (p.y !== undefined ? p.y : terrainHeight(p.x, p.z)) + (def.yOffset || 0) + foot.h * 0.4; });
    this.lodSets.push(set);
    this.info[def.id].tris = levels.map(l => l.meshes.reduce((a, m) => a + m.im.geometry.index.count / 3, 0) | 0);
  },

  // called every game step: re-sorts the instances into levels when the camera moved about a metre (or twice a second)
  update(dt, force) {
    const sets = this.lodSets; if (!sets.length || !G.camera) return;
    const cam = G.camera.position;
    this._t = (this._t || 0) + (dt || 0);
    if (!force) { const dx = cam.x - this._cx, dy = cam.y - this._cy, dz = cam.z - this._cz; if (dx * dx + dy * dy + dz * dz < 1 && this._t < 0.5) return; }
    this._t = 0; this._cx = cam.x; this._cy = cam.y; this._cz = cam.z;
    for (const s of sets) if (s.group.visible) this.updateSet(s, cam);
  },

  updateSet(s, cam) {
    const d = s.dist; let changed = false;
    for (let i = 0; i < s.n; i++) {
      const dx = s.px[i] - cam.x, dy = s.py[i] - cam.y, dz = s.pz[i] - cam.z, r = Math.sqrt(dx * dx + dy * dy + dz * dz), c = s.cur[i];
      let t = 0; while (t < d.length && r > d[t]) t++;
      if (c >= 0 && t !== c) { if (t > c && r < d[c] * 1.07) t = c; else if (t < c && r > d[c - 1] * 0.93) t = c; }          // stay on the old level a little longer so nothing flickers at the border
      if (r > s.far) t = -1;
      s.next[i] = t; if (t !== c) changed = true;
    }
    if (!changed) return;
    s.cur.set(s.next);
    s.levels.forEach((lv, li) => {
      for (const m of lv.meshes) {
        const arr = m.im.instanceMatrix.array; let j = 0;
        for (let i = 0; i < s.n; i++) if (s.cur[i] === li) { arr.set(m.sub.subarray(i * 16, i * 16 + 16), j * 16); j++; }
        m.im.count = j; m.im.visible = j > 0; m.im.instanceMatrix.needsUpdate = true;
      }
    });
  }
};
