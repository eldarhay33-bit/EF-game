// Player, part 2: weapon handling (every gun behaves differently), inventory, items, grenades and the first-person viewmodel.
Object.assign(Player, {
  equip(n) {
    if (n === this.cur || !this.slots[n] || this.useT > 0) return;
    this.cur = n; this.reloadT = 0; this.charging = 0; this.spin = 0; this.pumpT = 0; this.boltT = 0;
    const d = this.wdef(); this.equipT = (d ? d.eq : 0.3) * (1 - (this.fx ? this.fx.equipSpeed : 0)); this.vmKey = ''; Sound.equip(); Sound.spinStop();
  },

  interact() {
    if (this.riding) { Vehicles.dismount(this); return; }
    if (this.phase !== 'ground') return;
    const b = Vehicles.nearest(this.pos, 3.2);
    if (b) { Vehicles.mount(this, b); return; }
    this.pickup();
  },

  pickup() {
    const rec = Loot.nearest(this.pos, 2.6); if (!rec) return;
    const it = rec.item;
    for (const s of Supply.list) if (s.landed && !s.looted && Math.hypot(s.x - rec.x, s.z - rec.z) < 4) { s.looted = true; if (Profile.match) Profile.match.supply++; }
    if (it.kind === 'weapon') {
      const same = this.slots.findIndex(s => s && s.w.id === it.w.id && s.w.rarity >= it.w.rarity);
      if (same >= 0) { const d = WEAPONS[it.w.id]; this.ammo[d.ammo] = Math.min(AMMO[d.ammo].cap, this.ammo[d.ammo] + AMMO[d.ammo].give); Sound.pickup(); Loot.remove(rec); return; }
      let slot = this.slots.findIndex(s => !s);
      if (slot < 0) {
        slot = this.cur; const old = this.slots[slot].w;
        Loot.spawn(this.pos.x + Math.sin(this.yaw) * -1.2, this.pos.y, this.pos.z + Math.cos(this.yaw) * -1.2, { kind: 'weapon', w: old });
      }
      if (it.w.mag === undefined) it.w.mag = Weapons.stat(it.w).size;
      this.slots[slot] = { w: it.w };
      this.cur = -1; this.equip(slot); this.vmKey = '';
      if (it.w.id === 'special') {                                  // the Phantom-X: big message, 30 spare rounds come with it
        const trial = !!(Profile.match && Profile.match.trial);
        HUD.banner(I18n.t('msg.exotic') + (trial ? ' · ' + I18n.t('msg.trial') : ''), 6); HUD.feed(I18n.t('feed.exotic')); HUD.toast(WEAPONS.special.name, I18n.t('feed.exotic'), 0x35f0ff);
        this.ammo.heavy = Math.min(AMMO.heavy.cap, this.ammo.heavy + 30); FX.shake(0.4, 0.6); Events.emit('exotic'); if (Profile.match && !trial) Profile.match.exotic = true;
      }
    } else if (it.kind === 'ammo') {
      if (this.ammo[it.type] >= AMMO[it.type].cap) { HUD.banner(I18n.t('msg.ammoFull'), 1); return; }
      this.ammo[it.type] = Math.min(AMMO[it.type].cap, this.ammo[it.type] + it.amount);
    } else if (it.kind === 'heal') { if (this.meds[it.size] >= 6) return; this.meds[it.size]++; }
    else if (it.kind === 'shield') { if (this.shields[it.size] >= 6) return; this.shields[it.size]++; }
    else if (it.kind === 'throw') { if (this.nades[it.type] >= 6) return; this.nades[it.type] = Math.min(6, this.nades[it.type] + it.n); }
    Sound.pickup(); Loot.remove(rec);
  },

  // throw the held weapon (or slot i) on the ground in front of you; Z by default
  dropWeapon(i) {
    if (i === undefined) i = this.cur;
    const s = this.slots[i]; if (!s || this.riding || this.useT > 0 || (this.phase !== 'ground' && this.phase !== 'glide')) return false;
    const f = this.forward(), x = this.pos.x + f.x * 1.1, z = this.pos.z + f.z * 1.1, y = Math.max(groundAt(x, z, this.pos.y + 1.5), this.pos.y - 0.4);
    Loot.spawn(x, y, z, { kind: 'weapon', w: s.w }); this.slots[i] = null;
    this.firing = false; this.reloadT = 0; this.charging = 0; this.spin = 0; this.vmKey = ''; Sound.stopSpin && Sound.stopSpin(); Sound.spinStop && Sound.spinStop(); Sound.whoosh(null);
    if (i === this.cur) {
      let n = -1; for (let k = 1; k <= this.slots.length; k++) { const j = (i + k) % this.slots.length; if (this.slots[j]) { n = j; break; } }
      if (n >= 0) { this.cur = -1; this.equip(n); }
    }
    HUD.pickup(WEAPONS[s.w.id].name, RARITY[s.w.rarity].color, '-');
    return true;
  },

  // ammo boxes are collected just by walking over them (the other items still need E)
  autoLoot(dt) {
    this.lootT = (this.lootT || 0) - dt; if (this.lootT > 0 || this.phase !== 'ground' || !this.alive) return;
    this.lootT = 0.1;
    for (const rec of Loot.items) {
      const it = rec.item; if (it.kind !== 'ammo') continue;
      const dx = rec.x - this.pos.x, dz = rec.z - this.pos.z; if (dx * dx + dz * dz > 2.1 * 2.1 || Math.abs(rec.y - this.pos.y) > 2.5) continue;
      const cap = AMMO[it.type].cap, room = cap - this.ammo[it.type]; if (room <= 0) continue;
      const take = Math.min(room, it.amount); this.ammo[it.type] += take; it.amount -= take;
      Sound.pickup(); HUD.pickup(AMMO[it.type].name, AMMO_COLORS[it.type], '+' + take);
      if (it.amount <= 0) Loot.remove(rec);
      break;
    }
  },

  startReload() {
    const w = this.weapon(); if (!w || this.reloadT > 0 || this.useT > 0 || this.equipT > 0) return;
    const d = WEAPONS[w.id], st = Weapons.stat(w);
    if (w.mag >= st.size || this.ammo[d.ammo] <= 0) return;
    this.reloadTotal = (d.shell ? st.reload : st.reload + (w.mag === 0 ? 0.45 : 0)) * (1 - (this.fx ? this.fx.reload : 0)); this.reloadT = this.reloadTotal;
    Sound.reload(d.shell ? 'shell' : d.rocket ? 'rocket' : 'mag'); this.charging = 0;
  },

  finishReload(w, d, st) {
    if (d.shell) {
      w.mag++; this.ammo[d.ammo]--;
      if (w.mag < st.size && this.ammo[d.ammo] > 0 && !(this.firing && w.mag > 0)) { this.reloadT = this.reloadTotal; Sound.reload('shell'); } else Sound.pump();
    } else {
      const take = Math.min(st.size - w.mag, this.ammo[d.ammo]); w.mag += take; this.ammo[d.ammo] -= take;
    }
  },

  canFireNow(d) { return this.equipT <= 0 && this.throwT <= 0 && this.useT <= 0 && !this.sprinting && this.pumpT <= 0 && this.boltT <= 0 && (this.phase === 'ground' || this.phase === 'glide' || (this.riding && d.hold === 'pistol')); },

  updateWeapon(dt) {
    const w = this.weapon(), d = w ? WEAPONS[w.id] : null;
    if (this.equipT > 0) this.equipT -= dt;
    this.pumpT = Math.max(0, this.pumpT - dt); this.boltT = Math.max(0, this.boltT - dt);
    if (this.flashed > 0) this.flashed -= dt;
    if (this.throwT > 0) {
      this.throwT -= dt;
      if (!this.thrown && this.throwT <= 0.28) { this.thrown = true; this.releaseNade(); }
    }
    this.lockT = null;
    if (!w) return;
    const st = Weapons.stat(w);
    if (d.lock && this.alive && !this.riding) this.lockT = this.findLock(d);                    // what the Phantom-X has locked on to (the HUD draws a ring on it)
    if (this.reloadT > 0) {
      if (d.shell && this.firing && w.mag > 0 && this.reloadT < this.reloadTotal * 0.6) { this.reloadT = 0; }
      else { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; this.finishReload(w, d, st); } }
    }
    // minigun spin-up
    if (d.spinup) {
      const want = this.firing && this.canFireNow(d) && this.reloadT <= 0 && w.mag > 0;
      const old = this.spin; this.spin = clamp(this.spin + (want ? dt / d.spinup : -dt * 1.1), 0, 1);
      if (this.spin > 0 && old <= 0) Sound.spinStart(); if (this.spin <= 0 && old > 0) Sound.spinStop(); Sound.spinSet(this.spin);
      if (this.vm && this.vm.userData.spin) this.vm.userData.spin.rotation.z += dt * this.spin * 40;
      if (this.rig && this.rig.gun && this.rig.gun.userData.spin) this.rig.gun.userData.spin.rotation.z += dt * this.spin * 40;
    }
    // railgun charge
    if (d.charge) {
      if (this.charging > 0) {
        if (!this.firing) { this.charging = 0; Sound.spinStop(); }
        else { this.charging -= dt; if (this.charging <= 0) { this.charging = 0; this.fire(w, d, st); this.triggerHeld = true; } }
      }
    }
    // trigger
    this.fireQueueT = Math.max(0, (this.fireQueueT || 0) - dt);
    if ((this.firing || this.fireQueueT > 0) && this.reloadT <= 0.0001 && this.canFireNow(d) && !this.charging && (d.auto || !this.triggerHeld)) {
      if (w.mag <= 0) { if (!this.triggerHeld) Sound.dry(); this.triggerHeld = true; if (this.ammo[d.ammo] > 0) this.startReload(); }
      else if (G.time - this.lastShot >= d.rate) {
        if (d.charge) { this.charging = d.charge; Sound.charge(d.charge); this.triggerHeld = true; }
        else if (!d.spinup || this.spin >= 1) this.fire(w, d, st);
      }
    }
  },

  findLock(d) {
    const o = G.camera.position, f = new THREE.Vector3(0, 0, -1).applyQuaternion(G.camera.quaternion);
    return Combat.lockTarget(o, f, Combat.actors().filter(a => a !== this && !(a.team && a.team === this.team)), d.lock);
  },

  computeSpread(d) {
    const moving = clamp(this.speed / 6, 0, 1.6), air = this.onGround ? 0 : 1;
    let s = lerp(d.spread, d.ads, this.aimT);
    s *= 1 + moving * (this.aimT > 0.5 ? 0.5 : 1.0) + air * 1.6;
    if (this.crouch) s *= 0.72; if (this.sliding > 0) s *= 1.4;
    return s + this.bloom;
  },

  aimTarget(maxD = 400) {
    const o = G.camera.position, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(G.camera.quaternion);
    let t = Math.min(rayBoxes(o, dir, maxD).dist, rayTerrain(o, dir, maxD));
    for (const a of Combat.actors()) { if (a === this) continue; const r = Combat.rayActor(o, dir, a, t); if (r && r.t < t) t = r.t; }
    return { point: o.clone().addScaledVector(dir, t), dir, dist: t };
  },

  fire(w, d, st) {
    this.lastShot = G.time; this.lastFireT = G.time; w.mag--; this.triggerHeld = !d.auto; this.fireQueueT = 0;
    const PM = Profile.match; if (PM) { PM.shots++; if (w.id !== 'pistol') PM.nonPistol = true; }
    const spread = this.computeSpread(d) * (d.id === 'sniper' ? 1 : 1);
    const eye = G.camera.position.clone(), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(G.camera.quaternion);
    let origin = this.tppNow ? this.eye() : eye, dir = fwd;
    this.updateMuzzle();
    if (this.tppNow) { const at = this.aimTarget(); dir = at.point.clone().sub(origin).normalize(); if (at.dist < 3) dir = fwd; }
    let res = { hit: false, killed: false, head: false };
    if (d.rocket) {
      const at = this.aimTarget(), mz = this.muzzleWorld.clone();
      Projectiles.fireRocket(this, mz, at.point.clone().sub(mz).normalize(), w);
    } else {
      this.muzzleWorld.userData = {};
      res = Combat.shoot(this, origin, dir, w, spread);
    }
    // feedback
    const idx = this.recoilIdx; this.recoilIdx++;
    const aimK = lerp(1, 0.62, this.aimT) * (this.crouch ? 0.85 : 1) * st.recoil, ramp = 1 + Math.min(idx, 14) * 0.045;
    const kick = d.rv * aimK * ramp, side = (Math.sin(idx * 1.37 + 1.1) * 0.6 + (Math.random() - 0.5) * 0.8) * d.rh * aimK;
    this.pitch = clamp(this.pitch + kick, -1.5, 1.5); this.recoilAcc += kick * 0.55; this.yaw += side;
    this.kick = 1; this.bloom = Math.min(0.03, this.bloom + d.rv * 0.12);
    this.flashT = 0.05;
    const gun = this.tppNow ? (this.rig && this.rig.gun) : this.vm; const fl = gun && gun.userData.flash;
    if (fl) { fl.visible = true; fl.material.rotation = Math.random() * 6; this.flashGun = fl; }
    FX.muzzle(this.muzzleWorld, dir, d.pellets > 1 || w.id === 'sniper' || w.id === 'rpg');
    if (!d.shell && !d.rocket && d.pellets === 1) FX.shell(this.muzzleWorld.clone().addScaledVector(dir, -0.4), new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)));
    Sound.gun(d.snd); if (d.rocket) Sound.whoosh(null);
    addNoise(this.pos.x, this.pos.z, w.id === 'pistol' || w.id === 'revolver' ? 70 : w.id === 'special' ? 260 : w.id === 'sniper' ? 220 : 130, this);
    if (res.hit) HUD.hitMarker(res.killed, res.head);
    if (d.pump) { this.pumpT = 0.38; setTimeout(() => Sound.pump(), 260); }
    if (d.bolt) { this.boltT = 0.95; setTimeout(() => Sound.bolt(), 380); }
    if (d.charge) { FX.shake(0.5, 0.35); this.pitch += 0.03; }
    if (w.mag === 0 && this.ammo[d.ammo] > 0 && !d.charge) setTimeout(() => { if (this.alive && this.weapon() === w && w.mag === 0) this.startReload(); }, 280);
  },

  updateMuzzle() {
    const gun = this.tppNow ? (this.rig && this.rig.gun) : this.vm;
    const mz = gun && gun.userData.muzzle;
    if (!mz) { this.muzzleWorld.copy(G.camera.position); return; }
    if (this.tppNow) mz.getWorldPosition(this.muzzleWorld);
    else { this.vmCenter(); mz.getWorldPosition(this.muzzleWorld); this.muzzleWorld.applyMatrix4(G.camera.matrixWorld); }
  },
  vmCenter() { if (this.vmRoot) this.vmRoot.updateMatrixWorld(true); },

  // ---------- consumables ----------
  // want: 'small' (bandage) | 'big' (medkit) | undefined = pick the best item automatically
  useMed(want) {
    if (this.useT > 0 || this.throwT > 0 || this.riding || (this.phase !== 'ground' && this.phase !== 'glide')) return;
    if (this.health >= 100) { HUD.banner(I18n.t('msg.hpFull'), 1.2); return; }
    let kind = null;
    if (want) {
      if (this.meds[want] <= 0) { HUD.banner(I18n.t('item.heal.' + want) + ' x0', 1); return; }
      if (want === 'small' && this.health >= 75) { HUD.banner(I18n.t('msg.bandageCap'), 1.8); return; }
      kind = want;
    } else if (this.meds.small > 0 && this.health < 75) kind = 'small'; else if (this.meds.big > 0) kind = 'big'; else if (this.meds.small > 0 && this.health < 75) kind = 'small';
    if (!kind) { if (this.meds.small > 0) HUD.banner(I18n.t('msg.bandageCap'), 1.8); return; }
    this.reloadT = 0; this.charging = 0;
    this.meds[kind]--; this.pendingUse = kind === 'small' ? { hp: 20, cap: 75 } : { hp: 100, cap: 100 }; this.useTotal = this.useT = kind === 'small' ? 2.2 : 4.5;
    HUD.banner(I18n.t(kind === 'small' ? 'msg.healing' : 'msg.kit'), this.useT); Sound.heal();
  },

  useShield(want) {
    if (this.useT > 0 || this.throwT > 0 || this.riding || (this.phase !== 'ground' && this.phase !== 'glide')) return;
    if (this.shield >= 100) { HUD.banner(I18n.t('msg.shieldFull'), 1.2); return; }
    let kind = null;
    if (want) { if (this.shields[want] <= 0) { HUD.banner(I18n.t('item.shield.' + want) + ' x0', 1); return; } kind = want; }
    else if (this.shields.small > 0 && this.shield <= 75) kind = 'small'; else if (this.shields.big > 0) kind = 'big'; else if (this.shields.small > 0) kind = 'small';
    if (!kind) return;
    this.reloadT = 0; this.charging = 0;
    this.shields[kind]--; this.pendingUse = { sh: kind === 'small' ? 25 : 50 }; this.useTotal = this.useT = kind === 'small' ? 1.8 : 3.4;
    HUD.banner(I18n.t('msg.shieldDrink'), this.useT); Sound.heal();
  },

  updateUse(dt) {
    if (this.useT <= 0) return;
    this.useT -= dt; HUD.useBar(1 - this.useT / this.useTotal, this.pendingUse && this.pendingUse.sh ? I18n.t('use.shield') : I18n.t('use.health'));
    if (this.useT <= 0) {
      const u = this.pendingUse; this.pendingUse = null; HUD.useBar(0);
      if (u) { if (u.hp) this.health = Math.min(Math.max(this.health, u.cap), this.health + u.hp); if (u.sh) this.shield = Math.min(100, this.shield + u.sh); }
      HUD.banner('', 0); Sound.heal();
    }
  },

  // ---------- grenades ----------
  throwNade(type) {
    if (this.nades[type] <= 0 || this.throwT > 0 || this.useT > 0 || this.phase !== 'ground' || this.riding) return;
    this.nades[type]--; this.throwType = type; this.throwT = 0.55; this.thrown = false; this.reloadT = 0; this.charging = 0; Sound.pin();
  },

  releaseNade() {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(G.camera.quaternion), origin = this.eye().addScaledVector(dir, 0.55);
    origin.y -= 0.1;
    const vel = dir.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.2, 0)).add(new THREE.Vector3(this.vel.x, 0, this.vel.z).multiplyScalar(0.6));
    Projectiles.throwGrenade(this, this.throwType, origin, vel); Sound.whoosh(null);
  },

  // ---------- first person viewmodel ----------
  buildVM(w) {
    if (this.vmRoot) G.vmScene.remove(this.vmRoot);
    this.vmRoot = new THREE.Group(); this.vm = null;
    if (!w) return;
    const gun = GM.build(w.id, w.rarity, w.sight), d = WEAPONS[w.id];
    const M = Character.materialsFor(Character.byId(Settings.get('skin')), SKIN_TONES[0]);
    const limb = (p0, p1, r) => {
      const dir = p1.clone().sub(p0), len = dir.length(), m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), M.cloth);
      m.position.copy(p0).addScaledVector(dir, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); return m;
    };
    const glove = (p) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), M.gear); m.position.copy(p); return m; };
    const pistol = d.hold === 'pistol', mz = d.hold === 'launcher' ? -0.58 : d.hold === 'heavy' ? 0 : d.hold === 'pistol' ? -0.04 : (WEAPONS[w.id].range > 300 ? -0.46 : -0.32);
    const rh = new THREE.Vector3(0.01, -0.065, -0.01), lh = d.hold === 'heavy' ? new THREE.Vector3(0, 0.14, -0.15) : pistol ? new THREE.Vector3(-0.03, -0.075, -0.015) : new THREE.Vector3(-0.005, -0.045, mz);
    gun.add(limb(rh, rh.clone().add(new THREE.Vector3(0.12, -0.32, 0.3)), 0.042)); gun.add(glove(rh));
    gun.add(limb(lh, lh.clone().add(new THREE.Vector3(-0.1, -0.3, 0.3)), 0.04)); gun.add(glove(lh));
    this.vmRoot.add(gun); this.vm = gun; G.vmScene.add(this.vmRoot);
    this.holdName = d.hold;
  },

  updateViewmodel(dt) {
    const w = this.weapon(), key = w ? w.id + w.rarity + w.sight + Settings.get('skin') : '';
    if (key !== this.vmKey || (!w && this.vm)) { this.vmKey = key; this.buildVM(w); }
    const show = !this.tppNow && this.phase !== 'plane' && this.phase !== 'freefall' && this.alive && !this.scoped && !(this.riding && this.holdName !== 'pistol');
    if (this.vmRoot) this.vmRoot.visible = show;
    if (!this.vm || !show) { this.lastLook.set(this.yaw, this.pitch); return; }
    const d = this.wdef(), sight = SIGHTS[this.weapon().sight], root = this.vmRoot, s = lerp(0.82, sight.reticle ? 0.6 : 0.7, this.aimT);
    // sway from look velocity
    const dy = angDiff(this.lastLook.x, this.yaw) / Math.max(dt, 1e-3), dp = (this.pitch - this.lastLook.y) / Math.max(dt, 1e-3);
    this.lastLook.set(this.yaw, this.pitch);
    const lagK = lerp(1, 0.35, this.aimT);
    this.vmRot.y = lerp(this.vmRot.y, clamp(dy * 0.012, -0.12, 0.12) * lagK, Math.min(1, dt * 9));
    this.vmRot.x = lerp(this.vmRot.x, clamp(-dp * 0.012, -0.1, 0.1) * lagK, Math.min(1, dt * 9));
    // poses
    const hold = d.hold, base = hold === 'pistol' ? [0.09, -0.14, -0.32] : hold === 'launcher' ? [0.12, -0.2, -0.22] : hold === 'heavy' ? [0.14, -0.22, -0.4] : [0.13, -0.16, -0.36];
    const sprintK = this.sprinting ? 1 : 0, slideK = this.sliding > 0 ? 1 : 0;
    this.sprintBlend = lerp(this.sprintBlend || 0, sprintK, Math.min(1, dt * 9)); this.slideBlend = lerp(this.slideBlend || 0, slideK, Math.min(1, dt * 8));
    const ads = this.aimT, k = this.sprintBlend, sl = this.slideBlend;
    const pos = new THREE.Vector3(base[0], base[1], base[2]), rot = new THREE.Vector3();
    pos.lerp(new THREE.Vector3(0.07, -0.27, -0.27), k); rot.lerp(new THREE.Vector3(-0.3, 0.8, -0.1), k);
    pos.lerp(new THREE.Vector3(0.13, -0.27, -0.28), sl); rot.lerp(new THREE.Vector3(-0.12, 0.3, 0.35), sl);
    // aim down sights: align the sight with the screen centre
    const relief = sight.scope ? 0.12 : sight.reticle ? 0.2 : 0.14, ud = this.vm.userData;
    const adsPos = new THREE.Vector3(0, -ud.aimY * s, -relief - ud.aimZ * s);
    pos.lerp(adsPos, ads); rot.multiplyScalar(1 - ads);
    // bobbing / breathing
    const mv = this.onGround ? clamp(this.speed / 6, 0, 1.5) : 0, bob = (1 - ads * 0.85) * Settings.get('headbob');
    pos.x += Math.sin(this.bobT) * 0.008 * mv * bob * (1 + k); pos.y += -Math.abs(Math.sin(this.bobT)) * 0.012 * mv * bob * (1 + k * 0.8);
    pos.y += Math.sin(G.time * 1.6) * 0.0016 * (1 - ads * 0.7);
    // recoil
    pos.z += this.kick * (0.035 + d.rv * 0.5) * (1 - ads * 0.5); rot.x += this.kick * (0.04 + d.rv * 1.2) * (1 - ads * 0.5);
    // equip / reload / use / throw animations
    if (this.equipT > 0) { const t = clamp(this.equipT / Math.max(0.2, d.eq), 0, 1); pos.y -= t * 0.32; rot.x -= t * 0.7; }
    if (this.reloadT > 0) {
      const p = 1 - this.reloadT / this.reloadTotal, sn = Math.sin(Math.min(1, d.shell ? (p * 3 % 1) : p) * Math.PI);
      pos.y -= sn * 0.1 * (1 - ads * 0.5); rot.z += sn * 0.55; rot.x -= sn * 0.25; pos.x -= sn * 0.04;
    }
    if (this.useT > 0) { pos.y -= 0.35; rot.x -= 0.6; }
    if (this.throwT > 0) { const t = 1 - this.throwT / 0.55; pos.y -= Math.sin(t * Math.PI) * 0.3; rot.x -= Math.sin(t * Math.PI) * 0.5; }
    if (this.pumpT > 0) pos.z += Math.sin((1 - this.pumpT / 0.38) * Math.PI) * 0.03;
    if (this.boltT > 0.1 && d.bolt) { const t = 1 - this.boltT / 0.95; rot.z += Math.sin(t * Math.PI) * 0.35; pos.x -= Math.sin(t * Math.PI) * 0.03; }
    if (!this.onGround) pos.y -= 0.02;
    root.position.copy(pos); root.rotation.set(rot.x + this.vmRot.x, rot.y + this.vmRot.y, rot.z, 'YXZ');
    root.scale.setScalar(s);
    // muzzle flash timer
    if (this.flashGun && this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flashGun.visible = false; this.flashGun = null; } }
  }
});
