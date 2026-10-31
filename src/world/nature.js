// Vegetation and rocks: leaf-card pines and oaks, bushes, cacti, boulder clusters, pebbles, logs, wind-animated grass, flowers
// and big tall-grass meadows where a crouching player can hide.
const Nature = {
  uTime: { value: 0 }, grass: null, tall: null, fields: [], mats: {},

  inst(scene, geo, mat, list, colors, cast = true) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const tmp = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
    list.forEach((o, i) => {
      v.set(o.x, o.y, o.z); q.setFromEuler(e.set(o.rx || 0, o.ry || 0, o.rz || 0)); s.set(o.sx, o.sy, o.sz);
      tmp.compose(v, q, s);
      m.setMatrixAt(i, tmp);
      if (colors) m.setColorAt(i, colors[i]);
    });
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = cast; m.receiveShadow = true;
    scene.add(m);
    return m;
  },

  jitter(geo, amt, seed) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = hash2(x * 7.3 + seed, z * 5.1 + y * 3.7) - 0.5;
      const k = 1 + n * amt; p.setXYZ(i, x * k, y + n * amt * 0.3, z * k);
    }
    geo.computeVertexNormals();
    return geo;
  },

  // cloud of randomly oriented leaf cards inside the given spheres [x, y, z, r]; normals point away from the centre for soft volumetric shading
  leafBall(spheres, perSphere, size, seed) {
    const rng = mulberry32(seed), parts = [];
    for (const [cx, cy, cz, r] of spheres) for (let i = 0; i < perSphere; i++) {
      const g = new THREE.PlaneGeometry(size * (0.8 + rng() * 0.5), size * (0.8 + rng() * 0.5));
      g.rotateX((rng() - 0.5) * 3.1); g.rotateY(rng() * 6.283); g.rotateZ(rng() * 6.283);
      const u = rng() * 2 - 1, th = rng() * 6.283, rad = r * (0.5 + 0.5 * Math.cbrt(rng())), s = Math.sqrt(1 - u * u);
      g.translate(cx + rad * s * Math.cos(th), cy + rad * u * 0.85, cz + rad * s * Math.sin(th));
      const p = g.attributes.position, nr = g.attributes.normal;
      for (let k = 0; k < p.count; k++) { const nx = p.getX(k) - cx, ny = p.getY(k) - cy + 0.3 * r, nz = p.getZ(k) - cz, l = Math.hypot(nx, ny, nz) || 1; nr.setXYZ(k, nx / l, ny / l, nz / l); }
      parts.push(g);
    }
    return FX.mergeGeometries(parts);
  },

  // pine: solid dark cone tiers plus drooping needle sprays all around each tier
  pineGeos() {
    const L = [[1.6, 2.0, 3.2], [3.0, 1.7, 2.9], [4.4, 1.35, 2.6], [5.6, 0.95, 2.4]], core = [], cards = [], rng = mulberry32(31);
    L.forEach(([y, r, h], i) => {
      core.push(this.jitter(new THREE.ConeGeometry(r * 0.7, h, 9, 2).translate(0, y + h / 2, 0), 0.25, i * 3));
      const n = 11 + (3 - i) * 0; for (let ring = 0; ring < 2; ring++) for (let k = 0; k < n; k++) {
        const len = r * (ring ? 1.05 : 1.3) + rng() * 0.3, g = new THREE.PlaneGeometry(len * 0.95, len);
        g.translate(0, len / 2, 0); g.rotateX(-(Math.PI / 2 - (ring ? 0.75 : 0.42) - rng() * 0.15)); g.rotateY((k + ring * 0.5) / n * 6.283 + rng() * 0.2);
        g.translate(0, y + h * (ring ? 0.62 : 0.28), 0);
        const p = g.attributes.position, nr = g.attributes.normal;
        for (let q = 0; q < p.count; q++) { const nx = p.getX(q), nz = p.getZ(q), l = Math.hypot(nx, nz) || 1; nr.setXYZ(q, nx / l * 0.6, 0.8, nz / l * 0.6); }
        cards.push(g);
      }
    });
    core.push(this.jitter(new THREE.ConeGeometry(0.28, 1.6, 7).translate(0, 7.1, 0), 0.2, 9));
    return { core: FX.mergeGeometries(core), cards: FX.mergeGeometries(cards) };
  },

  oakGeos() {
    const B = [[0, 6.3, 0, 2.4], [1.6, 5.4, 0.6, 1.8], [-1.5, 5.6, -0.5, 1.9], [0.4, 7.6, -0.6, 1.6], [-0.6, 5.1, 1.6, 1.7], [1.0, 5.2, -1.6, 1.7]];
    const core = FX.mergeGeometries(B.map(([x, y, z, r], i) => this.jitter(new THREE.IcosahedronGeometry(r * 0.72, 1).translate(x, y, z), 0.35, i * 5)));
    return { core, cards: this.leafBall(B, 28, 1.2, 77) };
  },

  // oak canopy colours: mostly fresh greens, a few yellow, orange and pink trees for a postcard look
  oakTint(h) {
    const r = rand();
    if (r < 0.1) return new THREE.Color(1.5, 0.72, 0.3);           // autumn orange
    if (r < 0.2) return new THREE.Color(1.35, 1.25, 0.4);          // golden yellow
    if (r < 0.27) return new THREE.Color(1.45, 0.8, 1.0);          // cherry blossom
    return new THREE.Color(rr(0.75, 1.05), rr(1.1, 1.4), rr(0.45, 0.75));
  },

  // wind sway for tree canopies: amplitude grows with height above the trunk base
  windify(mat, amp) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float hgt = max(position.y - 2.0, 0.0);
          float w1 = sin(uTime * 1.3 + ip.x * 0.21 + ip.z * 0.17) * ${amp.toFixed(3)} * hgt * hgt * 0.035;
          float w2 = sin(uTime * 2.7 + position.x * 1.5 + ip.z * 0.4) * ${(amp * 0.25).toFixed(3)} * hgt * 0.1;
          transformed.x += w1 + w2; transformed.z += w1 * 0.6;`);
    };
    return mat;
  },

  // ---------- tall grass meadows ----------
  pickFields() {
    const out = [], arena = { x: ARENA.x, z: ARENA.z };
    for (let i = 0; i < 3000 && out.length < 7; i++) {
      const r = rr(20, 31), x = rr(-MAP.half + r + 14, MAP.half - r - 14), z = rr(-MAP.half + r + 14, 150 - r * 0.3);
      if (biomeAt(x, z) !== 'field' || Math.hypot(x - arena.x, z - arena.z) < ARENA.r + r + 20) continue;
      if (Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) < MOUNTAIN.r + r * 0.4 || desertAmount(x, z) > 0.1) continue;
      let bad = false;
      for (let a = 0; a < 8 && !bad; a++) { const px = x + Math.cos(a * 0.785) * r * 0.7, pz = z + Math.sin(a * 0.785) * r * 0.7; if (inExcl(px, pz, 4) || waterDepth(px, pz) > 0 || slopeAt(px, pz) > 0.16 || distToRoad(px, pz) < 5) bad = true; }
      if (bad || inExcl(x, z, r * 0.6) || out.some(f => Math.hypot(f.x - x, f.z - z) < f.r + r + 18)) continue;
      out.push({ x, z, r, seed: rr(0, 90) });
    }
    return out;
  },

  // 0..1 amount of tall grass at a point (soft, noisy edges)
  tallAt(x, z) {
    let v = 0;
    for (const f of this.fields) {
      const dx = x - f.x, dz = z - f.z; if (dx * dx + dz * dz > f.r * f.r * 1.8) continue;
      const d = Math.hypot(dx, dz) / f.r + (fbm(x * 0.06 + f.seed, z * 0.06, 2) - 0.5) * 0.5;
      v = Math.max(v, smoothstep(1.0, 0.7, d));
    }
    return v;
  },

  // how much of its normal sight range an actor keeps while standing in tall grass (1 = fully visible)
  hideFactor(a) {
    if (!this.fields.length || a.riding) return 1;
    if (this.tallAt(a.pos.x, a.pos.z) < 0.4) return 1;
    const lf = a.lastFired !== undefined ? a.lastFired : (a.lastFireT !== undefined ? a.lastFireT : -99);
    if (G.time - lf < 2.5) return 0.8;
    const moving = (a.isPlayer ? a.speed : (a.speed || 0)) > 2.4;
    return a.crouch ? (moving ? 0.34 : 0.13) : (moving ? 0.7 : 0.48);
  },

  setWinter(v) {
    const set = (m, on, off) => { if (m) m.color.setHex(v ? on : off); };
    set(this.mats.needles, 0xe3edf2, 0xffffff); set(this.mats.leaf, 0xb7a89a, 0xffffff); set(this.mats.blade, 0xd6dfd8, 0xffffff); set(this.mats.tall, 0xd9d4bf, 0xffffff); set(this.mats.bush, 0xc7cfc4, 0xffffff);
    if (typeof Trees !== 'undefined') Trees.setWinter(v);
  },

  build(scene, quality) {
    const T = Tex.t, q = { low: 0.45, med: 0.75, high: 1 }[quality] || 1;
    const stdMat = (o) => FastEnv.make(Object.assign({ roughness: 0.92, metalness: 0, envMapIntensity: 0.5 }, o));
    const trees = { pine: [], oak: [] }, cacti = [], bushes = [], rocks = [], rockCols = [];
    const cPine = [], cOak = [], cBush = [];
    const gv = (a, b) => { const v = rr(a, b); return new THREE.Color(v, v * rr(0.96, 1.06), v * rr(0.85, 1)); };
    this.fields = this.pickFields();

    const maxTrees = Math.round(380 * q);
    for (let i = 0; i < 6000 && trees.pine.length + trees.oak.length < maxTrees; i++) {
      const x = rr(-MAP.half + 12, MAP.half - 12), z = rr(-MAP.half + 12, MAP.half - 12), b = biomeAt(x, z), h = terrainHeight(x, z);
      if (b === 'arena' || b === 'desert' || b === 'lake') continue;
      if (h > 24 || h < 0.6 || slopeAt(x, z) > 0.2) continue;
      if (distToRoad(x, z) < 5 || inExcl(x, z, 2) || this.tallAt(x, z) > 0.05) continue;
      if (fbm(x * 0.022 + 5, z * 0.022 + 1, 2) < 0.44 + (b === 'mountain' ? 0.06 : 0)) continue;
      const s = rr(0.85, 1.55), type = (b === 'mountain' || rand() < 0.62) ? 'pine' : 'oak';
      trees[type].push({ x, y: h - 0.2, z, sx: s, sy: s * rr(0.9, 1.15), sz: s, ry: rr(0, 6.28) });
      (type === 'pine' ? cPine : cOak).push(type === 'pine' ? new THREE.Color(rr(0.55, 0.95), rr(0.95, 1.35), rr(0.7, 1.1)) : this.oakTint(h));
    }
    const trunk = new THREE.CylinderGeometry(0.16, 0.3, 4.6, 7).translate(0, 2.3, 0);
    const trunkOak = new THREE.CylinderGeometry(0.22, 0.38, 5.6, 8).translate(0, 2.8, 0);
    const bark = stdMat({ map: T.bark, normalMap: T.barkN, roughness: 0.95 });
    const all = trees.pine.concat(trees.oak);
    const card = (...a) => this.cardTrees.push(this.inst(...a)); this.cardTrees = [];                  // the card trees: Low, Medium and phones; High and Ultra show the modelled ones (world/trees.js) instead
    card(scene, trunk, bark, trees.pine, null);
    card(scene, trunkOak, bark, trees.oak, null);
    const pg = this.pineGeos(), og = this.oakGeos();
    const needleMat = this.windify(stdMat({ map: T.needleCard, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, emissive: 0x16301a, emissiveIntensity: 0.6 }), 0.6);
    const leafMat = this.windify(stdMat({ map: T.leafCard, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, emissive: 0x1d3414, emissiveIntensity: 0.6 }), 0.5);
    const pineCore = this.windify(stdMat({ map: T.needles, color: 0xb2d6a6, emissive: 0x17331a, emissiveIntensity: 0.7 }), 0.6), oakCore = this.windify(stdMat({ map: T.leaf, color: 0xb0d088, emissive: 0x1d3414, emissiveIntensity: 0.7 }), 0.5);
    card(scene, pg.core, pineCore, trees.pine, cPine);
    card(scene, pg.cards, needleMat, trees.pine, cPine);
    card(scene, og.core, oakCore, trees.oak, cOak);
    card(scene, og.cards, leafMat, trees.oak, cOak);
    this.mats.needles = needleMat; this.mats.leaf = leafMat;
    all.forEach(t => addCollider({ type: 'circle', x: t.x, z: t.z, r: 0.42 * t.sx, bottom: t.y, top: t.y + 9, mat: 'wood' }));
    G.trees = all; this.treeLists = { pine: trees.pine, oak: trees.oak };

    // desert: cacti + dry bushes
    for (let i = 0; i < 2500 && cacti.length < Math.round(70 * q); i++) {
      const x = rr(DESERT_EDGE, MAP.half - 12), z = rr(-MAP.half + 12, MAP.half - 12);
      if (biomeAt(x, z) !== 'desert' || fbm(x * 0.03, z * 0.03, 2) < 0.42 || distToRoad(x, z) < 5 || inExcl(x, z, 2)) continue;
      cacti.push({ x, y: terrainHeight(x, z) - 0.15, z, sx: 1, sy: 1, sz: 1, s: rr(0.8, 1.5), ry: rr(0, 6.28) });
    }
    cacti.forEach(c => { c.sx = c.sy = c.sz = c.s; });
    const cm = stdMat({ color: 0x5c8a45, roughness: 0.85 });
    this.inst(scene, new THREE.CylinderGeometry(0.3, 0.36, 3.4, 10).translate(0, 1.7, 0), cm, cacti, null);
    this.inst(scene, new THREE.CylinderGeometry(0.17, 0.17, 1.2, 8).rotateZ(Math.PI / 2).translate(0.72, 1.9, 0), cm, cacti, null);
    this.inst(scene, new THREE.CylinderGeometry(0.16, 0.16, 1.1, 8).translate(1.28, 2.4, 0), cm, cacti, null);
    cacti.forEach(t => addCollider({ type: 'circle', x: t.x, z: t.z, r: 0.4 * t.s, bottom: t.y, top: t.y + 3.4, mat: 'wood' }));

    // bushes (leaf cards around a small core)
    for (let i = 0; i < 4000 && bushes.length < Math.round(300 * q); i++) {
      const x = rr(-MAP.half + 10, MAP.half - 10), z = rr(-MAP.half + 10, MAP.half - 10), b = biomeAt(x, z), h = terrainHeight(x, z);
      if (b === 'arena' || b === 'lake' || h < 0.5 || distToRoad(x, z) < 4 || inExcl(x, z, 1) || slopeAt(x, z) > 0.22 || this.tallAt(x, z) > 0.2) continue;
      const s = rr(0.6, 1.4);
      bushes.push({ x, y: h + 0.15 * s, z, sx: s * rr(1, 1.5), sy: s * 0.75, sz: s * rr(1, 1.5), ry: rr(0, 6.28) });
      cBush.push(b === 'desert' ? new THREE.Color(rr(0.9, 1.2), rr(0.75, 0.95), rr(0.4, 0.55)) : gv(0.65, 1.1));
    }
    const bushMat = stdMat({ map: T.leafCard, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide });
    this.inst(scene, this.leafBall([[0, 0.55, 0, 0.8]], 26, 0.62, 5), bushMat, bushes, cBush);
    this.inst(scene, this.jitter(new THREE.IcosahedronGeometry(0.62, 1).translate(0, 0.5, 0), 0.4, 99), stdMat({ map: T.leaf, color: 0x6f8a58 }), bushes, cBush, false);
    this.mats.bush = bushMat;

    // boulders: singles, clusters and big rocks along the shore
    const addRock = (x, z, s, b, h) => {
      h = h !== undefined ? h : terrainHeight(x, z);
      rocks.push({ x, y: h + s * 0.15, z, sx: s * rr(1, 1.4), sy: s * rr(0.65, 1), sz: s * rr(1, 1.4), ry: rr(0, 6.28), s, h });
      const g = rr(0.75, 1.15); rockCols.push(b === 'desert' ? new THREE.Color(g * 1.15, g * 0.95, g * 0.72) : new THREE.Color(g, g * 0.97, g * 0.92));
    };
    for (let i = 0; i < 6000 && rocks.length < Math.round(150 * q); i++) {
      const x = rr(-MAP.half + 10, MAP.half - 10), z = rr(-MAP.half + 10, MAP.half - 10), b = biomeAt(x, z);
      if (b === 'arena' || b === 'lake' || distToRoad(x, z) < 4 || inExcl(x, z, 1) || this.tallAt(x, z) > 0.1) continue;
      if (b === 'field' && rand() > 0.12) continue;
      if (b === 'desert' && rand() > 0.3) continue;
      addRock(x, z, b === 'mountain' ? rr(0.9, 3.4) : rr(0.7, 2.3), b);
    }
    for (let c = 0, tries = 0; c < Math.round(26 * q) && tries < 1500; tries++) {          // clusters of 3-6 rocks
      const x = rr(-MAP.half + 20, MAP.half - 20), z = rr(-MAP.half + 20, MAP.half - 20), b = biomeAt(x, z);
      if (b === 'arena' || b === 'lake' || distToRoad(x, z) < 8 || inExcl(x, z, 4) || this.tallAt(x, z) > 0.1 || slopeAt(x, z) > 0.25) continue;
      c++; const n = 3 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) { const a = rr(0, 6.28), d = k ? rr(1.2, 3.4) : 0, rx = x + Math.cos(a) * d, rz = z + Math.sin(a) * d; addRock(rx, rz, k ? rr(0.5, 1.5) : rr(1.6, 2.8), b); }
    }
    for (let i = 0; i < 14; i++) { const x = rr(-190, 190), z = coastZ(x) + rr(16, 30); if (z < 206 && z > 150) addRock(x, z, rr(2.6, 6), 'field', Math.max(terrainHeight(x, z), -3)); }   // sea stacks
    const rockMat = stdMat({ map: T.rock, normalMap: T.rockN, roughness: 0.9 });
    this.inst(scene, this.jitter(new THREE.DodecahedronGeometry(1, 1), 0.45, 7), rockMat, rocks, rockCols);
    rocks.forEach(r => { if (r.s > 1.2) addCollider({ type: 'circle', x: r.x, z: r.z, r: r.s * 0.85, bottom: r.h - 1, top: r.h + r.s * 0.8, mat: 'concrete' }); });

    // pebbles, logs and stumps
    const peb = [], pebC = [];
    for (let i = 0; i < 6000 && peb.length < Math.round(900 * q); i++) {
      const x = rr(-MAP.half + 8, MAP.half - 8), z = rr(-MAP.half + 8, MAP.half - 8), b = biomeAt(x, z);
      if (b === 'arena' || b === 'lake' || inExcl(x, z, 0) || waterDepth(x, z) > 0) continue;
      const near = distToRoad(x, z) < 6 || b === 'mountain' || (b === 'field' && (coastZ(x) - z) < 22);
      if (!near && rand() > 0.12) continue;
      const s = rr(0.08, 0.28), h = terrainHeight(x, z);
      peb.push({ x, y: h + s * 0.2, z, sx: s * rr(1, 1.7), sy: s * 0.6, sz: s * rr(1, 1.5), ry: rr(0, 6.28) }); const g = rr(0.7, 1.2); pebC.push(new THREE.Color(g, g * 0.96, g * 0.9));
    }
    this.inst(scene, new THREE.DodecahedronGeometry(1, 0), rockMat, peb, pebC, false);
    const logs = [], stumps = [];
    for (let i = 0; i < 4000 && logs.length + stumps.length < Math.round(60 * q); i++) {
      const x = rr(-MAP.half + 14, MAP.half - 14), z = rr(-MAP.half + 14, MAP.half - 14), b = biomeAt(x, z), h = terrainHeight(x, z);
      if (b !== 'field' && b !== 'mountain') continue;
      if (h < 0.8 || h > 20 || slopeAt(x, z) > 0.12 || distToRoad(x, z) < 5 || inExcl(x, z, 2) || this.tallAt(x, z) > 0.05 || fbm(x * 0.03 + 8, z * 0.03, 2) < 0.5) continue;
      if (rand() < 0.5) { const along = rand() < 0.5, len = rr(3, 5.2), r = rr(0.26, 0.4); logs.push({ x, y: h + r * 0.8, z, sx: 1, sy: 1, sz: 1, ry: along ? 0 : Math.PI / 2, len, r }); }
      else stumps.push({ x, y: h - 0.1, z, sx: rr(0.8, 1.3), sy: rr(0.7, 1.4), sz: 1, ry: rr(0, 6.28) });
    }
    stumps.forEach(s => { s.sz = s.sx; });
    this.inst(scene, new THREE.CylinderGeometry(0.4, 0.5, 0.75, 9).translate(0, 0.37, 0), bark, stumps, null);
    stumps.forEach(s => addCollider({ type: 'circle', x: s.x, z: s.z, r: 0.45 * s.sx, bottom: s.y, top: s.y + 0.75 * s.sy, mat: 'wood' }));
    logs.forEach(l => {   // logs share one mesh per length class via scaled instances of a unit log
      l.sx = l.len; l.sy = l.r / 0.3; l.sz = l.r / 0.3; l.rz = 0;
      const half = l.len / 2, along = l.ry === 0;
      addCollider({ type: 'box', minX: l.x - (along ? half : l.r), maxX: l.x + (along ? half : l.r), minZ: l.z - (along ? l.r : half), maxZ: l.z + (along ? l.r : half), bottom: l.y - l.r, top: l.y + l.r, mat: 'wood' });
    });
    this.inst(scene, new THREE.CylinderGeometry(0.3, 0.32, 1, 9).rotateZ(Math.PI / 2), bark, logs, null);

    this.tufts(scene, quality);
  },

  swayMat(map, extra) {
    const mat = FastEnv.make(Object.assign({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.9, color: 0xffffff, emissive: 0x1e3a10, emissiveIntensity: 0.55 }, extra || {}));
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float sway = sin(uTime * 1.8 + ip.x * 0.4 + ip.z * 0.3) * 0.14 * uv.y * uv.y + sin(uTime * 3.1 + ip.z * 0.9) * 0.04 * uv.y;
          transformed.x += sway; transformed.z += sway * 0.6;`);
    };
    return mat;
  },

  crossGeo(w, h, planes) {
    const geo = new THREE.BufferGeometry(), pos = [], nor = [], uv = [], idx = [];
    for (let k = 0; k < planes; k++) {
      const a = k * Math.PI / planes + 0.3, dx = Math.cos(a) * w, dz = Math.sin(a) * w, b = pos.length / 3;
      pos.push(-dx, 0, -dz, dx, 0, dz, dx, h, dz, -dx, h, -dz);
      for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  },

  tufts(scene, quality) {
    const count = { low: 0, med: 16000, high: 38000 }[quality] || 0;
    if (count) {
      const mat = this.swayMat(Tex.t.blade); this.mats.blade = mat;
      const list = [], cols = [];
      for (let i = 0; i < count * 7 && list.length < count; i++) {
        const x = rr(-MAP.half + 8, MAP.half - 8), z = rr(-MAP.half + 8, MAP.half - 8);
        const b = biomeAt(x, z);
        if (b !== 'field' && b !== 'mountain') continue;
        if (fbm(x * 0.05 + 40, z * 0.05, 2) < 0.34) continue;
        const h = terrainHeight(x, z);
        if (h > 22 || h < 0.3 || slopeAt(x, z) > 0.2 || distToRoad(x, z) < 3 || inExcl(x, z, 0.5) || this.tallAt(x, z) > 0.3) continue;
        const s = rr(0.55, 1.15);
        list.push({ x, y: h - 0.05, z, sx: s, sy: s * rr(0.7, 1.0), sz: s, ry: rr(0, 6.28) });
        const v = rr(0.75, 1.25); cols.push(new THREE.Color(v * rr(0.95, 1.1), v, v * rr(0.7, 0.95)));
      }
      this.grass = this.inst(scene, this.crossGeo(0.55, 0.9, 2), mat, list, cols, false);
      this.grass.castShadow = false;
    }

    // tall meadows
    const tallMat = this.swayMat(Tex.t.bladeTall, { emissive: 0x24420f, emissiveIntensity: 0.5 }); this.mats.tall = tallMat;
    const tl = [], tc = [], fl = [], flc = [];
    for (const f of this.fields) {
      const want = Math.round(f.r * f.r * 3.14 * 0.62), x0 = f.x - f.r * 1.2, z0 = f.z - f.r * 1.2;
      let n = 0;
      for (let i = 0; i < want * 4 && n < want; i++) {
        const x = x0 + rand() * f.r * 2.4, z = z0 + rand() * f.r * 2.4, t = this.tallAt(x, z);
        if (t < 0.05 || rand() > t * 1.25 || waterDepth(x, z) > 0 || inExcl(x, z, 0.5) || distToRoad(x, z) < 2) continue;
        const s = rr(0.9, 1.4) * (0.65 + 0.35 * t), h = terrainHeight(x, z);
        tl.push({ x, y: h - 0.05, z, sx: s, sy: s * rr(0.85, 1.2), sz: s, ry: rr(0, 6.28) });
        const v = rr(0.8, 1.2); tc.push(new THREE.Color(v * rr(0.95, 1.1), v, v * rr(0.7, 0.95)));
        n++;
      }
    }
    if (tl.length) { this.tall = this.inst(scene, this.crossGeo(0.62, 1.75, 3), tallMat, tl, tc, false); this.tall.castShadow = false; }
    // wild flowers in the meadows and between the normal tufts
    for (let i = 0; i < 9000 && fl.length < 3200; i++) {
      const x = rr(-MAP.half + 10, MAP.half - 10), z = rr(-MAP.half + 10, MAP.half - 10), b = biomeAt(x, z);
      if (b !== 'field' || fbm(x * 0.07 + 90, z * 0.07, 2) < 0.58) continue;
      const h = terrainHeight(x, z); if (h < 0.5 || h > 14 || slopeAt(x, z) > 0.15 || distToRoad(x, z) < 3 || inExcl(x, z, 0.5)) continue;
      const s = rr(0.5, 0.9); fl.push({ x, y: h - 0.03, z, sx: s, sy: s, sz: s, ry: rr(0, 6.28) }); flc.push(new THREE.Color(1, 1, 1));
    }
    if (fl.length) this.inst(scene, this.crossGeo(0.3, 0.55, 2), this.swayMat(Tex.t.flowers, { emissive: 0x2a2a10, emissiveIntensity: 0.4 }), fl, flc, false).castShadow = false;
  },

  update(dt) { this.uTime.value += dt; }
};
