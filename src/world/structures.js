// Structure kit: PBR material registry, world-space UV baking, per-region mesh merging, collidable primitives and props.
const World = { lootSpots: [], bikeSpots: [], updaters: [], supplySpots: [] };

const SM = {
  concrete:     { map: 'concrete', n: 'concreteN', color: 0xbdbab2, rough: 0.92, tile: 3, cm: 'concrete' },
  concreteDark: { map: 'concrete', n: 'concreteN', color: 0x7e7c76, rough: 0.92, tile: 3, cm: 'concrete' },
  concreteWarm: { map: 'concrete', n: 'concreteN', color: 0xc9bca0, rough: 0.92, tile: 3, cm: 'concrete' },
  plasterA:     { map: 'plaster', color: 0xe8dfca, rough: 0.95, tile: 2.5, cm: 'concrete' },
  plasterB:     { map: 'plaster', color: 0xdcc88e, rough: 0.95, tile: 2.5, cm: 'concrete' },
  plasterC:     { map: 'plaster', color: 0xb9c2b0, rough: 0.95, tile: 2.5, cm: 'concrete' },
  plasterD:     { map: 'plaster', color: 0xc98a6c, rough: 0.95, tile: 2.5, cm: 'concrete' },
  sandstone:    { map: 'plaster', n: 'concreteN', color: 0xcaa56d, rough: 0.97, tile: 3, cm: 'concrete' },
  wood:         { map: 'wood', n: 'woodN', color: 0xcfb58f, rough: 0.85, tile: 2.2, cm: 'wood' },
  woodDark:     { map: 'wood', n: 'woodN', color: 0x6e5238, rough: 0.85, tile: 2.2, cm: 'wood' },
  woodRed:      { map: 'wood', n: 'woodN', color: 0x9a3a2e, rough: 0.85, tile: 2.2, cm: 'wood' },
  metal:        { map: 'metal', n: 'metalN', color: 0xb5b8ba, rough: 0.55, metal: 0.7, tile: 2, cm: 'metal' },
  metalRed:     { map: 'metal', n: 'metalN', color: 0xb5463a, rough: 0.55, metal: 0.55, tile: 2, cm: 'metal' },
  metalBlue:    { map: 'metal', n: 'metalN', color: 0x3d6794, rough: 0.55, metal: 0.55, tile: 2, cm: 'metal' },
  metalGreen:   { map: 'metal', n: 'metalN', color: 0x4d6e47, rough: 0.55, metal: 0.55, tile: 2, cm: 'metal' },
  metalYellow:  { map: 'metal', n: 'metalN', color: 0xcfa530, rough: 0.55, metal: 0.55, tile: 2, cm: 'metal' },
  metalOrange:  { map: 'metal', n: 'metalN', color: 0xc9652b, rough: 0.55, metal: 0.55, tile: 2, cm: 'metal' },
  olive:        { map: 'metal', n: 'metalN', color: 0x59613f, rough: 0.6, metal: 0.45, tile: 2.4, cm: 'metal' },
  steel:        { map: 'concrete', color: 0x6f7378, rough: 0.4, metal: 0.85, tile: 3, cm: 'metal' },
  rubber:       { map: 'noiseGray', color: 0x1c1c1c, rough: 0.95, tile: 1, cm: 'metal' },
  roofRed:      { map: 'roof', color: 0xb85a40, rough: 0.8, tile: 2.2, cm: 'concrete' },
  roofGray:     { map: 'roof', color: 0x70747a, rough: 0.8, tile: 2.2, cm: 'concrete' },
  roofBrown:    { map: 'roof', color: 0x6b4a38, rough: 0.8, tile: 2.2, cm: 'concrete' },
  sandbag:      { map: 'plaster', n: 'concreteN', color: 0xa89a74, rough: 1, tile: 1.4, cm: 'concrete' },
  hay:          { map: 'grass', color: 0xd9c46a, rough: 1, tile: 1.5, cm: 'wood' },
  canvas:       { map: 'plaster', color: 0x6c7351, rough: 1, tile: 2, cm: 'wood' },
  canvasTan:    { map: 'plaster', color: 0xb8a77c, rough: 1, tile: 2, cm: 'wood' },
  glass:        { color: 0x9fc4d6, rough: 0.05, metal: 0.1, tile: 1, cm: 'concrete', glass: true },
  // special arena materials
  turf:         { map: 'grass', color: 0xa9c283, rough: 1, tile: 5, cm: 'concrete' },
  arenaSand:    { map: 'sand', color: 0xe3c38c, rough: 1, tile: 6, cm: 'concrete' },
  tileDark:     { map: 'concrete', n: 'concreteN', color: 0x2a2d38, rough: 0.3, metal: 0.55, tile: 3, cm: 'metal' },
  marble:       { map: 'plaster', n: 'concreteN', color: 0xe9e4d8, rough: 0.45, tile: 3, cm: 'concrete' },
  mossStone:    { map: 'rock', n: 'rockN', color: 0xa7ae96, rough: 0.95, tile: 4, cm: 'concrete' },
  neonCyan:     { color: 0x061014, rough: 0.4, tile: 1, cm: 'metal', emis: 0x00e5ff },
  neonPink:     { color: 0x140610, rough: 0.4, tile: 1, cm: 'metal', emis: 0xff2fb4 },
  neonLime:     { color: 0x0a1405, rough: 0.4, tile: 1, cm: 'metal', emis: 0x9dff2f },
  torch:        { color: 0x140a02, rough: 0.5, tile: 1, cm: 'wood', emis: 0xff8a2a }
};

const Structures = {
  scene: null, q: {}, mats: {},

  begin(scene) { this.scene = scene; this.q = {}; this.mats = {}; },

  mat(key) {
    if (this.mats[key]) return this.mats[key];
    const d = SM[key], T = Tex.t;
    const m = new THREE.MeshStandardMaterial({
      map: T[d.map] || null, normalMap: d.n ? T[d.n] : null, color: d.color, roughness: d.rough, metalness: d.metal || 0,
      envMapIntensity: d.metal ? 1.1 : 0.55
    });
    if (d.n) m.normalScale = new THREE.Vector2(0.8, 0.8);
    if (d.emis) { m.emissive = new THREE.Color(d.emis); m.emissiveIntensity = 2.6; }
    if (d.glass) { m.transparent = true; m.opacity = 0.32; m.depthWrite = false; m.envMapIntensity = 2; }
    return (this.mats[key] = m);
  },

  // push a geometry into the merge queue, world-space UVs so textures tile consistently across boxes
  add(geo, key, matrix) {
    if (matrix) geo.applyMatrix4(matrix);
    if (geo.index) geo = geo.toNonIndexed();
    const tile = SM[key].tile, p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (ay > ax && ay > az) uv.setXY(i, x / tile, z / tile); else if (ax > az) uv.setXY(i, z / tile, y / tile); else uv.setXY(i, x / tile, y / tile);
    }
    const cx = Math.floor(p.getX(0) / 110), cz = Math.floor(p.getZ(0) / 110), k = key + '|' + cx + '|' + cz;
    (this.q[k] || (this.q[k] = [])).push(geo);
  },

  flush() {
    for (const k in this.q) {
      const key = k.split('|')[0], list = this.q[k];
      const geo = FX.mergeGeometries(list, false);
      list.forEach(g => g.dispose());
      const m = new THREE.Mesh(geo, this.mat(key));
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    }
    this.q = {};
  },

  box(cx, cz, w, d, h, key, o = {}) {
    let y = o.y;
    if (y === undefined) {
      let low = Infinity;
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) low = Math.min(low, terrainHeight(cx + ox * w / 2, cz + oz * d / 2));
      y = low - 0.3; h += terrainHeight(cx, cz) - y;
    }
    const geo = new THREE.BoxGeometry(w, h, d), m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(cx, y + h / 2, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, o.rotY || 0, 0)), new THREE.Vector3(1, 1, 1));
    this.add(geo, key, m);
    if (!o.noCollide) addCollider({ type: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, bottom: y, top: y + h, walkable: !!o.walkable, mat: o.cm || SM[key].cm });
    return { y, h, top: y + h };
  },

  cyl(cx, cz, r, h, key, o = {}) {
    const y = o.y !== undefined ? o.y : terrainHeight(cx, cz) - 0.25, hh = o.y !== undefined ? h : h + 0.25;
    const geo = new THREE.CylinderGeometry(o.rt !== undefined ? o.rt : r, r, hh, o.seg || 14), m = new THREE.Matrix4();
    m.makeTranslation(cx, y + hh / 2, cz);
    this.add(geo, key, m);
    if (!o.noCollide) addCollider({ type: 'circle', x: cx, z: cz, r, bottom: y, top: y + hh, mat: o.cm || SM[key].cm });
    return { y, top: y + hh };
  },

  // horizontal cylinder along X (tanks, pipes, fuselage) with a box collider
  htank(cx, cz, len, r, key, o = {}) {
    const y = o.y !== undefined ? o.y : terrainHeight(cx, cz) + (o.lift || 0);
    const geo = new THREE.CylinderGeometry(r, r, len, 16).rotateZ(Math.PI / 2), m = new THREE.Matrix4();
    m.makeTranslation(cx, y + r, cz);
    this.add(geo, key, m);
    if (!o.noCollide) addCollider({ type: 'box', minX: cx - len / 2, maxX: cx + len / 2, minZ: cz - r, maxZ: cz + r, bottom: y, top: y + r * 2, walkable: !!o.walkable, mat: SM[key].cm });
  },

  sphere(cx, y, cz, r, key, sy = 1) {
    const geo = new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(cx, y, cz), new THREE.Quaternion(), new THREE.Vector3(1, sy, 1));
    this.add(geo, key, m);
  },

  // gable roof prism; ridge runs along x when alongX, otherwise along z
  gable(cx, cz, w, d, baseY, rise, key, alongX) {
    const hw = (alongX ? d : w) / 2 + 0.45, len = (alongX ? w : d) + 0.8;
    const sh = new THREE.Shape(); sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(0, rise); sh.lineTo(-hw, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
    geo.translate(0, 0, -len / 2);
    if (alongX) geo.rotateY(Math.PI / 2);
    const m = new THREE.Matrix4(); m.makeTranslation(cx, baseY, cz);
    this.add(geo, key, m);
  },

  // arbitrary non-colliding piece
  piece(geo, key, x, y, z, ry = 0, rx = 0, rz = 0) {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    this.add(geo, key, m);
  },

  spot(x, z, tier, y) { World.lootSpots.push({ x, z, y: y !== undefined ? y : terrainHeight(x, z), tier }); },

  // ---------- composite structures ----------
  // wall along one axis with rectangular openings: [{c: centre offset, w, y0, y1}]
  wall(cx, cz, len, axis, H, t, key, openings = [], y0) {
    const base = y0 !== undefined ? y0 : null;
    const put = (a0, a1, b0, b1) => {          // a = along wall (centre-relative), b = height range
      if (a1 - a0 < 0.02 || b1 - b0 < 0.02) return;
      const mid = (a0 + a1) / 2, l = a1 - a0, h = b1 - b0;
      const x = axis === 'x' ? cx + mid : cx, z = axis === 'x' ? cz : cz + mid;
      const w = axis === 'x' ? l : t, d = axis === 'x' ? t : l;
      if (b0 <= 0.001 && base === null) this.box(x, z, w, d, h, key); else this.box(x, z, w, d, h, key, { y: (base !== null ? base : terrainHeight(x, z)) + b0 });
    };
    const ops = openings.slice().sort((a, b) => a.c - b.c);
    let cur = -len / 2;
    for (const o of ops) {
      const a0 = o.c - o.w / 2, a1 = o.c + o.w / 2;
      put(cur, a0, 0, H); put(a0, a1, 0, o.y0); put(a0, a1, o.y1, H);
      cur = a1;
    }
    put(cur, len / 2, 0, H);
  },

  house(cx, cz, w, d, o = {}) {
    const H = 3.0, t = 0.35, door = o.door || '+z', wk = o.wall || 'plasterA', rk = o.roof || 'roofRed';
    const base = terrainHeight(cx, cz);
    this.box(cx, cz, w + 0.3, d + 0.3, 0.25, 'concreteWarm', { walkable: true });
    const fl = base + 0.25;
    const dw = 1.3, win = (n, L) => { const arr = []; const cnt = Math.max(1, Math.floor(L / 3.4)); for (let i = 0; i < cnt; i++) arr.push({ c: (i - (cnt - 1) / 2) * (L / cnt), w: 1.3, y0: 1.0, y1: 2.2 }); return arr; };
    const side = (s, axis, len, x, z) => {
      let op = win(0, len - 1.2);
      if (door === s) op = [{ c: 0, w: dw, y0: 0, y1: 2.25 }, ...win(0, len - 1.2).filter(x2 => Math.abs(x2.c) > 1.8)];
      this.wall(x, z, len, axis, H, t, wk, op, fl);
      // window frames + glass, door frame and an ajar door
      for (const o of op) {
        const isDoor = o.y0 === 0, cx2 = axis === 'x' ? x + o.c : x, cz2 = axis === 'x' ? z : z + o.c, w = axis === 'x' ? o.w : t, d = axis === 'x' ? t : o.w;
        const fx = (a, b, c, e, f, g) => this.box(cx2 + a, cz2 + b, c, e, f, 'woodDark', { y: fl + g, noCollide: true });
        const th = 0.07, hh = o.y1 - o.y0;
        if (axis === 'x') { fx(0, 0, o.w + 0.14, t + 0.06, th, o.y1); if (!isDoor) fx(0, 0, o.w + 0.14, t + 0.06, th, o.y0 - th); fx(-o.w / 2 - th / 2, 0, th, t + 0.06, hh, o.y0); fx(o.w / 2 + th / 2, 0, th, t + 0.06, hh, o.y0); }
        else { fx(0, 0, t + 0.06, o.w + 0.14, th, o.y1); if (!isDoor) fx(0, 0, t + 0.06, o.w + 0.14, th, o.y0 - th); fx(0, -o.w / 2 - th / 2, t + 0.06, th, hh, o.y0); fx(0, o.w / 2 + th / 2, t + 0.06, th, hh, o.y0); }
        if (!isDoor) this.box(cx2, cz2, w * 0.98, d * 0.3, hh, 'glass', { y: fl + o.y0, noCollide: true });
        else {
          const hinge = -o.w / 2, dr = new THREE.BoxGeometry(o.w * 0.9, o.y1 - 0.05, 0.05);
          const outward = (s === '+z' || s === '+x') ? 1 : -1;
          if (axis === 'x') this.piece(dr, 'woodDark', cx2 + hinge + o.w * 0.15, fl + (o.y1 - 0.05) / 2, cz2 + outward * (o.w * 0.35), 1.1 * outward);
          else this.piece(dr, 'woodDark', cx2 + outward * (o.w * 0.35), fl + (o.y1 - 0.05) / 2, cz2 + hinge + o.w * 0.15, Math.PI / 2 + 1.1 * outward);
        }
      }
    };
    side('+z', 'x', w, cx, cz + d / 2 - t / 2); side('-z', 'x', w, cx, cz - d / 2 + t / 2);
    side('+x', 'z', d - 2 * t, cx + w / 2 - t / 2, cz); side('-x', 'z', d - 2 * t, cx - w / 2 + t / 2, cz);
    this.box(cx, cz, w + 0.2, d + 0.2, 0.3, wk, { y: fl + H });                       // ceiling slab (collider)
    this.gable(cx, cz, w, d, fl + H + 0.3, Math.min(w, d) * 0.28, rk, w >= d);
    if (w > 7.5 && o.chimney !== false) this.box(cx + w * 0.28 * (w >= d ? 1 : 0), cz + d * 0.28 * (w >= d ? 0 : 1), 0.7, 0.7, Math.min(w, d) * 0.28 + 1.4, 'concreteDark', { y: fl + H, noCollide: true });
    // furniture
    this.box(cx + w * 0.22, cz - d * 0.2, 1.4, 0.8, 0.8, 'wood', { y: fl, walkable: true });
    this.box(cx - w * 0.3, cz - d * 0.28, 0.6, 1.6, 1.8, 'woodDark', { y: fl });
    if (w > 7) this.box(cx - w * 0.2, cz + d * 0.28, 2.0, 0.9, 0.5, 'woodDark', { y: fl, walkable: true });
    addExcl(cx, cz, Math.max(w, d) * 0.75 + 2);
    this.spot(cx - w * 0.1, cz + d * 0.05, o.tier || 1, fl);
  },

  crate(cx, cz, s, key = 'wood') { return this.box(cx, cz, s, s, s, key, { walkable: true }); },

  crateStack(cx, cz, n, key = 'wood') {
    const base = terrainHeight(cx, cz);
    for (let i = 0; i < n; i++) {
      const s = 0.9 + ((i * 37) % 5) * 0.1, x = cx + (i % 3) * 1.5, z = cz + Math.floor(i / 3) * 1.5;
      this.box(x, z, s, s, s, key, { y: terrainHeight(x, z), walkable: true, rotY: (i % 3) * 0.15 });
    }
    if (n >= 4) this.box(cx + 0.7, cz + 0.2, 0.9, 0.9, 0.9, key, { y: base + 1.0, walkable: true });
  },

  barrel(cx, cz, key = 'metalRed') { this.cyl(cx, cz, 0.3, 0.95, key, { seg: 12 }); },

  stairs(x, z, axis, dir, steps, width, len, key, base, rise = 0.6) {
    for (let i = 0; i < steps; i++) {
      const off = dir * i * len, px = axis === 'x' ? x + off : x, pz = axis === 'z' ? z + off : z;
      this.box(px, pz, axis === 'x' ? len : width, axis === 'x' ? width : len, rise * (i + 1), key, { y: base, walkable: true });
    }
  },

  tower(cx, cz, key = 'concreteDark') {
    const base = terrainHeight(cx, cz), top = 6.0;
    for (const [ox, oz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) this.box(cx + ox, cz + oz, 0.8, 0.8, 5.6, key, { y: base });
    this.box(cx, cz, 8, 8, 0.4, key, { y: base + top - 0.4, walkable: true });
    this.box(cx, cz - 3.8, 8, 0.3, 1.1, key, { y: base + top });
    this.box(cx - 3.8, cz, 0.3, 8, 1.1, key, { y: base + top });
    this.box(cx, cz + 3.8, 8, 0.3, 1.1, key, { y: base + top });
    this.box(cx + 3.8, cz - 2.2, 0.3, 3.6, 1.1, key, { y: base + top });
    this.box(cx + 3.8, cz + 2.2, 0.3, 3.6, 1.1, key, { y: base + top });
    this.stairs(cx + 4.5 + 9, cz, 'x', -1, 10, 2, 1, key, base);
    this.box(cx - 2, cz + 1.5, 3, 3, 0.25, 'canvas', { y: base + top + 2.6, noCollide: true });
    this.spot(cx, cz, 3, base + top);
    addExcl(cx + 6, cz, 12);
  },

  tank(cx, cz, key = 'olive', ry = 0) {
    const base = terrainHeight(cx, cz);
    this.box(cx, cz, 7, 3.4, 1.7, key, { y: base + 0.5, rotY: 0 });
    this.box(cx, cz - 1.75, 7.2, 0.6, 1.0, 'rubber', { y: base, noCollide: true });
    this.box(cx, cz + 1.75, 7.2, 0.6, 1.0, 'rubber', { y: base, noCollide: true });
    this.cyl(cx - 0.5, cz, 1.3, 0.9, key, { y: base + 2.2, rt: 1.15, noCollide: true, seg: 16 });
    const bar = new THREE.CylinderGeometry(0.15, 0.17, 4.6, 10).rotateZ(Math.PI / 2);
    this.piece(bar, 'steel', cx + 2.4, base + 2.7, cz, 0);
  },

  car(cx, cz, key = 'metalBlue', ry = 0) {
    const base = terrainHeight(cx, cz);
    this.box(cx, cz, 4.3, 1.9, 0.9, key, { y: base + 0.35, rotY: ry });
    this.box(cx - 0.3, cz, 2.4, 1.8, 0.7, key, { y: base + 1.25, noCollide: true, rotY: ry });
    for (const [ox, oz] of [[-1.4, -0.95], [1.4, -0.95], [-1.4, 0.95], [1.4, 0.95]]) {
      const c = Math.cos(ry), s = Math.sin(ry);
      this.piece(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12).rotateX(Math.PI / 2), 'rubber', cx + ox * c - oz * s, base + 0.38, cz + ox * s + oz * c, ry);
    }
  },

  container(cx, cz, key = 'metalRed', alongX = true, level = 0) {
    const L = 6.1, W = 2.45, Hh = 2.6, base = terrainHeight(cx, cz) + level * Hh;
    const w = alongX ? L : W, d = alongX ? W : L;
    this.box(cx, cz, w, d, Hh, key, level ? { y: base, walkable: true } : { walkable: true });
    this.box(cx, cz, w + 0.06, d + 0.06, 0.12, 'steel', { y: base + (level ? 0 : 0) + Hh - 0.06, noCollide: true });
  },

  fence(x1, z1, x2, z2, key = 'woodDark', h = 1.3) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const x = lerp(x1, x2, i / n), z = lerp(z1, z2, i / n);
      this.box(x, z, 0.14, 0.14, h + 0.2, key, { noCollide: i % 2 === 1 });
    }
    const ax = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, y = Math.min(terrainHeight(x1, z1), terrainHeight(x2, z2));
    if (ax) { this.box(mx, mz, len, 0.07, 0.09, key, { y: y + h * 0.9, noCollide: true }); this.box(mx, mz, len, 0.07, 0.09, key, { y: y + h * 0.5, noCollide: true }); }
    else { this.box(mx, mz, 0.07, len, 0.09, key, { y: y + h * 0.9, noCollide: true }); this.box(mx, mz, 0.07, len, 0.09, key, { y: y + h * 0.5, noCollide: true }); }
  },

  pole(cx, cz, h = 8) {
    this.cyl(cx, cz, 0.16, h, 'woodDark', { seg: 8 });
    this.box(cx, cz, 2.4, 0.12, 0.12, 'woodDark', { y: terrainHeight(cx, cz) + h - 0.8, noCollide: true });
  },

  sandbags(cx, cz, len, alongX = true, h = 1.2) {
    const t = 0.9, rows = Math.max(2, Math.round(h / 0.3));
    for (let r = 0; r < rows; r++) {
      const inset = r * 0.06;
      if (alongX) this.box(cx, cz, len - inset * 2, t - inset, 0.3, 'sandbag', { y: terrainHeight(cx, cz) + r * 0.3 + (r ? 0 : -0.25), noCollide: r > 0 });
      else this.box(cx, cz, t - inset, len - inset * 2, 0.3, 'sandbag', { y: terrainHeight(cx, cz) + r * 0.3 + (r ? 0 : -0.25), noCollide: r > 0 });
    }
    // collider for the whole stack
    addCollider({ type: 'box', minX: cx - (alongX ? len : t) / 2, maxX: cx + (alongX ? len : t) / 2, minZ: cz - (alongX ? t : len) / 2, maxZ: cz + (alongX ? t : len) / 2, bottom: terrainHeight(cx, cz) - 0.3, top: terrainHeight(cx, cz) + rows * 0.3 - 0.25, mat: 'concrete' });
  },

  barrier(cx, cz, alongX = true) {
    if (alongX) { this.box(cx, cz, 3.2, 0.8, 1.15, 'concrete'); this.box(cx, cz, 3.2, 0.3, 0.4, 'concrete', { noCollide: true, y: terrainHeight(cx, cz) + 1.15 }); }
    else { this.box(cx, cz, 0.8, 3.2, 1.15, 'concrete'); this.box(cx, cz, 0.3, 3.2, 0.4, 'concrete', { noCollide: true, y: terrainHeight(cx, cz) + 1.15 }); }
  },

  hedgehog(cx, cz) {
    const y = terrainHeight(cx, cz) + 0.5;
    for (const [rx, rz] of [[0.8, 0], [0, 0.8], [0.7, 0.7]]) this.piece(new THREE.BoxGeometry(0.12, 1.5, 0.12), 'steel', cx, y, cz, 0, rx, rz);
    addCollider({ type: 'circle', x: cx, z: cz, r: 0.55, bottom: y - 0.5, top: y + 0.7, mat: 'metal' });
  },

  build(scene) {
    this.begin(scene);
    this.buildPOIs();
    this.flush();
  }
};
