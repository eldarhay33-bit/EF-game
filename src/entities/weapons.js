// Weapon table, rarity/stat helpers, loot rolling and the shared hit-scan combat code used by the player and bots.
const WEAPONS = {
  pistol:      { name: '',      mode: '', hold: 'pistol',   dmg: 21, rate: 0.19, auto: false, mag: 15, reload: 1.35, ammo: 'light',  spread: 0.013, ads: 0.004, range: 150, fall: [30, 95, 0.55],  pellets: 1,  rv: 0.016, rh: 0.006, move: 1.0,  head: 1.7, snd: 'pistol',  eq: 0.2,  sights: ['iron', 'iron', 'reddot', 'reddot', 'holo'],  w: 14 },
  revolver:    { name: '',    mode: '',    hold: 'pistol',   dmg: 62, rate: 0.5,  auto: false, mag: 6,  reload: 2.6,  ammo: 'medium', spread: 0.01,  ads: 0.002, range: 180, fall: [40, 120, 0.6],  pellets: 1,  rv: 0.06,  rh: 0.012, move: 0.98, head: 1.8, snd: 'revolver', eq: 0.35, sights: ['iron', 'iron', 'reddot', 'reddot', 'holo'], w: 6 },
  smg:         { name: '',      mode: '',      hold: 'rifle',    dmg: 13, rate: 0.058, auto: true, mag: 32, reload: 1.8,  ammo: 'light',  spread: 0.034, ads: 0.012, range: 100, fall: [18, 70, 0.5],   pellets: 1,  rv: 0.009, rh: 0.005, move: 1.0,  head: 1.5, snd: 'smg',     eq: 0.3,  sights: ['iron', 'reddot', 'holo', 'holo', 'x2'],      w: 14 },
  ar:          { name: '',  mode: '',      hold: 'rifle',    dmg: 23, rate: 0.1,  auto: true,  mag: 30, reload: 2.1,  ammo: 'medium', spread: 0.02,  ads: 0.005, range: 240, fall: [45, 170, 0.62], pellets: 1,  rv: 0.013, rh: 0.006, move: 0.96, head: 1.6, snd: 'ar',      eq: 0.4,  sights: ['iron', 'reddot', 'holo', 'x4', 'x6'],        w: 16 },
  ak:          { name: '',      mode: '',      hold: 'rifle',    dmg: 30, rate: 0.115, auto: true, mag: 30, reload: 2.4,  ammo: 'medium', spread: 0.025, ads: 0.007, range: 220, fall: [40, 150, 0.6],  pellets: 1,  rv: 0.02,  rh: 0.01,  move: 0.94, head: 1.6, snd: 'ak',      eq: 0.4,  sights: ['iron', 'iron', 'reddot', 'holo', 'x4'],      w: 12 },
  dmr:         { name: '', mode: '', hold: 'rifle',    dmg: 49, rate: 0.26, auto: false, mag: 15, reload: 2.5,  ammo: 'medium', spread: 0.012, ads: 0.0015, range: 380, fall: [90, 280, 0.75], pellets: 1, rv: 0.03,  rh: 0.008, move: 0.92, head: 1.9, snd: 'dmr',     eq: 0.5,  sights: ['iron', 'x2', 'x4', 'x6', 'x8'],              w: 6 },
  shotgun:     { name: '',  mode: '',        hold: 'rifle',    dmg: 11, rate: 0.85, auto: false, mag: 6,  reload: 0.55, ammo: 'shells', spread: 0.055, ads: 0.04,  range: 45,  fall: [8, 38, 0.2],    pellets: 10, rv: 0.07,  rh: 0.01,  move: 0.95, head: 1.3, snd: 'shotgun', eq: 0.5,  sights: ['iron', 'iron', 'reddot', 'holo', 'holo'], shell: true, pump: true, w: 11 },
  autoshotgun: { name: '', mode: '',     hold: 'rifle',    dmg: 9,  rate: 0.3,  auto: true,  mag: 10, reload: 2.9,  ammo: 'shells', spread: 0.062, ads: 0.045, range: 40,  fall: [7, 34, 0.2],    pellets: 8,  rv: 0.045, rh: 0.012, move: 0.93, head: 1.3, snd: 'autoshotgun', eq: 0.5, sights: ['iron', 'reddot', 'holo', 'holo', 'x2'], w: 7 },
  minigun:     { name: '',       mode: '',    hold: 'heavy',    dmg: 11, rate: 0.045, auto: true, mag: 150, reload: 4.5, ammo: 'medium', spread: 0.05,  ads: 0.03,  range: 160, fall: [30, 110, 0.5],  pellets: 1,  rv: 0.006, rh: 0.012, move: 0.55, head: 1.4, snd: 'minigun', eq: 0.9,  sights: ['iron'], spinup: 0.8, minRarity: 3, w: 2 },
  sniper:      { name: '',     mode: '',         hold: 'rifle',    dmg: 100, rate: 1.35, auto: false, mag: 5, reload: 3.3,  ammo: 'heavy',  spread: 0.07,  ads: 0.0004, range: 650, fall: [400, 650, 0.9], pellets: 1, rv: 0.07,  rh: 0.01,  move: 0.85, head: 2.2, snd: 'sniper',  eq: 0.7,  sights: ['x6', 'x6', 'x8', 'x8', 'x12'], bolt: true, w: 6 },
  rpg:         { name: 'RPG',          mode: '',         hold: 'launcher', dmg: 120, rate: 1.3, auto: false, mag: 1,  reload: 3.8,  ammo: 'rocket', spread: 0.03,  ads: 0.006, range: 400, fall: [999, 1000, 1],  pellets: 1,  rv: 0.08,  rh: 0.01,  move: 0.82, head: 1, snd: 'rpg',     eq: 0.9,  sights: ['iron'], rocket: true, minRarity: 2, w: 3 },
  // Phantom-X (found once in 10,000 weapon rolls): full auto, 30 rounds, never misses (the bullets bend onto the best target inside `lock` degrees), goes through walls, thermal scope shows enemies through them
  special:     { name: '', mode: '', hold: 'rifle', dmg: 95, rate: 0.085, auto: true, mag: 30, reload: 2.0, ammo: 'heavy', spread: 0, ads: 0, range: 3000, fall: [3000, 3001, 1], pellets: 1, rv: 0.004, rh: 0, move: 1.0, head: 2.4, snd: 'special', eq: 0.45, sights: ['thermal'], pierce: true, lock: 14, exotic: true, w: 0 }
};

const AMMO = {
  light:  { name: '',   cap: 240, give: 36 },
  medium: { name: '',  cap: 300, give: 40 },
  shells: { name: '', cap: 48,  give: 10 },
  heavy:  { name: '',   cap: 40,  give: 8 },
  rocket: { name: '',       cap: 6,   give: 2 }
};

const THROWABLES = {
  frag:  { name: '', fuse: 3.2, radius: 9,  dmg: 115 },
  smoke: { name: '', fuse: 1.8, radius: 9,  dmg: 0 },
  flash: { name: '', fuse: 1.6, radius: 16, dmg: 0 },
  sticky: { name: '', fuse: 2.4, radius: 11, dmg: 150 }
};

const Weapons = {
  // The Phantom-X turns up with a fixed chance of 1 in 10,000 per weapon roll, whatever the settings say. The only exception is the trial option: it puts one on the ground next to
  // the first loot spot (see Loot.populate), and a trial match does not count (no stats, rewards, missions or achievements; see Profile.match.trial). Never in online matches.
  specialChance() { return 1 / 10000; },
  trial() { return Settings.get('special') === 'test' && !(typeof Net !== 'undefined' && (Net.session || Net.coop)); },

  make(id, rarity) {
    const d = WEAPONS[id], r = rarity === undefined ? 0 : rarity;
    const sight = d.sights[Math.min(r, d.sights.length - 1)];
    const size = Math.max(1, Math.round(d.mag * RARITY[r].mag));
    return { id, rarity: r, sight, mag: size, size };
  },

  stat(w) {
    const d = WEAPONS[w.id], r = RARITY[w.rarity];
    return {
      dmg: d.dmg * r.mult, reload: d.reload * r.reload, recoil: r.recoil, size: Math.max(1, Math.round(d.mag * r.mag)),
      spread: d.spread, ads: d.ads, rate: d.rate
    };
  },

  rollRarity(tier) {
    const q = Math.random() * 100 + tier * 9;
    let acc = 0;
    const weights = [RARITY[0].w, RARITY[1].w, RARITY[2].w, RARITY[3].w, RARITY[4].w];
    // shift weights upward for better loot tiers
    for (let i = 0; i < 5; i++) { acc += weights[i]; if (q < acc) return i; }
    return 4;
  },

  roll(tier = 1) {
    if (Math.random() < this.specialChance()) return this.make('special', 5);
    const ids = Object.keys(WEAPONS).filter(k => WEAPONS[k].w > 0);
    for (let tries = 0; tries < 20; tries++) {
      let total = 0; for (const k of ids) total += WEAPONS[k].w;
      let x = Math.random() * total, id = ids[0];
      for (const k of ids) { x -= WEAPONS[k].w; if (x <= 0) { id = k; break; } }
      const r = this.rollRarity(tier), d = WEAPONS[id];
      if (d.minRarity && r < d.minRarity) { if (tier < 3 || Math.random() < 0.7) continue; }
      return this.make(id, Math.max(r, d.minRarity || 0));
    }
    return this.make('ar', 0);
  },

  label(w) { return `${WEAPONS[w.id].name} · ${RARITY[w.rarity].name}`; }
};

const Combat = {
  parts: [],

  raySphere(o, d, c, r) {
    const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
    const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : null;
  },

  rayActor(o, d, a, maxT) {
    const crouch = a.crouch ? 1 : 0, riding = a.riding;
    const hy = riding ? 1.3 : crouch ? 1.12 : 1.6, top = riding ? 1.45 : crouch ? 1.0 : 1.4;
    const ht = this.raySphere(o, d, { x: a.pos.x, y: a.pos.y + hy, z: a.pos.z }, 0.26);
    if (ht !== null && ht < maxT) return { t: ht, head: true };
    const dx = o.x - a.pos.x, dz = o.z - a.pos.z, A = d.x * d.x + d.z * d.z;
    if (A < 1e-8) return null;
    const B = 2 * (dx * d.x + dz * d.z), C = dx * dx + dz * dz - 0.44 * 0.44, disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const t = (-B - Math.sqrt(disc)) / (2 * A);
    if (t <= 0 || t >= maxT) return null;
    const y = o.y + d.y * t;
    if (y < a.pos.y || y > a.pos.y + top) return null;
    return { t, head: false };
  },

  actors() { return [G.player, ...G.bots, ...Net.actors()].filter(a => a && a.alive); },

  // the enemy closest to the line of aim inside a cone of `deg` degrees: { a, dir } with dir pointing at its head, or null
  lockTarget(origin, dir, targets, deg) {
    let best = null, bc = Math.cos(deg * Math.PI / 180);
    for (const a of targets) {
      const hy = a.riding ? 1.3 : a.crouch ? 1.12 : 1.6, tx = a.pos.x - origin.x, ty = a.pos.y + hy - origin.y, tz = a.pos.z - origin.z, l = Math.hypot(tx, ty, tz) || 1, c = (tx * dir.x + ty * dir.y + tz * dir.z) / l;
      if (c > bc) { bc = c; best = { a, dir: new THREE.Vector3(tx / l, ty / l, tz / l) }; }
    }
    return best;
  },

  // Fires one shot (all pellets) from origin along dir. Returns {hit, killed, head, dist}
  shoot(shooter, origin, dir, wpn, spread) {
    const d = WEAPONS[wpn.id], st = Weapons.stat(wpn);
    const result = { hit: false, killed: false, head: false };
    const targets = this.actors().filter(a => a !== shooter && !(a.team && a.team === shooter.team));
    Net.sendShot(shooter, origin, dir, wpn);
    const scale = shooter.dmgScale || 1;
    const lock = d.lock && shooter === G.player ? this.lockTarget(origin, dir, targets, d.lock) : null;            // the Phantom-X bends its bullets onto the target in its cone
    for (let p = 0; p < d.pellets; p++) {
      const dd = lock ? lock.dir.clone() : dir.clone();
      if (spread > 0 && !lock) { dd.x += (Math.random() - 0.5) * 2 * spread; dd.y += (Math.random() - 0.5) * 2 * spread; dd.z += (Math.random() - 0.5) * 2 * spread; dd.normalize(); }
      let range = d.range, wallT = range, wallHit = null;
      if (!d.pierce) {
        const rb = rayBoxes(origin, dd, range);
        wallT = Math.min(rb.dist, rayTerrain(origin, dd, range));
        wallHit = rb.hit && rb.dist <= wallT + 0.01 ? { hit: rb.hit, nx: rb.normal.x, ny: rb.normal.y, nz: rb.normal.z } : null;
      }
      const hits = [];
      for (const a of targets) {
        const r = this.rayActor(origin, dd, a, wallT);
        if (r && r.t < wallT) hits.push({ a, t: r.t, head: r.head });
      }
      hits.sort((x, y) => x.t - y.t);
      const cut = d.pierce ? hits : hits.slice(0, 1);
      let endT = d.pierce ? range : wallT;
      for (const h of cut) {
        let dmg = st.dmg * scale * (h.head ? d.head : 1);
        const fall = d.fall; if (h.t > fall[0]) dmg *= lerp(1, fall[2], clamp((h.t - fall[0]) / (fall[1] - fall[0]), 0, 1));
        const wasAlive = h.a.alive;
        h.a.lastHit = { head: h.head, dist: h.t };
        if (shooter === G.player && Profile.match) Profile.match.damage += Math.min(dmg, h.a.health + (h.a.shield || 0));
        h.a.takeDamage(dmg, shooter, h.head, wpn.id);
        result.hit = true; result.head = result.head || h.head;
        if (wasAlive && !h.a.alive) result.killed = true;
        FX.impactActor(origin.clone().addScaledVector(dd, h.t), dd, h.head);
        if (!d.pierce) endT = h.t;
      }
      const end = origin.clone().addScaledVector(dd, Math.min(endT, d.pierce ? 400 : endT));
      if (!cut.length && wallT < range) {
        const n = wallHit ? new THREE.Vector3(wallHit.nx, wallHit.ny, wallHit.nz) : terrainNormal(end.x, end.z);
        const kind = wallHit ? wallHit.hit.mat : surfaceAt(end.x, end.z, end.y);
        FX.impact(end, n, kind, wpn.id);
      }
      FX.tracer(origin, end, wpn.id, shooter);
      // near miss feedback for the player
      if (shooter !== G.player && !cut.some(h => h.a === G.player)) {
        const pp = G.player.pos, to = new THREE.Vector3(pp.x - origin.x, pp.y + 1.2 - origin.y, pp.z - origin.z), t = to.dot(dd);
        if (t > 3 && t < Math.min(endT, range)) { const perp = to.addScaledVector(dd, -t).length(); if (perp < 2.2) FX.whiz(origin.clone().addScaledVector(dd, t)); }
      }
    }
    return result;
  }
};
