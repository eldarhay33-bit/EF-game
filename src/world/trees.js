// Modelled trees on High and Ultra: Quaternius' Stylized Nature MegaKit (CC0, assets/models/mk/, prepared by tools/make-trees.ps1): real trunks with branches and leaf cards, five pines, five broadleaf
// trees. Three levels of detail are made from each model when it loads: close up the model itself, then the same tree with fewer leaf cards (the rest grown to keep the
// crown as full) and a trunk with the thin branches merged away, then a trunk and a few big cards. Every tree is an instance of the level that matches its distance (like Assets), only the near
// levels cast shadows. Low, Medium and phones keep the cheap card trees of nature.js; they are hidden while these are shown.
const Trees = {
  FILES: {
    pine: ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'],
    oak: ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5']
  },
  dist: [38, 105, 520],                       // level 0 up to 38 m, level 1 up to 105 m, level 2 up to 520 m, nothing beyond
  models: null, mats: {}, sets: [], group: null, lists: null, active: false, hidden: false, loading: false, failed: false, _t: 0, cx: 1e9, cy: 0, cz: 0,

  // ---------- level-of-detail geometry ----------
  // leaf cards: the connected pieces of the leaf mesh (a card, or a spray of them) are thinned out to `keep` of their number and the rest scaled up about their own centre by 1 / sqrt(keep)
  thinCards(g, keep) {
    const idx = g.index.array, P = g.attributes.position, nV = P.count, par = new Int32Array(nV);
    for (let i = 0; i < nV; i++) par[i] = i;
    const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let i = 0; i < idx.length; i += 3) { const a = find(idx[i]); par[find(idx[i + 1])] = a; par[find(idx[i + 2])] = a; }
    const comp = new Map();
    for (let v = 0; v < nV; v++) { const r = find(v); let c = comp.get(r); if (!c) comp.set(r, c = { v: [], cx: 0, cy: 0, cz: 0 }); c.v.push(v); c.cx += P.getX(v); c.cy += P.getY(v); c.cz += P.getZ(v); }
    const f = 1 / Math.sqrt(keep), remap = new Int32Array(nV).fill(-1), names = Object.keys(g.attributes), data = {}, size = {};
    for (const n of names) { size[n] = g.attributes[n].itemSize; data[n] = []; }
    let nOut = 0; const posOut = data.position;
    for (const [root, c] of comp) {
      if (hash2(root * 0.731 + 3.1, c.v.length * 1.37 + 7.7) >= keep) continue;
      const k = c.v.length, cx = c.cx / k, cy = c.cy / k, cz = c.cz / k;
      for (const v of c.v) {
        remap[v] = nOut++;
        for (const n of names) { const a = g.attributes[n]; if (n === 'position') posOut.push(cx + (a.getX(v) - cx) * f, cy + (a.getY(v) - cy) * f, cz + (a.getZ(v) - cz) * f); else for (let q = 0; q < size[n]; q++) data[n].push(a.array[v * size[n] + q]); }
      }
    }
    const ni = [];
    for (let i = 0; i < idx.length; i += 3) { const a = remap[idx[i]]; if (a >= 0) ni.push(a, remap[idx[i + 1]], remap[idx[i + 2]]); }
    return this.geo(names, data, size, ni);
  },

  // trunk and branches: vertices that fall in the same cell of a grid of `cell` metres become one (thin branches collapse to nothing, the trunk stays)
  cluster(g, cell) {
    const idx = g.index.array, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color, nV = P.count, key = new Map(), remap = new Int32Array(nV);
    const pos = [], nor = [], uv = [], col = [], cnt = [];
    for (let i = 0; i < nV; i++) {
      const k = Math.round(P.getX(i) / cell) + ',' + Math.round(P.getY(i) / cell) + ',' + Math.round(P.getZ(i) / cell);
      let j = key.get(k);
      if (j === undefined) { j = cnt.length; key.set(k, j); pos.push(0, 0, 0); nor.push(0, 0, 0); uv.push(U.getX(i), U.getY(i)); col.push(0, 0, 0, 0); cnt.push(0); }
      remap[i] = j; cnt[j]++;
      pos[j * 3] += P.getX(i); pos[j * 3 + 1] += P.getY(i); pos[j * 3 + 2] += P.getZ(i); nor[j * 3] += N.getX(i); nor[j * 3 + 1] += N.getY(i); nor[j * 3 + 2] += N.getZ(i);
      if (C) { col[j * 4] += C.getX(i); col[j * 4 + 1] += C.getY(i); col[j * 4 + 2] += C.getZ(i); col[j * 4 + 3] += C.itemSize > 3 ? C.getW(i) : 1; }
    }
    for (let j = 0; j < cnt.length; j++) {
      const c = cnt[j], l = Math.hypot(nor[j * 3], nor[j * 3 + 1], nor[j * 3 + 2]) || 1;
      pos[j * 3] /= c; pos[j * 3 + 1] /= c; pos[j * 3 + 2] /= c; nor[j * 3] /= l; nor[j * 3 + 1] /= l; nor[j * 3 + 2] /= l; for (let q = 0; q < 4; q++) col[j * 4 + q] /= c;
    }
    const ni = [];
    for (let i = 0; i < idx.length; i += 3) { const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]]; if (a !== b && b !== c && a !== c) ni.push(a, b, c); }
    const names = ['position', 'normal', 'uv'], data = { position: pos, normal: nor, uv }, size = { position: 3, normal: 3, uv: 2 };
    if (C) { names.push('color'); data.color = col; size.color = 4; }
    return this.geo(names, data, size, ni);
  },

  geo(names, data, size, index) {
    const g = new THREE.BufferGeometry();
    for (const n of names) g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(data[n]), size[n]));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1)); g.computeBoundingSphere();
    return g;
  },

  // ---------- loading ----------
  // material of a species: bark (the model's normal map) or leaf cards, Lambert with the SH sky light (engine/fastenv.js), the leaves swaying in the wind like the card trees
  material(sp, leaf, src) {
    const k = sp + (leaf ? 'L' : 'B');
    if (this.mats[k]) return this.mats[k];
    const m = FastEnv.on ? FastEnv.lambertFrom(src) : src.clone();
    if (!leaf) m.color.setRGB(0.62, 0.5, 0.42);                              // the pack's bark is a bright orange-brown: deeper and browner
    if (leaf) {
      m.alphaTest = 0.35; m.alphaToCoverage = true; m.side = THREE.DoubleSide;
      m.emissive = new THREE.Color(sp === 'pine' ? 0x16301a : 0x1d3414); m.emissiveIntensity = 0.6;
      Nature.windify(m, sp === 'pine' ? 0.6 : 0.5);
    }
    return (this.mats[k] = m);
  },

  prep(sp, scene) {
    scene.updateMatrixWorld(true);
    const parts = [];
    scene.traverse(o => {
      if (!o.isMesh) return;
      const leaf = !!o.material.alphaTest, g0 = o.geometry.clone().applyMatrix4(o.matrixWorld);
      parts.push({ leaf, lods: leaf ? [g0, this.thinCards(g0, 0.45), this.thinCards(g0, 0.16)] : [g0, this.cluster(g0, 0.12), this.cluster(g0, 0.5)], mat: this.material(sp, leaf, o.material) });
    });
    return parts;
  },

  async load() {
    if (this.models || this.loading || this.failed) return;
    this.loading = true;
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'), ld = new GLTFLoader(), M = {};
      for (const sp in this.FILES) M[sp] = await Promise.all(this.FILES[sp].map(async f => this.prep(sp, (await ld.loadAsync('assets/models/mk/' + f + '.gltf?v=' + (window.ASSET_VER || 0))).scene)));
      this.models = M;
    } catch (e) { this.failed = true; console.warn('[trees] the modelled trees are unavailable, the card trees stay', e && e.message); }
    this.loading = false;
  },

  // ---------- the instances ----------
  // lists: { pine: [{ x, y, z, sx, sy, sz, ry }], oak: [...] } (nature.js); each tree gets a variant from its position and a colour
  tint(sp, t) {
    const h1 = hash2(t.x * 0.37 + 1.7, t.z * 0.53 + 9.1), h2 = hash2(t.x * 0.91 + 5.3, t.z * 0.29 + 2.2), h3 = hash2(t.x * 0.17 + 8.8, t.z * 0.71 + 4.4);
    if (sp === 'pine') return new THREE.Color(0.62 + 0.22 * h1, 0.82 + 0.3 * h2, 0.7 + 0.25 * h3);
    if (h1 < 0.1) return new THREE.Color(0.62, 0.22, 0.05);                 // autumn orange
    if (h1 < 0.2) return new THREE.Color(0.6, 0.46, 0.07);                  // golden yellow
    if (h1 < 0.27) return new THREE.Color(0.7, 0.36, 0.46);                 // cherry blossom
    return new THREE.Color(0.15 + 0.1 * h2, 0.36 + 0.12 * h3, 0.06 + 0.07 * h2);
  },

  build(scene, lists) {
    this.lists = lists;
    if (!this.models || this.group) return;
    const group = this.group = new THREE.Group(); group.name = 'trees'; scene.add(group);
    const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    for (const sp in lists) {
      const V = this.models[sp]; if (!V) continue;
      const byV = V.map(() => []);
      for (const t of lists[sp]) { byV[Math.floor(hash2(t.x * 1.13 + 2.7, t.z * 0.87 + 6.1) * V.length) % V.length].push(t); }
      V.forEach((parts, vi) => {
        const trees = byV[vi], n = trees.length; if (!n) return;
        for (const t of trees) { t.m = new THREE.Matrix4().compose(v.set(t.x, t.y, t.z), q.setFromEuler(e.set(0, t.ry, 0)), s.set(t.sx, t.sy, t.sz)); t.c = this.tint(sp, t); }
        const lv = parts.map(p => p.lods.map((g, l) => {
          const im = new THREE.InstancedMesh(g, p.mat, n); im.count = 0; im.visible = false; im.frustumCulled = false;
          im.castShadow = l < 2; im.receiveShadow = l === 0 || !p.leaf; im.name = 'tree:' + sp + vi + (p.leaf ? 'L' : 'B') + l;
          if (p.leaf && trees[0].c) im.setColorAt(0, trees[0].c);
          group.add(im); return im;
        }));
        this.sets.push({ sp, trees, n, parts, lv, cur: new Int8Array(n).fill(-2), next: new Int8Array(n) });
      });
    }
    this.apply(Game.qualityKey);
  },

  // quality: the modelled trees where the machine can afford them, the card trees everywhere else
  wanted(key) { return !Device.phone && (key === 'high' || key === 'ultra') && !/[?&]trees=0/.test(location.search); },

  apply(key) {
    const want = this.wanted(key);
    if (want && !this.models && !this.loading && !this.failed) { this.load().then(() => { if (this.models && Nature.treeLists && !this.group) this.build(G.scene, Nature.treeLists); if (this.models) this.apply(Game.qualityKey); }); return; }
    this.active = want && !!this.group;
    this.sync();
    if (this.active) this.update(0, true);
  },

  // which of the two kinds of tree is drawn (Themes.mainVisible hides the whole open world inside the duel and training arenas)
  sync() {
    const show = !this.hidden;
    if (this.group) this.group.visible = show && this.active;
    for (const m of Nature.cardTrees || []) m.visible = show && !this.active;
  },
  shown(v) { this.hidden = !v; this.sync(); },

  update(dt, force) {
    if (!this.active || !this.sets.length || !G.camera) return;
    const cam = G.camera.position; this._t += dt;
    if (!force) { const dx = cam.x - this.cx, dy = cam.y - this.cy, dz = cam.z - this.cz; if (dx * dx + dy * dy + dz * dz < 1 && this._t < 0.5) return; }
    this._t = 0; this.cx = cam.x; this.cy = cam.y; this.cz = cam.z;
    for (const s of this.sets) this.updateSet(s, cam);
  },

  updateSet(s, cam) {
    const d = this.dist, n = s.n; let changed = false;
    for (let i = 0; i < n; i++) {
      const t = s.trees[i], dx = t.x - cam.x, dz = t.z - cam.z, dy = (t.y - cam.y) * 0.5, r = Math.sqrt(dx * dx + dz * dz + dy * dy), c = s.cur[i];
      let l = 0; while (l < 3 && r > d[l]) l++;
      if (c >= 0 && c < 3 && l !== c) { if (l > c && r < d[c] * 1.08) l = c; else if (l < c && r > d[c - 1] * 0.92) l = c; }          // keeps the old level a little longer so nothing flickers at the border
      s.next[i] = l; if (l !== c) changed = true;
    }
    if (!changed) return;
    for (let l = 0; l < 3; l++) {
      let k = 0;
      for (let i = 0; i < n; i++) if (s.next[i] === l) {
        const t = s.trees[i];
        for (let p = 0; p < s.lv.length; p++) { const im = s.lv[p][l]; im.setMatrixAt(k, t.m); if (s.parts[p].leaf && t.c) im.setColorAt(k, t.c); }
        k++;
      }
      for (let p = 0; p < s.lv.length; p++) { const im = s.lv[p][l]; im.count = k; im.visible = k > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    }
    s.cur.set(s.next);
  },

  // snow tints the crowns like the card trees' materials do (nature.js setWinter)
  setWinter(v) {
    const set = (m, on, off) => { if (m) m.color.setHex(v ? on : off); };
    set(this.mats.pineL, 0xe3edf2, 0xffffff); set(this.mats.oakL, 0xb7a89a, 0xffffff);
  }
};
