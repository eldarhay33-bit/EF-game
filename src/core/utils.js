const G = {
  scene: null, camera: null, renderer: null, composer: null,
  player: null, bots: [], colliders: [], trees: [], loot: [], smokes: [], vehicles: [], tracers: [],
  time: 0, state: 'boot', kills: 0, noises: [], quality: 'high', vmScene: null, vmCam: null
};
function addNoise(x, z, r, who) {
  G.noises.push({ x, z, r, who, t: G.time });
  if (G.noises.length > 30) G.noises.shift();
}

const MAP = { half: 220 };
const ARENA = { x: 0, z: 0, r: 46 };
const MOUNTAIN = { x: -118, z: -108, r: 78, h: 50 };
const DESERT_EDGE = 88;
const LAKE = { x: -92, z: 108, r: 34 };
const WATER_Y = -0.5;
const CRATERS = [
  { x: -16, z: -8, r: 6.5, d: 1.7 }, { x: 18, z: 14, r: 6, d: 1.5 }, { x: 22, z: -14, r: 7.5, d: 1.9 },
  { x: -26, z: 22, r: 5.5, d: 1.5 }, { x: 4, z: 30, r: 5, d: 1.3 }, { x: -6, z: -30, r: 6, d: 1.5 },
  { x: 32, z: 12, r: 4.5, d: 1.2 }, { x: -34, z: -2, r: 5, d: 1.4 }
];
const ROADS = [
  [[40, 158], [40, 140], [28, 105], [10, 70], [0, 46]],
  [[0, -46], [4, -80], [22, -115], [34, -160]],
  [[46, 0], [80, -8], [118, -30], [150, -62]],
  [[-46, 0], [-90, 4], [-130, 8], [-175, 10]],
  [[40, 140], [-10, 128], [-55, 118]]
];

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(777123);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
const rr = (a, b) => a + rand() * (b - a);
const mr = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function hash2(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) { s += a * noise2(x * f, y * f); f *= 2; a *= 0.5; }
  return s;
}

// ---------- roads ----------
const RoadSegs = [];
ROADS.forEach(line => { for (let i = 0; i < line.length - 1; i++) RoadSegs.push([line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]]); });
function distToRoad(x, z) {
  let best = 1e9;
  for (const [ax, az, bx, bz] of RoadSegs) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

// ---------- terrain ----------
function desertAmount(x, z) {
  const edge = DESERT_EDGE + (fbm(z * 0.012, 3.3, 3) - 0.5) * 40;
  return smoothstep(edge - 16, edge + 16, x);
}

// special arenas (duel / training) replace the open world with a flat floor
const Flat = { on: false, y: 0, surf: 'gravel' };

// swimmable sea along the whole south edge of the map (mountains rise on the north side)
function coastZ(x) { return 176 + (fbm(x * 0.011 + 11, 2.2, 3) - 0.5) * 30 + Math.sin(x * 0.02) * 6; }
function seaAmount(x, z) { const c = coastZ(x); return smoothstep(c - 6, c + 22, z); }

function terrainHeightRaw(x, z) {
  if (Flat.on) return Flat.y;
  let h =(fbm(x * 0.009 + 3.1, z * 0.009 + 7.7, 4) - 0.5) * 14 + 3.2;
  if (h < 1.6) h = 1.6 - (1.6 - h) * 0.3;
  const d = desertAmount(x, z);
  if (d > 0) {
    const dunes = Math.sin(x * 0.05 + fbm(x * 0.01, z * 0.01, 3) * 7) * 2.2 + (fbm(x * 0.02 + 50, z * 0.02, 3) - 0.5) * 7 + 2;
    h = lerp(h, dunes, d);
  }
  const md = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) / MOUNTAIN.r;
  if (md < 1) {
    const t = 1 - md, ridge = 1 - Math.abs(noise2(x * 0.045, z * 0.045) * 2 - 1);
    h += MOUNTAIN.h * t * t * (3 - 2 * t) * (0.62 + 0.55 * ridge + 0.25 * fbm(x * 0.09, z * 0.09, 2));
  }
  const ad = Math.hypot(x - ARENA.x, z - ARENA.z);
  h = lerp(h, 1.5, 1 - smoothstep(ARENA.r, ARENA.r + 26, ad));
  for (const c of CRATERS) {
    const cd = Math.hypot(x - c.x, z - c.z) / c.r;
    if (cd < 1) h -= c.d * (1 - cd * cd) * (1 - cd * cd);
  }
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (ld < LAKE.r + 16) h = lerp(h, -3.2, 1 - smoothstep(LAKE.r * 0.55, LAKE.r + 14, ld));
  const sea = seaAmount(x, z);
  if (sea > 0) h = lerp(h, -5.5, sea);
  const e = Math.max(Math.abs(x), Math.abs(z)), start = MAP.half - 24;
  if (e > start) h += Math.pow((e - start) / 6, 1.6) * (1 - sea);
  return h;
}

const HG = { res: 1, n: 0, data: null, off: 0 };
function buildHeightGrid() {
  const ext = MAP.half + 12, n = Math.ceil(ext * 2 / HG.res) + 1;
  HG.n = n; HG.off = ext; HG.data = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) HG.data[j * n + i] = terrainHeightRaw(i * HG.res - ext, j * HG.res - ext);
}
function terrainHeight(x, z) {
  if (Flat.on) return Flat.y;
  if (!HG.data) return terrainHeightRaw(x, z);
  const fx = (x + HG.off) / HG.res, fz = (z + HG.off) / HG.res;
  if (fx < 0 || fz < 0 || fx >= HG.n - 1 || fz >= HG.n - 1) return terrainHeightRaw(x, z);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, n = HG.n, d = HG.data;
  const a = d[j * n + i], b = d[j * n + i + 1], c = d[(j + 1) * n + i], e = d[(j + 1) * n + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
}
function terrainNormal(x, z, out) {
  const e = 0.6, hx = terrainHeight(x + e, z) - terrainHeight(x - e, z), hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  out = out || new THREE.Vector3();
  return out.set(-hx, 2 * e, -hz).normalize();
}
const _tn = new THREE.Vector3();
function slopeAt(x, z) { return 1 - terrainNormal(x, z, _tn).y; }

function biomeAt(x, z) {
  if (Flat.on) return 'arena';
  if (Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) < MOUNTAIN.r * 0.95) return 'mountain';
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 6 || seaAmount(x, z) > 0.55) return 'lake';
  if (desertAmount(x, z) > 0.5) return 'desert';
  if (Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r + 8) return 'arena';
  return 'field';
}
function waterDepth(x, z) { return Math.max(0, WATER_Y - terrainHeight(x, z)); }

function randomGroundPoint(filter) {
  for (let i = 0; i < 80; i++) {
    const x = mr(-MAP.half + 25, MAP.half - 25), z = mr(-MAP.half + 25, MAP.half - 25);
    if (waterDepth(x, z) > 0.05) continue;
    if (!filter || filter(x, z)) return { x, z };
  }
  return { x: 0, z: 0 };
}

// ---------- colliders on a spatial grid ----------
const Grid = {
  cell: 10, map: new Map(), qid: 0,
  key(ix, iz) { return (ix + 100) * 400 + (iz + 100); },
  add(c) {
    const s = this.cell;
    for (let ix = Math.floor(c.minX / s); ix <= Math.floor(c.maxX / s); ix++)
      for (let iz = Math.floor(c.minZ / s); iz <= Math.floor(c.maxZ / s); iz++) {
        const k = this.key(ix, iz); let a = this.map.get(k);
        if (!a) { a = []; this.map.set(k, a); }
        a.push(c);
      }
  },
  query(x0, z0, x1, z1) {
    const s = this.cell, out = [], q = ++this.qid;
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++)
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const a = this.map.get(this.key(ix, iz)); if (!a) continue;
        for (const c of a) if (c._q !== q) { c._q = q; out.push(c); }
      }
    return out;
  },
  clear() { this.map.clear(); }
};

function addCollider(c) {
  if (c.type === 'circle') { c.minX = c.x - c.r; c.maxX = c.x + c.r; c.minZ = c.z - c.r; c.maxZ = c.z + c.r; }
  c.mat = c.mat || 'concrete';
  G.colliders.push(c); Grid.add(c);
  return c;
}
function clearColliders() { G.colliders.length = 0; Grid.clear(); }

function groundAt(x, z, y) {
  let h = terrainHeight(x, z);
  const near = Grid.query(x, z, x, z);
  for (const c of near) {
    if (c.type !== 'box' || !c.walkable) continue;
    if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && y >= c.top - 0.7) h = Math.max(h, c.top);
  }
  return h;
}

// ground height at the actor and half a metre ahead, so stairs are climbed before the collision radius touches them
function aheadGround(pos, vx, vz) {
  let g = groundAt(pos.x, pos.z, pos.y);
  const l = Math.hypot(vx, vz);
  if (l > 0.01) g = Math.max(g, groundAt(pos.x + vx / l * 0.5, pos.z + vz / l * 0.5, pos.y));
  return g;
}

function pushOutOfColliders(pos, radius, height = 1.7) {
  const near = Grid.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
  for (const c of near) {
    if (c.type === 'circle') {
      if (pos.y >= c.top - 0.1 || pos.y + height < c.bottom) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = radius + c.r;
      if (d < m && d > 0.0001) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; }
    } else {
      if (pos.y >= c.top - 0.2 || pos.y + height < c.bottom) continue;
      const nx = clamp(pos.x, c.minX, c.maxX), nz = clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - nx, dz = pos.z - nz, d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.00001) { const d = Math.sqrt(d2); pos.x = nx + dx / d * radius; pos.z = nz + dz / d * radius; }
        else {
          const l = pos.x - c.minX, r = c.maxX - pos.x, t = pos.z - c.minZ, b = c.maxZ - pos.z, m = Math.min(l, r, t, b);
          if (m === l) pos.x = c.minX - radius; else if (m === r) pos.x = c.maxX + radius;
          else if (m === t) pos.z = c.minZ - radius; else pos.z = c.maxZ + radius;
        }
      }
    }
  }
}

// ---------- rays ----------
const _rn = { x: 0, y: 1, z: 0 };
function rayBoxes(origin, dir, maxDist) {
  let best = maxDist, hit = null, nx = 0, ny = 0, nz = 0;
  const ex = origin.x + dir.x * maxDist, ez = origin.z + dir.z * maxDist, ey = origin.y + dir.y * maxDist;
  const x0 = Math.min(origin.x, ex), x1 = Math.max(origin.x, ex), z0 = Math.min(origin.z, ez), z1 = Math.max(origin.z, ez);
  const y0 = Math.min(origin.y, ey), y1 = Math.max(origin.y, ey);
  for (const c of G.colliders) {
    if (c.maxX < x0 || c.minX > x1 || c.maxZ < z0 || c.minZ > z1 || c.top < y0 || c.bottom > y1) continue;
    if (c.type === 'circle') {
      const ox = origin.x - c.x, oz = origin.z - c.z;
      const a = dir.x * dir.x + dir.z * dir.z; if (a < 1e-8) continue;
      const b = 2 * (ox * dir.x + oz * dir.z), cc = ox * ox + oz * oz - c.r * c.r;
      const disc = b * b - 4 * a * cc; if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t > 0 && t < best) {
        const y = origin.y + dir.y * t;
        if (y > c.bottom && y < c.top) { best = t; hit = c; nx = (ox + dir.x * t) / c.r; nz = (oz + dir.z * t) / c.r; ny = 0; }
      }
    } else {
      let tmin = 0, tmax = best, axis = -1, sgn = 1;
      const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z];
      const mn = [c.minX, c.bottom, c.minZ], mx = [c.maxX, c.top, c.maxZ];
      let ok = true;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-8) { if (o[i] < mn[i] || o[i] > mx[i]) { ok = false; break; } }
        else {
          let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i], s = -1;
          if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = i; sgn = s; }
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && tmin > 0 && tmin < best) {
        best = tmin; hit = c; nx = ny = nz = 0;
        if (axis === 0) nx = sgn; else if (axis === 1) ny = sgn; else nz = sgn;
      }
    }
  }
  _rn.x = nx; _rn.y = ny; _rn.z = nz;
  return { dist: best, hit, normal: _rn };
}

function rayTerrain(origin, dir, maxDist) {
  let prev = 0;
  for (let t = 1.5; t < maxDist + 3; t += (t < 80 ? 1.5 : 4)) {
    const tt = Math.min(t, maxDist);
    const x = origin.x + dir.x * tt, y = origin.y + dir.y * tt, z = origin.z + dir.z * tt;
    if (y < terrainHeight(x, z)) {
      let lo = prev, hi = tt;
      for (let i = 0; i < 6; i++) {
        const m = (lo + hi) / 2;
        if (origin.y + dir.y * m < terrainHeight(origin.x + dir.x * m, origin.z + dir.z * m)) hi = m; else lo = m;
      }
      return hi;
    }
    prev = tt;
    if (tt >= maxDist) break;
  }
  return maxDist;
}

function segmentHitsSmoke(a, b) {
  if (!G.smokes.length) return false;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l2 = dx * dx + dy * dy + dz * dz || 1;
  for (const s of G.smokes) {
    const t = clamp(((s.x - a.x) * dx + (s.y - a.y) * dy + (s.z - a.z) * dz) / l2, 0, 1);
    const px = a.x + dx * t - s.x, py = a.y + dy * t - s.y, pz = a.z + dz * t - s.z;
    if (px * px + py * py + pz * pz < s.r * s.r) return true;
  }
  return false;
}

function hasLineOfSight(a, b, ignoreSmoke) {
  const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z), len = dir.length();
  dir.normalize();
  if (rayBoxes(a, dir, len).dist < len - 0.5) return false;
  if (rayTerrain(a, dir, len) < len - 0.5) return false;
  if (!ignoreSmoke && segmentHitsSmoke(a, b)) return false;
  return true;
}

function surfaceAt(x, z, y) {
  if (waterDepth(x, z) > 0.08) return 'water';
  const near = Grid.query(x, z, x, z);
  for (const c of near) {
    if (c.type === 'box' && c.walkable && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && Math.abs(y - c.top) < 0.4) return c.mat === 'wood' ? 'wood' : c.mat === 'metal' ? 'metal' : 'concrete';
  }
  if (Flat.on) return Flat.surf;
  if (distToRoad(x, z) < 2.6) return 'gravel';
  const b = biomeAt(x, z);
  if (b === 'desert') return 'sand';
  if (b === 'mountain' && (terrainHeight(x, z) > 14 || slopeAt(x, z) > 0.12)) return 'rock';
  if (b === 'arena') return 'gravel';
  return 'grass';
}

// areas reserved by hand-placed structures: nature and loot scatter skip these
const Excl = [];
function addExcl(x, z, r) { Excl.push({ x, z, r }); }
function inExcl(x, z, margin = 0) { for (const e of Excl) if (Math.hypot(x - e.x, z - e.z) < e.r + margin) return true; return false; }

function srgbHex(r, g, b) { return (Math.round(clamp(r, 0, 1) * 255) << 16) | (Math.round(clamp(g, 0, 1) * 255) << 8) | Math.round(clamp(b, 0, 1) * 255); }
