// Bot brain: perception, looting, cover and peeking, aim with lead/error, grenades, rockets, healing, bike riding, zone rotation.
const _ZERO = new THREE.Vector3();
const velOf = a => (a.isPlayer ? a.vel : (a.mvel || _ZERO));
const IDEAL_RANGE = { pistol: 16, revolver: 22, smg: 14, ar: 28, ak: 26, dmr: 55, shotgun: 8, autoshotgun: 9, minigun: 24, sniper: 85, rpg: 40, special: 140 };

Object.assign(Bot.prototype, {
  update(dt) {
    this.grace = Math.max(0, this.grace - dt); this.blind = Math.max(0, this.blind - dt);
    this.equipT = Math.max(0, this.equipT - dt); this.nadeCd -= dt; this.smokeCd -= dt; this.rpgCd -= dt;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.22 + Math.random() * 0.12; this.sense(); this.decide(); }
    const ox = this.pos.x, oz = this.pos.z;
    if (this.riding) this.rideUpdate(dt); else this.act(dt);
    if (dt > 0) { this.mvel = this.mvel || new THREE.Vector3(); this.mvel.set((this.pos.x - ox) / dt, 0, (this.pos.z - oz) / dt); }
    const dd = Math.hypot(this.pos.x - G.camera.position.x, this.pos.z - G.camera.position.z);
    if (dd < 260) {
      this.rig.root.visible = true;
      if (dd < 100) { this.syncRig(dt); this.lodT = 0; }
      else { this.lodT = (this.lodT || 0) + dt; if (this.lodT > 0.05) { this.syncRig(this.lodT); this.lodT = 0; } }
      const sh = dd < 90; if (sh !== this.shadowOn) { this.shadowOn = sh; this.rig.setShadows(sh); }
    } else this.rig.root.visible = false;
  },

  // ---------- perception ----------
  sense() {
    const D = this.diff, w = this.weapon();
    if (this.blind > 0) { this.canSee = false; return; }
    const eye = this.eye();
    const vis = D.vision * (w && (w.id === 'sniper' || w.id === 'dmr' || WEAPONS[w.id].pierce) ? 1.5 : w && (w.id === 'shotgun' || w.id === 'smg') ? 0.75 : 1);
    let best = null, bd = Infinity;
    for (const a of Combat.actors()) {
      if (a === this || (a.state === 'drop')) continue;
      const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d >= bd || d > vis * (a.crouch ? 0.72 : 1) * (a.riding ? 1.15 : 1) * Nature.hideFactor(a)) continue;
      if (d > 14 && Math.abs(angDiff(this.yaw, Math.atan2(-dx, -dz))) > 1.4) continue;
      if (!hasLineOfSight(eye, new THREE.Vector3(a.pos.x, a.pos.y + (a.crouch ? 0.8 : 1.15), a.pos.z))) continue;
      best = a; bd = d;
    }
    if (best) {
      if (this.enemy !== best) { this.enemy = best; this.reactT = rr(...D.react); this.engageT = 0; this.useCover = Math.random() < D.cover; this.cover = null; }
      this.canSee = true; this.lastSeen = G.time; this.lastKnown.copy(best.pos);
    } else {
      this.canSee = false;
      if (this.enemy && (!this.enemy.alive || G.time - this.lastSeen > 7)) this.enemy = null;
    }
    // hearing
    if (!this.canSee && G.noises) {
      const hear = 1 + (D.vision - 75) / 90;
      for (const n of G.noises) {
        if (n.who === this || G.time - n.t > 1.1) continue;
        const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
        if (d < n.r * hear && (!this.suspect || G.time - this.suspectT > 2 || d < Math.hypot(this.suspect.x - this.pos.x, this.suspect.z - this.pos.z))) { this.suspect = { x: n.x + mr(-4, 4), z: n.z + mr(-4, 4) }; this.suspectT = G.time; }
      }
    }
  },

  // ---------- high level decisions ----------
  decide() {
    const D = this.diff, zd = Math.hypot(this.pos.x - Zone.cx, this.pos.z - Zone.cz);
    this.outside = zd > Zone.r - 6;
    if (this.riding) { if (this.enemy && this.canSee && Math.hypot(this.enemy.pos.x - this.pos.x, this.enemy.pos.z - this.pos.z) < 40) this.dismount(); return; }
    if (this.useT > 0) return;
    const hunted = this.enemy && (this.canSee || G.time - this.lastSeen < 5);
    if (!hunted && G.time - this.lastHurt > 2.5 && this.grace <= 0) this.tryHeal();
    if (hunted && this.grace <= 0 && this.hasUsableGun()) {
      if (this.state !== 'engage') { this.state = 'engage'; this.stateT = 0; this.crouch = false; }
    } else if (hunted && this.grace <= 0) {
      this.state = 'loot'; this.crouch = false; this.lootTarget = null;        // unarmed: scavenge ammo while being hunted
    } else if (Zone.r < 45 && this.grace <= 0 && this.hasUsableGun()) {
      // end game: hunt whoever is left inside the small circle
      let near = null, nd = 1e9;
      for (const a of Combat.actors()) { if (a === this || a.state === 'drop') continue; const d = Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z); if (d < nd) { nd = d; near = a; } }
      if (near) { this.state = 'search'; this.dest = { x: near.pos.x + mr(-3, 3), z: near.pos.z + mr(-3, 3) }; this.suspect = this.dest; this.suspectT = G.time; }
    } else if (this.suspect && G.time - this.suspectT < 7 && !this.outside && this.grace <= 0 && Math.random() < 0.55 + D.vision / 400 && this.hasUsableGun()) {
      this.state = 'search'; this.dest = this.suspect;
    } else if (this.outside || (Zone.state === 'shrink' && zd > Zone.r * 0.85)) {
      this.state = 'rotate'; this.crouch = false;
    } else if (this.state === 'engage' || this.state === 'search') { this.state = 'loot'; this.dest = null; this.crouch = false; }
    else if (this.state !== 'loot' && this.state !== 'rotate') this.state = 'loot';
    if (this.state === 'rotate' && !this.outside && Zone.state !== 'shrink') this.state = 'loot';
    this.maybeRide();
    if (this.state !== 'engage') this.chooseWeapon();
  },

  hasUsableGun() { return this.slots.some(s => s.w.mag > 0 || this.ammo[WEAPONS[s.w.id].ammo] > 0); },

  maybeRide() {
    if (this.riding || this.state === 'engage' || this.bikeTarget || Math.random() > 0.3) return;
    const zd = Math.hypot(this.pos.x - Zone.cx, this.pos.z - Zone.cz);
    const tripLong = this.state === 'loot' && !this.lootTarget && this.dest && Math.hypot(this.dest.x - this.pos.x, this.dest.z - this.pos.z) > 100;
    if (!((this.outside && zd > Zone.r + 20) || (this.state === 'rotate' && zd > 80) || tripLong)) return;
    const b = Vehicles.nearest(this.pos, 48);
    if (b) this.bikeTarget = b;
  },

  tryHeal() {
    if (this.health < 60 && (this.meds.big > 0 || this.meds.small > 0)) {
      const big = this.meds.big > 0 && this.health < 45;
      if (big) this.meds.big--; else if (this.meds.small > 0) this.meds.small--; else this.meds.big--;
      this.pendingUse = { hp: big ? 100 : 20, cap: big ? 100 : 75 }; this.useT = big ? 4.5 : 2.2; this.crouch = true;
    } else if (this.shield < 40 && (this.shields.small > 0 || this.shields.big > 0)) {
      const big = this.shields.big > 0 && this.shield < 20;
      if (big) this.shields.big--; else if (this.shields.small > 0) this.shields.small--; else this.shields.big--;
      this.pendingUse = { sh: big ? 50 : 25 }; this.useT = big ? 3.4 : 1.8; this.crouch = true;
    }
  },

  // ---------- movement ----------
  steer(dest, speed, dt, opts = {}) {
    const dx = dest.x - this.pos.x, dz = dest.z - this.pos.z, dist = Math.hypot(dx, dz), arrive = opts.arrive || 1.6;
    if (dist < arrive) { this.stepTo(0, 0, this.yaw, dt); return true; }
    let want = Math.atan2(-dx, -dz);
    // whisker avoidance (cached for a few frames)
    this.whiskT = (this.whiskT || 0) - dt;
    if (this.whiskT <= 0) {
      this.whiskT = 0.12; this.avoid = 0;
      const o = new THREE.Vector3(this.pos.x, this.pos.y + 0.7, this.pos.z), look = Math.min(2.6, dist);
      for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
        const a = want + off, dir = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
        const px = this.pos.x + dir.x * look, pz = this.pos.z + dir.z * look;
        const blocked = rayBoxes(o, dir, look).dist < look - 0.1 || waterDepth(px, pz) > 0.55 || terrainHeight(px, pz) - this.pos.y > 1.3;
        if (!blocked) { this.avoid = off; break; }
        if (off === -1.4) this.avoid = (this.stuckSide || (this.stuckSide = Math.random() < 0.5 ? 1 : -1)) * 2.2;
      }
    }
    this.stepTo(speed, this.avoid, want, dt, opts);
    return false;
  },

  stepTo(speed, avoid, want, dt, opts = {}) {
    const D = this.diff;
    let moveYaw = want + avoid;
    const face = opts.face !== undefined ? opts.face : moveYaw;
    let dy = angDiff(this.yaw, face); this.yaw += clamp(dy, -(7 + D.speed * 2) * dt, (7 + D.speed * 2) * dt);
    const sp = speed * D.speed * (this.crouch ? 0.5 : 1) * (this.reloadT > 0 ? 0.85 : 1);
    const tx = -Math.sin(moveYaw) * sp, tz = -Math.cos(moveYaw) * sp;
    const acc = Math.min(1, dt * (this.onGround ? 10 : 2));
    this.vx = lerp(this.vx || 0, tx, acc); this.vz = lerp(this.vz || 0, tz, acc);
    if (this.vel.x || this.vel.z) { this.vx += this.vel.x; this.vz += this.vel.z; this.vel.multiplyScalar(Math.max(0, 1 - dt * 5)); }
    const blocked = Mover.move(this, this.vx, this.vz, dt);
    this.speed = Math.hypot(this.vx, this.vz);
    this.walkDir = this.vx * -Math.sin(this.yaw) + this.vz * -Math.cos(this.yaw) >= 0 ? 1 : -1;
    if (blocked && speed > 0) {
      this.stuckT += dt;
      if (this.onGround && this.stuckT > 0.35) { this.vy = 7; this.onGround = false; this.stuckT = 0.1; }
      if (this.stuckT > 1.4) { this.stuckT = 0; this.dest = null; this.lootTarget = null; this.stuckSide = Math.random() < 0.5 ? 1 : -1; this.cover = null; }
    } else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.speed > 6 && Math.random() < dt * 1.7 && this.onGround) addNoise(this.pos.x, this.pos.z, 20, this);
    if (this.onGround && this.speed > 1.2) {
      this.stepD = (this.stepD || 0) + this.speed * dt;
      if (this.stepD > (this.speed > 6 ? 2.5 : 2.0)) {
        this.stepD = 0;
        const dp = Math.hypot(this.pos.x - Player.pos.x, this.pos.z - Player.pos.z);
        if (dp < 42) Sound.step(waterDepth(this.pos.x, this.pos.z) > 0.2 ? 'water' : surfaceAt(this.pos.x, this.pos.z, this.pos.y), this.pos, this.crouch ? 0.4 : 0.9);
      }
    }
  },

  // ---------- behaviours ----------
  act(dt) {
    if (this.useT > 0) {
      this.useT -= dt; this.stepTo(0, 0, this.yaw, dt);
      if (this.useT <= 0) { const u = this.pendingUse; this.pendingUse = null; if (u) { if (u.hp) this.health = Math.min(Math.max(this.health, u.cap), this.health + u.hp); if (u.sh) this.shield = Math.min(100, this.shield + u.sh); } this.crouch = false; }
      return;
    }
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.finishReload(); }
    switch (this.state) {
      case 'engage': this.doEngage(dt); break;
      case 'search': this.doSearch(dt); break;
      case 'rotate': this.doRotate(dt); break;
      default: this.doLoot(dt);
    }
    if (this.bikeTarget && !this.riding && this.state !== 'engage') this.goToBike(dt);
  },

  doLoot(dt) {
    if (this.grace > 0 && this.state === 'loot') { /* just landed: look around */ }
    if (this.lootTarget && !Loot.items.includes(this.lootTarget)) this.lootTarget = null;
    this.lootCheck = (this.lootCheck || 0) - dt;
    if ((!this.lootTarget && this.lootCheck <= 0) || (this.lootTarget && this.lootCheck < -3)) { this.lootCheck = 0.5; this.pickLoot(); }
    if (this.lootTarget) {
      const r = this.lootTarget, arrived = this.steer({ x: r.x, z: r.z }, 6.2, dt, { arrive: 1.3 });
      if (arrived || Math.hypot(r.x - this.pos.x, r.z - this.pos.z) < 1.5) { this.take(r); this.lootTarget = null; this.lootCheck = 0; }
      return;
    }
    if (!this.dest || Math.hypot(this.dest.x - this.pos.x, this.dest.z - this.pos.z) < 4) this.dest = this.pickRoamDest();
    this.steer(this.dest, 5.4, dt, { arrive: 3 });
  },

  pickRoamDest() {
    const sup = Supply.active();
    if (sup.length && Math.random() < 0.55) { const s = sup[Math.floor(Math.random() * sup.length)]; if (Math.hypot(s.x - Zone.cx, s.z - Zone.cz) < Zone.r - 4) return { x: s.x + mr(-3, 3), z: s.z + mr(-3, 3) }; }
    const spots = World.lootSpots, inZone = s => Math.hypot(s.x - Zone.cx, s.z - Zone.cz) < Zone.r * 0.88;
    this.visited = this.visited || new Set();
    let best = null, bs = -1;
    for (const s of spots) {
      if (this.visited.has(s) || !inZone(s)) continue;
      const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z), score = (s.tier + 1.5) * Math.random() / (30 + d);
      if (score > bs) { bs = score; best = s; }
    }
    if (best) { this.visited.add(best); return { x: best.x, z: best.z }; }
    const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * Zone.r * 0.7;
    return { x: Zone.cx + Math.cos(a) * r, z: Zone.cz + Math.sin(a) * r };
  },

  lootValue(it) {
    switch (it.kind) {
      case 'weapon': {
        if (it.w.id === 'special') return 400;
        const mine = Math.max(...this.slots.map(s => Loot.weaponScore(s.w))), sc = Loot.weaponScore(it.w);
        if (sc > mine + 3) return 30 + (sc - mine);
        if (this.slots.length < 3 && sc > 25) return 18;
        return 0;
      }
      case 'ammo': { let need = false; for (const s of this.slots) if (WEAPONS[s.w.id].ammo === it.type && this.ammo[it.type] < AMMO[it.type].cap * 0.5) need = true; return need ? 24 : 0; }
      case 'heal': return this.health < 80 ? 26 : 8;
      case 'shield': return this.shield < 60 ? 26 : 6;
      case 'throw': return it.type === 'frag' ? 14 : 8;
    }
    return 0;
  },

  pickLoot() {
    let best = null, bs = 0;
    for (const r of Loot.items) {
      const dx = r.x - this.pos.x, dz = r.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 65 || Math.abs(r.y - this.pos.y) > 7) continue;
      if (Math.hypot(r.x - Zone.cx, r.z - Zone.cz) > Zone.r - 3) continue;
      const v = this.lootValue(r.item); if (v <= 0) continue;
      const s = v / (8 + d); if (s > bs) { bs = s; best = r; }
    }
    this.lootTarget = best;
  },

  doRotate(dt) {
    const tgt = Zone.to && Zone.state === 'wait' ? Zone.to : { x: Zone.cx, z: Zone.cz, r: Zone.r };
    if (!this.rotDest || this.rotKey !== Zone.phase + Zone.state) {
      this.rotKey = Zone.phase + Zone.state; const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * (tgt.r || Zone.r) * 0.55;
      this.rotDest = { x: tgt.x + Math.cos(a) * r, z: tgt.z + Math.sin(a) * r };
    }
    this.steer(this.rotDest, 7.4, dt, { arrive: 4 });
  },

  doSearch(dt) {
    if (!this.dest) { this.state = 'loot'; return; }
    const arrived = this.steer(this.dest, 6.2, dt, { arrive: 4 });
    if (arrived || G.time - this.suspectT > 9) { this.suspect = null; this.state = 'loot'; this.dest = null; this.yaw += 1.2 * dt; }
  },

  // ---------- combat ----------
  doEngage(dt) {
    const e = this.enemy;
    if (!e || !e.alive) { this.enemy = null; this.state = 'loot'; return; }
    const D = this.diff, w = this.weapon(), d = w ? WEAPONS[w.id] : null;
    this.engageT += dt; this.stateT += dt;
    const ex = (this.canSee ? e.pos.x : this.lastKnown.x), ez = (this.canSee ? e.pos.z : this.lastKnown.z);
    const dx = ex - this.pos.x, dz = ez - this.pos.z, dist = Math.hypot(dx, dz), face = Math.atan2(-dx, -dz);
    this.chooseWeaponFor(dist);
    const wid = this.weapon() ? this.weapon().id : 'pistol', pref = IDEAL_RANGE[wid] || 25;
    // reload when empty or safe
    const wp = this.weapon();
    if (wp) { const st = Weapons.stat(wp); if (this.reloadT <= 0 && ((wp.mag === 0 && this.ammo[WEAPONS[wp.id].ammo] > 0) || (wp.mag < st.size * 0.3 && !this.canSee))) this.startReload(); }
    // grenades and smoke
    if (this.canSee && this.grace <= 0) this.tacticalThrow(e, dist);
    let mv = null, speed = 5;
    if (!this.canSee) {
      // hunt the last known position carefully
      this.crouch = false;
      if (dist > 3 && G.time - this.lastSeen < 6) { this.steer({ x: ex, z: ez }, 5.8, dt, { arrive: 3, face: dist > 8 ? undefined : face }); }
      else { this.stepTo(0, 0, face, dt); }
      this.fireControl(dt, e, dist, false);
      return;
    }
    if (this.useCover && !this.cover && this.engageT > 0.3) { this.cover = this.findCover(e); this.coverT = G.time; if (!this.cover) this.useCover = false; }
    if (this.useCover && this.cover && G.time - this.coverT > 4) { this.cover = this.findCover(e); this.coverT = G.time; }
    if (this.useCover && this.cover) {
      this.peekT -= dt;
      if (this.peekT <= 0) { this.peeking = !this.peeking; this.peekT = this.peeking ? rr(1.2, 2.6) : rr(0.8, 1.9); }
      const t = this.peeking ? this.cover.peek : this.cover.hide, arrived = this.steer(t, 6.5, dt, { arrive: 0.6, face });
      this.crouch = arrived && !this.peeking;
      this.fireControl(dt, e, dist, this.peeking || !arrived ? true : false);
      return;
    }
    // open-field fighting: keep distance and strafe
    this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = rr(0.8, 2.2) / D.strafe; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
    const fwdK = dist > pref + 8 ? 1 : dist < pref - 6 ? -1 : 0;
    const f = new THREE.Vector3(-Math.sin(face), 0, -Math.cos(face)), r = new THREE.Vector3(Math.cos(face), 0, -Math.sin(face));
    const dir = f.multiplyScalar(fwdK).addScaledVector(r, this.strafeDir * 0.85 * (D.strafe > 0.5 ? 1 : 0.3));
    const len = dir.length();
    this.crouch = dist > 30 && Math.random() < 0.01 ? !this.crouch : this.crouch;
    if (len > 0.05) { const tp = { x: this.pos.x + dir.x / len * 6, z: this.pos.z + dir.z / len * 6 }; this.steer(tp, 4.8 * Math.min(1, len + 0.3), dt, { arrive: 0.2, face }); }
    else this.stepTo(0, 0, face, dt, { face });
    this.fireControl(dt, e, dist, true);
  },

  findCover(e) {
    const ep = new THREE.Vector3(e.pos.x, e.pos.y + 1.1, e.pos.z), best = { d: 1e9, c: null };
    const towards = Math.atan2(ep.x - this.pos.x, ep.z - this.pos.z);
    for (let i = 0; i < 12; i++) for (const rad of [4, 8]) {
      const a = i / 12 * Math.PI * 2, x = this.pos.x + Math.cos(a) * rad, z = this.pos.z + Math.sin(a) * rad;
      if (waterDepth(x, z) > 0.3 || slopeAt(x, z) > 0.3 || Math.abs(x) > MAP.half - 8 || Math.abs(z) > MAP.half - 8) continue;
      const y = terrainHeight(x, z), hide = new THREE.Vector3(x, y + 1.0, z);
      if (hasLineOfSight(hide, ep, true)) continue;
      // find a peek point sideways where the enemy is visible
      const side = new THREE.Vector3(-(ep.z - z), 0, ep.x - x).normalize();
      let peek = null;
      for (const s of [1.8, -1.8, 3.2, -3.2]) {
        const px = x + side.x * s, pz = z + side.z * s, p = new THREE.Vector3(px, terrainHeight(px, pz) + 1.55, pz);
        if (waterDepth(px, pz) < 0.3 && hasLineOfSight(p, ep, true)) { peek = { x: px, z: pz }; break; }
      }
      if (!peek) continue;
      const score = rad + Math.abs(angDiff(a, towards)) * 0.6;
      if (score < best.d) { best.d = score; best.c = { hide: { x, z }, peek }; }
    }
    return best.c;
  },

  tacticalThrow(e, dist) {
    const D = this.diff;
    if (this.nades.frag > 0 && this.nadeCd <= 0 && dist > 10 && dist < 38 && Math.random() < D.grenade * 0.5) {
      this.nadeCd = rr(7, 15); const v = velOf(e);
      this.throwAt('frag', new THREE.Vector3(e.pos.x + v.x * 1.2, e.pos.y, e.pos.z + v.z * 1.2)); return;
    }
    if (this.nades.sticky > 0 && this.nadeCd <= 0 && dist > 7 && dist < 24 && Math.random() < D.grenade * 0.45) { this.nadeCd = rr(7, 14); this.throwAt('sticky', new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z)); return; }
    if (this.nades.flash > 0 && this.nadeCd <= 0 && dist > 8 && dist < 20 && Math.random() < D.grenade * 0.4) { this.nadeCd = rr(6, 12); this.throwAt('flash', new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z)); return; }
    if (this.nades.smoke > 0 && this.smokeCd <= 0 && this.health < 45 && dist > 12) {
      this.smokeCd = 18; const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.throwAt('smoke', new THREE.Vector3(this.pos.x + f.x * 4, this.pos.y, this.pos.z + f.z * 4)); this.useCover = true; this.cover = null;
    }
  },

  throwAt(type, target) {
    this.nades[type]--; this.lastFired = G.time;
    const o = this.eye(); o.y -= 0.1;
    const dx = target.x - o.x, dz = target.z - o.z, dist = Math.hypot(dx, dz), v = Math.sqrt(Math.max(30, dist * 19)), a = 0.78;
    const vel = new THREE.Vector3(dx / dist * v * Math.cos(a), v * Math.sin(a), dz / dist * v * Math.cos(a));
    vel.x += mr(-0.6, 0.6); vel.z += mr(-0.6, 0.6);
    Projectiles.throwGrenade(this, type, o, vel);
  },

  chooseWeaponFor(dist) {
    if (this.equipT > 0 || this.reloadT > 0) return;
    this.chooseWeapon(false, dist);
  },

  chooseWeapon(force, dist) {
    if (!force && this.equipT > 0) return;
    let best = this.cur, bs = -1e9;
    this.slots.forEach((s, i) => {
      const id = s.w.id, d = WEAPONS[id];
      if (s.w.mag <= 0 && this.ammo[d.ammo] <= 0) return;
      let v = Loot.weaponScore(s.w);
      if (dist !== undefined) {
        if (dist < 12) v += id === 'shotgun' || id === 'autoshotgun' ? 30 : id === 'smg' ? 16 : id === 'pistol' ? 6 : id === 'sniper' ? -35 : id === 'dmr' ? -12 : 0;
        else if (dist < 45) v += id === 'ar' || id === 'ak' ? 14 : id === 'smg' ? 8 : id === 'minigun' ? 12 : id === 'sniper' ? -12 : 0;
        else { v += id === 'dmr' ? 25 : id === 'sniper' ? 24 : id === 'ar' ? 10 : id === 'special' ? 100 : id === 'shotgun' || id === 'autoshotgun' ? -45 : id === 'smg' ? -20 : 0; if (dist > 110 && id === 'sniper') v += 15; }
        if (id === 'rpg') v += (dist > 18 && dist < 90 && s.w.mag > 0 && this.rpgCd <= 0) ? 80 : -200;
        if (s.w.mag <= 0) v -= 25;
      } else if (id === 'rpg') v -= 100;
      if (v > bs) { bs = v; best = i; }
    });
    if (best !== this.cur && this.slots[best]) { this.cur = best; this.equipT = WEAPONS[this.slots[best].w.id].eq * 0.8; this.reloadT = 0; this.burstLeft = 0; this.charge = 0; }
  },

  startReload() {
    const w = this.weapon(); if (!w || this.reloadT > 0) return;
    const d = WEAPONS[w.id], st = Weapons.stat(w);
    if (w.mag >= st.size || this.ammo[d.ammo] <= 0) return;
    this.reloadTotal = d.shell ? 0.55 * (st.size - w.mag) + 0.4 : st.reload; this.reloadT = this.reloadTotal;
    const dp = Math.hypot(this.pos.x - Player.pos.x, this.pos.z - Player.pos.z);
    if (dp < 25) Sound.reload(d.shell ? 'shell' : 'mag');
  },

  finishReload() {
    const w = this.weapon(); if (!w) return;
    const d = WEAPONS[w.id], st = Weapons.stat(w), take = Math.min(st.size - w.mag, this.ammo[d.ammo]);
    w.mag += take; this.ammo[d.ammo] -= take;
  },

  fireControl(dt, e, dist, allowed) {
    const w = this.weapon(); if (!w) return;
    const d = WEAPONS[w.id], D = this.diff, st = Weapons.stat(w);
    if (this.reactT > 0) { this.reactT -= dt; return; }
    if (!allowed || this.blind > 0 || this.equipT > 0 || this.reloadT > 0 || this.useT > 0 || G.time - this.lastHurt < 0.0) return;
    const pierceShot = d.pierce && !this.canSee && G.time - this.lastSeen < 3;
    if (!this.canSee && !pierceShot) return;
    if (w.mag <= 0) { this.startReload(); return; }
    if (dist > d.range * (w.id === 'special' ? 1 : 0.85)) return;
    // aim point with lead and optional headshot
    const v = velOf(e), t = dist / 380 * D.lead, head = Math.random() < D.hs && dist < 90;
    const tx = e.pos.x + v.x * t, tz = e.pos.z + v.z * t, ty = e.pos.y + (head ? (e.crouch ? 1.1 : 1.55) : (e.crouch ? 0.7 : 1.1)) + (e.riding ? -0.1 : 0);
    const eye = this.eye(), dir = new THREE.Vector3(tx - eye.x, ty - eye.y, tz - eye.z), len = dir.length(); dir.divideScalar(len);
    this.aimPitch = Math.asin(clamp(dir.y, -1, 1));
    const wantYaw = Math.atan2(-dir.x, -dir.z), off = Math.abs(angDiff(this.yaw, wantYaw));
    if (off > 0.22) return;
    if (this.pauseT > 0) { this.pauseT -= dt; return; }
    const rate = d.rate * (d.auto ? 1.05 : rr(1.15, 1.9));
    if (G.time - this.lastShot < rate) return;
    if (d.charge) { this.charge = (this.charge || 0) + dt + 0.05; if (this.charge < d.charge) return; this.charge = 0; }
    if (d.spinup) { this.spinT = Math.min(1, (this.spinT || 0) + 0.3); if (this.spinT < 1) return; }
    // fire
    this.lastShot = G.time; this.lastFired = G.time; w.mag--; this.recoil = 1;
    const speedPen = 1 + Math.hypot(v.x, v.z) * 0.06 + (this.speed > 3 ? 0.4 : 0);
    const err = lerp(0.09, 0.028, clamp(this.engageT / 6, 0, 1)) * D.err * (dist / 35 + 0.7) * speedPen;
    const spread = d.pellets > 1 ? d.spread + err * 0.2 : Math.max(d.ads * 2, err);
    this.rig.root.updateMatrixWorld(true);
    const mz = this.rig.gun && this.rig.gun.userData.muzzle; if (mz) mz.getWorldPosition(this.muzzleWorld); else this.muzzleWorld.copy(eye);
    if (d.rocket) { Projectiles.fireRocket(this, this.muzzleWorld.clone(), dir, w); this.rpgCd = 14; }
    else Combat.shoot(this, eye, dir, w, spread);
    const fl = this.rig.gun && this.rig.gun.userData.flash; if (fl) { fl.visible = true; setTimeout(() => { fl.visible = false; }, 50); }
    const dp = Math.hypot(this.pos.x - Player.pos.x, this.pos.z - Player.pos.z);
    if (dp < 320) { Sound.gun(d.snd, this.muzzleWorld, 1); FX.muzzle(this.muzzleWorld, dir, d.pellets > 1); }
    addNoise(this.pos.x, this.pos.z, w.id === 'pistol' || w.id === 'revolver' ? 70 : w.id === 'special' || w.id === 'sniper' ? 230 : 130, this);
    if (d.auto) { this.burstLeft = (this.burstLeft || (3 + Math.floor(Math.random() * (4 + D.speed * 4)))) - 1; if (this.burstLeft <= 0) { this.pauseT = rr(0.25, 0.8) / D.strafe; this.burstLeft = 0; } }
    if (d.pump || d.bolt) this.pauseT = rr(0.15, 0.4);
    if (w.mag === 0 && this.ammo[d.ammo] > 0) this.startReload();
  },

  // ---------- bikes ----------
  goToBike(dt) {
    const b = this.bikeTarget;
    if (!b || b.rider || !this.alive) { this.bikeTarget = null; return; }
    const d = Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z);
    if (d < 2.3) { this.mountBike(b); this.bikeTarget = null; return; }
    if (d > 60) { this.bikeTarget = null; return; }
    this.steer({ x: b.pos.x, z: b.pos.z }, 7, dt, { arrive: 1 });
  },

  mountBike(b) { this.riding = true; this.bike = b; b.rider = this; this.crouch = false; this.rideStuck = 0; this.state = 'rotate'; },

  dismount() {
    const b = this.bike; if (!b) return;
    this.riding = false; this.bike = null; b.rider = null;
    this.pos.set(b.pos.x + 1.1, b.pos.y, b.pos.z); this.pushSafe(); this.onGround = true; b.speed *= 0.3;
  },

  rideUpdate(dt) {
    const b = this.bike; if (!b || !this.alive) { this.riding = false; return; }
    const tgt = this.state === 'rotate' || !this.dest ? (this.rotDest || { x: Zone.cx, z: Zone.cz }) : this.dest;
    const dx = tgt.x - b.pos.x, dz = tgt.z - b.pos.z, dist = Math.hypot(dx, dz);
    let want = Math.atan2(-dx, -dz);
    const o = new THREE.Vector3(b.pos.x, b.pos.y + 0.7, b.pos.z);
    let blocked = false;
    const probe = (a, L) => { const dir = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)); const px = b.pos.x + dir.x * L, pz = b.pos.z + dir.z * L; return rayBoxes(o, dir, L).dist < L - 0.2 || waterDepth(px, pz) > 0.5 || terrainHeight(px, pz) - b.pos.y > 1.2; };
    const look = clamp(b.speed * 0.9, 5, 20);
    if (probe(b.yaw, look)) { blocked = true; const l = !probe(b.yaw + 0.7, look), r = !probe(b.yaw - 0.7, look); want = b.yaw + (l ? 0.9 : r ? -0.9 : 1.6); }
    const steer = clamp(-angDiff(b.yaw, want) * 2.0, -1, 1);
    b.drive(dt, { thr: blocked && b.speed > 14 ? 0 : 1, brake: blocked && b.speed > 12 ? 1 : 0, steer, hand: false, boost: false });
    this.pos.set(b.pos.x, b.pos.y + 0.1, b.pos.z); this.yaw = b.yaw; this.speed = Math.abs(b.speed) * 0.3; this.mvel = this.mvel || new THREE.Vector3();
    this.rideStuck = Math.abs(b.speed) < 1.2 ? (this.rideStuck || 0) + dt : 0;
    addNoise(b.pos.x, b.pos.z, 30 + Math.abs(b.speed), this);
    if (dist < 22 || this.rideStuck > 2.5 || !(this.outside || Zone.state === 'shrink' || dist > 40)) this.dismount();
  },

  setGhost(on) {
    if (!this.rig) return;
    if (!this.ghost) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.0, 4, 8), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, fog: false }));
      m.position.y = 0.95; m.renderOrder = 999; this.ghost = m; this.rig.root.add(m);
    }
    this.ghost.visible = on && this.alive;
  }
});
