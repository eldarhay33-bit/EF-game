// Bot actors: body, parachute drop, loot inventory, damage and death. Decision making lives in botai.js.
const BOT_NAMES = ['Falcon', 'Viper', 'Ghost', 'Rook', 'Echo', 'Nomad', 'Titan', 'Raven', 'Dune', 'Frost', 'Blaze', 'Hawk', 'Storm', 'Cobra', 'Wolf', 'Onyx', 'Drift', 'Saber', 'Ember', 'Zephyr'];

const Mover = {
  move(a, vx, vz, dt, height = 1.75) {
    const ox = a.pos.x, oz = a.pos.z;
    a.pos.x += vx * dt; a.pos.z += vz * dt;
    const g0 = aheadGround(a.pos, vx, vz);
    if (g0 > a.pos.y && g0 - a.pos.y <= 0.75) a.pos.y = g0;
    pushOutOfColliders(a.pos, 0.4, a.crouch ? 1.2 : height);
    const g1 = groundAt(a.pos.x, a.pos.z, a.pos.y);
    if (g1 - a.pos.y > 1.1 && a.onGround) { a.pos.x = ox; a.pos.z = oz; }
    a.pos.x = clamp(a.pos.x, -MAP.half + 3, MAP.half - 3); a.pos.z = clamp(a.pos.z, -MAP.half + 3, MAP.half - 3);
    let ground = groundAt(a.pos.x, a.pos.z, a.pos.y);
    const depth = waterDepth(a.pos.x, a.pos.z);
    if (depth > 1.2) ground = Math.max(ground, WATER_Y - 1.15);
    if (a.onGround) { if (a.pos.y - ground > 0.7) a.onGround = false; else a.pos.y = ground; }
    if (!a.onGround) {
      a.vy -= 20 * dt; a.pos.y += a.vy * dt;
      const g2 = Math.max(groundAt(a.pos.x, a.pos.z, a.pos.y - a.vy * dt), depth > 1.2 ? WATER_Y - 1.15 : -99);
      if (a.pos.y <= g2) { a.pos.y = g2; a.vy = 0; a.onGround = true; }
    }
    const moved = Math.hypot(a.pos.x - ox, a.pos.z - oz), want = Math.hypot(vx, vz) * dt;
    return want > 0.001 && moved < want * 0.35;
  }
};

class Bot {
  constructor(idx) {
    this.isBot = true; this.idx = idx;
    this.name = BOT_NAMES[idx % BOT_NAMES.length] + (idx >= BOT_NAMES.length ? Math.floor(idx / BOT_NAMES.length) + 1 : '');
    this.pos = new THREE.Vector3(); this.vy = 0; this.onGround = false; this.yaw = Math.random() * 6.28; this.aimPitch = 0;
    this.alive = true; this.crouch = false; this.riding = false; this.bike = null;
    const diff = DIFFICULTY[Settings.get('difficulty')] || DIFFICULTY.normal; this.diff = diff;
    this.health = 100 * diff.hp; this.maxHealth = this.health; this.shield = 0; this.dmgScale = diff.dmg;
    this.skinId = SKINS[Math.floor(Math.random() * SKINS.length)].id;
    this.slots = [{ w: Weapons.make('pistol', 0) }]; this.cur = 0; this.slots[0].w.mag = Weapons.stat(this.slots[0].w).size;
    this.ammo = { light: 45, medium: 0, shells: 0, heavy: 0, rocket: 0 }; this.meds = { small: 0, big: 0 }; this.shields = { small: 0, big: 0 }; this.nades = { frag: 0, smoke: 0, flash: 0, sticky: 0 };
    this.state = 'dropwait'; this.stateT = 0; this.enemy = null; this.lastSeen = -99; this.lastKnown = new THREE.Vector3(); this.engageT = 0; this.reactT = 0;
    this.reloadT = 0; this.lastShot = 0; this.lastFired = -99; this.burstLeft = 0; this.pauseT = 0; this.equipT = 0; this.useT = 0; this.pendingUse = null; this.blind = 0;
    this.thinkT = Math.random() * 0.3; this.dest = null; this.lootTarget = null; this.cover = null; this.peeking = false; this.peekT = 0; this.strafeDir = 1; this.strafeT = 1;
    this.speed = 0; this.vel = new THREE.Vector3(); this.stuckT = 0; this.walkDir = 0; this.nadeCd = rr(2, 8); this.rpgCd = 0; this.smokeCd = 0; this.suspect = null; this.suspectT = 0;
    this.deathT = 30; this.muzzleWorld = new THREE.Vector3(); this.lastHurt = -99; this.bikeTarget = null; this.grace = 0; this.recoil = 0;
    this.rig = Character.build(this.skinId, Math.floor(Math.random() * 4));
    this.rig.root.visible = false; G.scene.add(this.rig.root);
    this.gunKey = ''; this.chute = null; this.ghost = null;
  }

  weapon() { const s = this.slots[this.cur]; return s ? s.w : null; }
  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + (this.crouch ? 1.15 : this.riding ? 1.35 : 1.6), this.pos.z); }
  get isSniping() { const w = this.weapon(); return !!w && (w.id === 'sniper' || w.id === 'dmr' || w.id === 'special'); }

  // ---------- drop from the plane ----------
  prepareDrop(delay) {
    this.state = 'dropwait'; this.dropAt = delay; this.rig.root.visible = false;
  }

  startDrop(planePos, target) {
    this.pos.set(planePos.x + mr(-6, 6), 168, planePos.z + mr(-6, 6)); this.target = target;
    this.state = 'drop'; this.dropPhase = 'free'; this.dropVel = new THREE.Vector3(0, -6, 0); this.rig.root.visible = true; this.onGround = false;
    this.rig.setShadows(false);
  }

  updateDrop(dt) {
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    const gh = groundAt(this.pos.x, this.pos.z, this.pos.y + 2), above = this.pos.y - gh;
    if (this.dropPhase === 'free' && (above < 75 || (dist < 14 && above < 110))) { this.dropPhase = 'glide'; this.makeChute(); }
    const horiz = this.dropPhase === 'free' ? 24 : 13.5, vy = this.dropPhase === 'free' ? -48 : -6.2;
    const k = Math.min(1, dist / 6);
    this.dropVel.x = lerp(this.dropVel.x, dx / dist * horiz * k, Math.min(1, dt * 1.6)); this.dropVel.z = lerp(this.dropVel.z, dz / dist * horiz * k, Math.min(1, dt * 1.6));
    this.dropVel.y = lerp(this.dropVel.y, vy, Math.min(1, dt * 1.2));
    this.pos.addScaledVector(this.dropVel, dt);
    this.yaw = Math.atan2(-this.dropVel.x, -this.dropVel.z);
    if (this.pos.y <= gh + 0.05) {
      this.pos.y = gh; this.state = 'loot'; this.onGround = true; this.vy = 0; this.removeChute(); this.grace = rr(...this.diff.grace); this.rig.setShadows(true);
      this.pushSafe();
    }
    this.syncRig(dt, { drop: this.dropPhase });
    if (this.chute) { this.chute.position.set(this.pos.x, this.pos.y + 3.6, this.pos.z); this.chute.rotation.y = this.yaw; }
  }

  makeChute() {
    if (this.chute) return;
    const g = new THREE.Group(), col = new THREE.Color().setHSL(Math.random(), 0.55, 0.5);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, side: THREE.DoubleSide }));
    dome.position.y = 1.0; dome.castShadow = true; g.add(dome);
    const lines = [], p0 = new THREE.Vector3();
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; lines.push(new THREE.Vector3(Math.cos(a) * 2, 1.0, Math.sin(a) * 2), new THREE.Vector3(0, -3.2, 0)); }
    const lm = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0xdddddd })); g.add(lm);
    G.scene.add(g); this.chute = g;
  }
  removeChute() { if (this.chute) { G.scene.remove(this.chute); this.chute = null; } }

  pushSafe() {
    pushOutOfColliders(this.pos, 0.6);
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 2);
    if (waterDepth(this.pos.x, this.pos.z) > 0.6) { const p = randomGroundPoint(); this.pos.set(p.x, terrainHeight(p.x, p.z), p.z); }
  }

  // ---------- body ----------
  syncRig(dt, extra) {
    const r = this.rig, w = this.weapon();
    const key = w ? w.id + w.rarity + w.sight : '';
    if (key !== this.gunKey) { this.gunKey = key; r.setGun(w ? GM.build(w.id, w.rarity, w.sight) : null, w ? WEAPONS[w.id].hold : 'rifle'); }
    r.root.position.set(this.pos.x, this.pos.y, this.pos.z); r.root.rotation.y = this.yaw;
    if (this.riding && this.bike) { const s = this.bike.seat(); r.root.position.set(s.x, s.y - 0.88, s.z); }
    const engaged = G.time - this.lastFired < 2.2 || (this.state === 'engage' && this.enemy);
    r.update(dt, Object.assign({
      speed: this.riding ? 0 : this.speed, fwd: this.walkDir >= 0 ? 1 : -1, crouch: this.crouch, raise: engaged ? 1 : 0, sprint: this.speed > 6.6 && !engaged, pitch: this.aimPitch,
      slide: false, air: !this.onGround && this.state !== 'drop', ride: this.riding, dead: false, reload: this.reloadT > 0 ? clamp(1 - this.reloadT / (this.reloadTotal || 2), 0, 1) : 0, drop: null, recoil: this.recoil
    }, extra || {}));
    if (r.tick) r.tick(dt);
    this.recoil = lerp(this.recoil, 0, Math.min(1, dt * 12));
  }

  // ---------- inventory ----------
  take(rec) {
    const it = rec.item;
    if (it.kind === 'weapon') {
      const w = it.w, score = Loot.weaponScore(w);
      if (this.slots.length < 3) this.slots.push({ w });
      else {
        let worst = 0; for (let i = 1; i < this.slots.length; i++) if (Loot.weaponScore(this.slots[i].w) < Loot.weaponScore(this.slots[worst].w)) worst = i;
        if (Loot.weaponScore(this.slots[worst].w) < score) this.slots[worst] = { w }; else return false;
      }
      if (!w.mag) w.mag = Weapons.stat(w).size;
      this.chooseWeapon(true);
    } else if (it.kind === 'ammo') this.ammo[it.type] = Math.min(AMMO[it.type].cap, this.ammo[it.type] + it.amount);
    else if (it.kind === 'heal') this.meds[it.size]++;
    else if (it.kind === 'shield') this.shields[it.size]++;
    else if (it.kind === 'throw') this.nades[it.type] = Math.min(5, this.nades[it.type] + it.n);
    Loot.remove(rec);
    return true;
  }

  // ---------- damage ----------
  takeDamage(amount, attacker, head, wid) {
    if (!this.alive) return;
    const sh = Math.min(this.shield, amount); this.shield -= sh; this.health -= amount - sh;
    this.lastHurt = G.time; this.useT = 0; this.pendingUse = null;
    if (this.state === 'drop' || this.state === 'dropwait') { /* invulnerable in the air handled by distance */ }
    if (attacker && attacker !== this && attacker.alive) {
      this.grace = 0; this.suspect = { x: attacker.pos.x, z: attacker.pos.z }; this.suspectT = G.time;
      if (!this.enemy || !this.canSee) { this.enemy = attacker; this.reactT = rr(...this.diff.react) * 0.45; this.engageT = 0; this.lastSeen = G.time; this.lastKnown.copy(attacker.pos); }
    }
    if (this.health <= 0) this.die(attacker, wid);
  }

  knock(dx, dz, f) { this.vel.x += dx * f; this.vel.z += dz * f; this.vy = 3; this.onGround = false; }

  die(attacker, wid) {
    this.alive = false; this.health = 0;
    if (this.riding && this.bike) { this.bike.rider = null; this.bike.speed *= 0.5; this.bike = null; this.riding = false; }
    this.removeChute();
    this.rig.setShadows(true); this.rig.update(0.5, { speed: 0, fwd: 1, crouch: false, raise: 0, sprint: false, pitch: 0, dead: true, ride: false });
    for (let i = 0; i < 8; i++) this.rig.update(0.1, { speed: 0, fwd: 1, crouch: false, raise: 0, sprint: false, pitch: 0, dead: true, ride: false });
    this.rig.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    const base = this.pos.y;
    for (const s of this.slots) if (s.w.id !== 'pistol' || Math.random() < 0.5) Loot.spawn(this.pos.x + mr(-1, 1), base, this.pos.z + mr(-1, 1), { kind: 'weapon', w: s.w });
    const w0 = this.weapon(); if (w0) Loot.spawn(this.pos.x + 0.7, base, this.pos.z, { kind: 'ammo', type: WEAPONS[w0.id].ammo, amount: AMMO[WEAPONS[w0.id].ammo].give });
    if (this.meds.small + this.meds.big > 0) Loot.spawn(this.pos.x, base, this.pos.z + 0.8, { kind: 'heal', size: this.meds.big ? 'big' : 'small' });
    if (this.nades.frag > 0) Loot.spawn(this.pos.x - 0.8, base, this.pos.z, { kind: 'throw', type: 'frag', n: this.nades.frag });
    Net.botDied(this, attacker, wid);
    Game.actorKilled(this, attacker, wid);
  }

  updateDead(dt) {
    this.deathT -= dt;
    if (this.deathT <= 0 && this.rig) { G.scene.remove(this.rig.root); this.rig = null; }
  }
}

const Bots = {
  list() { return G.bots; },

  reset() {
    for (const b of G.bots) {
      if (b.rig) { G.scene.remove(b.rig.root); b.rig.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      b.removeChute();
    }
    G.bots = [];
  },

  spawn(n) {
    this.reset();
    const spots = World.lootSpots.filter(s => s.y !== undefined);
    for (let i = 0; i < n; i++) {
      const b = new Bot(i);
      // pick a landing spot (loot location) within gliding reach of the plane route
      const delay = rr(1.5, 9.5);
      b.prepareDrop(delay);
      G.bots.push(b);
    }
  },

  // a bot that starts on the ground (duels, training). o: { name, passive, hp, diff, loadout: [{id, rarity}], ammo }
  spawnGround(x, z, yaw, o = {}) {
    const b = new Bot(G.bots.length + (o.idx || 0));
    if (o.name) b.name = o.name;
    if (o.skin) { G.scene.remove(b.rig.root); b.skinId = o.skin; b.rig = Character.build(o.skin, 0); b.rig.root.visible = false; G.scene.add(b.rig.root); b.gunKey = ''; }
    if (o.diff) { b.diff = DIFFICULTY[o.diff] || DIFFICULTY.normal; b.dmgScale = b.diff.dmg; b.health = b.maxHealth = 100 * b.diff.hp; }
    if (o.hp) b.health = b.maxHealth = o.hp;
    b.pos.set(x, groundAt(x, z, 8), z); b.yaw = yaw; b.onGround = true; b.grace = 0; b.vy = 0;
    if (o.loadout) {
      b.slots = o.loadout.map(l => { const w = Weapons.make(l.id, l.rarity); w.mag = w.size; return { w }; }); b.cur = 0;
      if (o.ammo) Object.assign(b.ammo, o.ammo);
      if (o.meds) b.meds.small = o.meds;
    }
    b.state = o.passive ? 'idle' : 'loot'; b.passive = !!o.passive;
    if (o.passive) { b.slots = []; b.cur = 0; }
    b.rig.root.visible = true; b.rig.setShadows(true);
    G.bots.push(b);
    return b;
  },

  // choose where each bot jumps / lands once the plane route is known
  assignDrops(planeStart, planeDir) {
    const spots = World.lootSpots;
    for (const b of G.bots) {
      const t = b.dropAt, jump = new THREE.Vector3(planeStart.x + planeDir.x * 38 * t, 0, planeStart.z + planeDir.z * 38 * t);
      let best = null, tries = 0;
      while (tries++ < 60) {
        const s = Math.random() < 0.75 ? spots[Math.floor(Math.random() * spots.length)] : { x: mr(-190, 190), z: mr(-190, 190) };
        const d = Math.hypot(s.x - jump.x, s.z - jump.z);
        if (d < 190 && waterDepth(s.x, s.z) < 0.3 && !G.bots.some(o => o !== b && o.target && Math.hypot(o.target.x - s.x, o.target.z - s.z) < 6)) { best = { x: s.x + mr(-6, 6), z: s.z + mr(-6, 6) }; break; }
      }
      b.target = best || { x: mr(-150, 150), z: mr(-150, 150) };
      b.jumpPos = jump;
    }
  },

  update(dt) {
    for (const b of G.bots) {
      if (!b.alive) { b.updateDead(dt); continue; }
      if (b.passive) { b.rig.root.visible = true; b.syncRig(dt); continue; }
      if (b.state === 'dropwait') { if (G.time >= b.dropAt && Player.phase !== undefined) b.startDrop(b.jumpPos || { x: 0, z: 0 }, b.target); continue; }
      if (b.state === 'drop') { b.updateDrop(dt); continue; }
      try { b.update(dt); } catch (e) {
        b.faults = (b.faults || 0) + 1;
        if (b.faults < 3) console.error('[bot]', b.name, e);
        if (b.faults > 30) { b.state = 'loot'; b.enemy = null; b.dest = null; b.lootTarget = null; b.cover = null; b.faults = 0; }
      }
    }
  },

  aliveCount() { return G.bots.filter(b => b.alive).length; }
};
