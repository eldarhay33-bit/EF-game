// Player: input, movement (walk / sprint / crouch / slide / jump / swim), first and third person cameras, drop sequence, damage.

const Player = {
  name: 'Player', isPlayer: true,
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, alive: true, health: 100, shield: 0,
  crouch: false, sliding: 0, slideDir: new THREE.Vector3(), sprinting: false, onGround: false, swimming: false,
  phase: 'plane', riding: false, bike: null,
  slots: [null, null, null, null, null], cur: 0,
  ammo: { light: 0, medium: 0, shells: 0, heavy: 0, rocket: 0 }, meds: { small: 0, big: 0 }, shields: { small: 0, big: 0 },
  nades: { frag: 0, smoke: 0, flash: 0, sticky: 0 }, nadeType: 'frag',
  aiming: false, aimT: 0, firing: false, triggerHeld: false, locked: false,
  lastShot: -10, reloadT: 0, reloadTotal: 1, equipT: 0, useT: 0, useTotal: 1, pendingUse: null, throwT: 0, pumpT: 0, boltT: 0, charging: 0, spin: 0, shellsLoaded: false,
  recoilIdx: 0, recoilAcc: 0, lastFireT: -9, kick: 0, bloom: 0, flashed: 0, flashDecay: 0,
  eyeH: 1.62, bobT: 0, stepD: 0, landDip: 0, landVel: 0, speed: 0, swayX: 0, swayY: 0, breath: 1, kills: 0, lastAttacker: null,
  rig: null, vm: null, vmKey: '', vmRot: new THREE.Vector3(), vmOff: new THREE.Vector3(), lastLook: new THREE.Vector2(),
  planeDir: new THREE.Vector3(), planeT: 0, fovV: 70, muzzleWorld: new THREE.Vector3(), tppNow: false, camPos: new THREE.Vector3(),
  dmgScale: 1, 

  init() { /* input is handled by Input (src/ui/input.js) */ },

  reset() {
    this.alive = true; this.health = 100; this.shield = 0; this.crouch = false; this.sliding = 0; this.onGround = false; this.swimming = false;
    this.phase = 'plane'; this.riding = false; this.bike = null;
    this.slots = [{ w: Weapons.make('pistol', 0) }, null, null, null, null]; this.cur = 0;
    this.ammo = { light: 45, medium: 0, shells: 0, heavy: 0, rocket: 0 }; this.meds = { small: 0, big: 0 }; this.shields = { small: 0, big: 0 };
    this.nades = { frag: 0, smoke: 0, flash: 0, sticky: 0 };
    this.reloadT = 0; this.equipT = 0.3; this.useT = 0; this.pendingUse = null; this.throwT = 0; this.pumpT = 0; this.boltT = 0; this.charging = 0; this.spin = 0;
    this.aiming = false; this.firing = false; this.aimT = 0; this.kills = 0; this.flashed = 0; this.recoilAcc = 0; this.recoilIdx = 0; this.kick = 0; this.bloom = 0;
    this.vmKey = ''; this.landDip = 0; this.eyeH = 1.62; this.vel.set(0, 0, 0); this.speed = 0;
    const th = Math.random() * Math.PI * 2;
    this.planeDir.set(Math.cos(th), 0, Math.sin(th));
    this.pos.set(-this.planeDir.x * (MAP.half + 40), 170, -this.planeDir.z * (MAP.half + 40));
    this.yaw = Math.atan2(-this.planeDir.x, -this.planeDir.z); this.pitch = -0.2;
    this.lastShot = -10; this.lastFireT = -9; this.lastLookT = -99; this.fireQueueT = 0; this.triggerHeld = false; this.firing = false; this.thrown = true; this.lastAttacker = null;
    this.planeT = 0; this.dmgScale = 1; this.fair = false; this.frozen = false; this.invuln = false;
    this.applyLoadout();
    this.buildRig();
  },

  // equipment bought in the shop: starter weapon, vest shield, supply pack (not used in fair-play modes)
  applyLoadout() {
    const fx = this.fx = this.fair ? Profile.noEffects() : Profile.effects();
    const L = Profile.d.loadout, st = CATALOG.starters.find(s => s.id === L.starter);
    if (st && st.w !== 'pistol' || (st && st.r > 0)) {
      const w = Weapons.make(st.w, st.r); w.mag = w.size; this.slots[0] = { w };
      const a = WEAPONS[st.w].ammo; this.ammo[a] = Math.max(this.ammo[a], AMMO[a].give * 2);
    }
    this.shield = fx.shield; this.meds.small += fx.meds; this.shields.small += fx.shields; this.nades.frag += fx.frags;
  },

  // per-match statistics for achievements and missions
  trackMatch(dt) {
    const M = Profile.match; if (!M || this.phase !== 'ground') return;
    M.distance += this.speed * dt;
    if (this.swimming) M.swim += this.speed * dt;
    this.inGrass = this.crouch && Nature.tallAt(this.pos.x, this.pos.z) > 0.4;
    if (this.inGrass) M.grass += dt;
  },

  buildRig() {
    if (this.rig) G.scene.remove(this.rig.root);
    this.rig = Character.build(Settings.get('skin'), 0, { loadout: this.fair ? null : Profile.d.loadout });          // the equipment from the shop is worn on the body (not in the fair-play modes: there it has no effect)
    this.rig.root.visible = false;
    G.scene.add(this.rig.root);
    this.rigGunKey = '';
  },

  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH, this.pos.z); },
  forward() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  },
  weapon() { const s = this.slots[this.cur]; return s ? s.w : null; },
  wdef() { const w = this.weapon(); return w ? WEAPONS[w.id] : null; },

  jumpFromPlane() { this.phase = 'freefall'; this.vel.set(this.planeDir.x * 18, -4, this.planeDir.z * 18); HUD.banner(I18n.t('hud.freefall', { k: Input.key('jump') }), 2.5); Sound.land(false); },
  openGlider() { if (this.phase !== 'freefall') return; this.phase = 'glide'; HUD.banner(I18n.t('hud.chute'), 1.4); Sound.whoosh(null); },

  tryCrouchOrSlide() {
    if (this.riding) return;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.sprinting && sp > 6.5 && this.onGround && this.sliding <= 0 && !this.swimming) {
      this.sliding = 0.95; this.slideDir.set(this.vel.x, 0, this.vel.z).normalize(); this.crouch = true; Sound.slide();
    } else this.crouch = !this.crouch;
  },

  update(dt) {
    if (!this.alive) { this.yaw += dt * 0.15; this.updateCamera(dt); this.updateRig(dt); if (this.vmRoot) this.vmRoot.visible = false; return; }
    G.noiseLevel = 0;
    if (this.phase === 'plane') this.updatePlane(dt);
    else if (this.phase === 'freefall' || this.phase === 'glide') this.updateAir(dt);
    else if (this.phase === 'riding') this.updateRiding(dt);
    else this.updateGround(dt);
    this.updateWeapon(dt);
    this.updateUse(dt); this.autoLoot(dt);
    this.trackMatch(dt);
    this.updateCamera(dt);
    this.updateRig(dt);
    this.updateViewmodel(dt);
    this.updatePrompt();
  },

  moveInput() {
    return Input.axis();
  },

  updatePlane(dt) {
    this.pos.addScaledVector(this.planeDir, 38 * dt);
    this.planeT += dt;
    if (Math.max(Math.abs(this.pos.x), Math.abs(this.pos.z)) > MAP.half + 30 && this.planeT > 3) this.jumpFromPlane();
  },

  updateAir(dt) {
    const m = this.moveInput(), fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const glide = this.phase === 'glide', sp = glide ? 14 : 22, ty = glide ? -6.5 : -50;
    const tx = (fx * m.f + rx * m.r) * sp, tz = (fz * m.f + rz * m.r) * sp;
    this.vel.x = lerp(this.vel.x, tx, Math.min(1, dt * 1.4)); this.vel.z = lerp(this.vel.z, tz, Math.min(1, dt * 1.4));
    this.vel.y = lerp(this.vel.y, ty, Math.min(1, dt * (glide ? 3.2 : 1.1)));
    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = clamp(this.pos.x, -MAP.half + 4, MAP.half - 4); this.pos.z = clamp(this.pos.z, -MAP.half + 4, MAP.half - 4);
    const g = groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
    if (this.phase === 'freefall' && this.pos.y - g < 85) this.openGlider();
    if (this.pos.y <= g + 0.05) { this.pos.y = g; this.phase = 'ground'; this.onGround = true; this.vel.set(0, 0, 0); this.landDip = 0.12; HUD.banner('', 0); Sound.land(false); }
  },

  updateGround(dt) {
    const m = this.moveInput();
    if (this.crouch && this.sliding <= 0 && ((Input.act.sprint && m.f > 0.2) || Input.act.jump)) this.crouch = false;
    const w = this.wdef(), wm = w ? w.move : 1;
    const depth = waterDepth(this.pos.x, this.pos.z);
    this.swimming = depth > 1.2;
    const wading = depth > 0.25;
    const sprintKey = (Input.act.sprint || keys.ShiftLeft) && m.f > 0.2 && !this.crouch && !this.aiming && this.reloadT <= 0 && this.useT <= 0 && !wading && this.charging <= 0;
    this.sprinting = sprintKey && !this.firing && !(this.fireQueueT > 0);
    let sp = this.crouch ? 2.7 : this.sprinting ? 8.4 : 5.1;
    sp *= wm * (1 + (this.fx ? this.fx.speed : 0)); if (this.aiming && !this.sprinting) sp *= this.crouch ? 0.8 : 0.62;
    if (this.useT > 0) sp *= 0.5; if (wading) sp *= 0.62; if (this.swimming) sp *= 0.75;
    if (this.spin > 0.2) sp *= 0.7;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let tx = (fx * m.f + rx * m.r) * sp, tz = (fz * m.f + rz * m.r) * sp;
    if (this.sliding > 0) {
      this.sliding -= dt; const k = Math.max(0, this.sliding / 0.95), v = 3 + 7.5 * k * k;
      tx = this.slideDir.x * v; tz = this.slideDir.z * v;
      if (this.sliding <= 0) this.crouch = Input.act.crouchHeld;
      if (Input.act.jump) { this.sliding = 0; this.crouch = false; }
    }
    const acc = Math.min(1, dt * (this.sliding > 0 ? 3 : this.onGround ? 11 : 2.4));
    this.vel.x = lerp(this.vel.x, tx, acc); this.vel.z = lerp(this.vel.z, tz, acc);

    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const g0 = aheadGround(this.pos, this.vel.x, this.vel.z);
    if (g0 > this.pos.y && g0 - this.pos.y <= 0.75) this.pos.y = g0;
    pushOutOfColliders(this.pos, 0.4, this.crouch ? 1.2 : 1.75);
    const g1 = groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (g1 - this.pos.y > 1.1 && this.onGround) { this.pos.x = ox; this.pos.z = oz; }
    this.pos.x = clamp(this.pos.x, -MAP.half + 3, MAP.half - 3); this.pos.z = clamp(this.pos.z, -MAP.half + 3, MAP.half - 3);

    if (Input.act.jump && this.onGround && !this.crouch && this.sliding <= 0 && !this.swimming) { this.vel.y = 7.0; this.onGround = false; Sound.jump(); }
    let ground = groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.swimming) ground = Math.max(ground, WATER_Y - 1.15);
    if (this.onGround) { if (this.pos.y - ground > 0.7) this.onGround = false; else this.pos.y = ground; }
    if (!this.onGround) {
      this.vel.y -= 20 * dt; this.pos.y += this.vel.y * dt;
      const g2 = groundAt(this.pos.x, this.pos.z, this.pos.y - this.vel.y * dt);
      const gg = this.swimming ? Math.max(g2, WATER_Y - 1.15) : g2;
      if (this.pos.y <= gg) {
        const imp = -this.vel.y;
        if (imp > 15 && !this.swimming) this.takeDamage((imp - 15) * 6, null, false);
        if (imp > 3) { this.landDip = clamp(imp * 0.012, 0.03, 0.22); Sound.land(imp > 11); }
        this.pos.y = gg; this.vel.y = 0; this.onGround = true;
      }
    }
    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.speed = spd;
    this.bobT += dt * spd * (this.sprinting ? 1.05 : 1.3) * (this.crouch ? 0.8 : 1);
    if (this.onGround && spd > 1.2 && this.sliding <= 0) {
      this.stepD += spd * dt;
      const every = this.sprinting ? 2.5 : this.crouch ? 1.8 : 2.0;
      if (this.stepD > every) {
        this.stepD = 0; const surf = this.swimming || wading ? 'water' : surfaceAt(this.pos.x, this.pos.z, this.pos.y);
        Sound.step(surf, null, this.crouch ? 0.45 : this.sprinting ? 1.1 : 0.85);
        addNoise(this.pos.x, this.pos.z, (this.crouch ? 6 : this.sprinting ? 28 : 15) * (1 - (this.fx ? this.fx.quiet : 0)), this);
      }
    }
    if (wading && spd > 1.5 && Math.random() < dt * 8) FX.dust(this.pos, this.vel, [0.8, 0.9, 1], 0.4);
  },

  updateRiding(dt) { Vehicles.updatePlayerRide(this, dt); },

  knock(dx, dz, f) { this.vel.x += dx * f; this.vel.z += dz * f; if (this.onGround && f > 4) { this.vel.y = 3; this.onGround = false; } },

  // ---------- camera ----------
  vfovFromH(h) { return 2 * Math.atan(Math.tan(h * Math.PI / 360) / G.camera.aspect) * 180 / Math.PI; },

  updateCamera(dt) {
    const cam = G.camera, d = this.wdef(), w = this.weapon();
    const tppSetting = Settings.get('perspective') === 'tpp' || !this.alive;
    const sight = w ? SIGHTS[w.sight] : null;
    const scoped = !!(this.aiming && sight && sight.scope && !this.riding && this.phase !== 'plane');
    this.scoped = scoped && this.aimT > 0.6;
    this.tppNow = tppSetting && !this.scoped && this.phase !== 'plane';
    const wantEye = this.riding ? 1.35 : this.sliding > 0 ? 0.85 : this.crouch ? 1.15 : (this.swimming ? 0.9 : 1.62);
    this.eyeH = lerp(this.eyeH, wantEye, Math.min(1, dt * 12));
    this.landDip = lerp(this.landDip, 0, Math.min(1, dt * 9));
    const bobK = Settings.get('headbob') * (this.onGround ? Math.min(1, this.speed / 6) : 0) * (this.aiming ? 0.2 : 1) * (this.sprinting ? 1.5 : 1);
    const bobY = Math.sin(this.bobT * 2) * 0.022 * bobK, bobX = Math.sin(this.bobT) * 0.014 * bobK;
    // scope sway (sniper breathing)
    if (this.scoped) {
      const hold = Input.act.breath && this.breath > 0.05;
      this.breath = clamp(this.breath + (hold ? -0.3 : 0.2) * dt, 0, 1);
      const amp = hold ? 0.0 : 0.0016 * (1 + Math.hypot(this.vel.x, this.vel.z) * 0.6);
      this.swayX = Math.sin(G.time * 1.3) * amp + Math.sin(G.time * 2.9) * amp * 0.4; this.swayY = Math.cos(G.time * 1.7) * amp * 0.8;
    } else { this.swayX = lerp(this.swayX, 0, dt * 8); this.swayY = lerp(this.swayY, 0, dt * 8); this.breath = clamp(this.breath + dt * 0.3, 0, 1); }
    // recoil recovery
    if (G.time - this.lastFireT > 0.1 && this.recoilAcc > 0) { const r = Math.min(this.recoilAcc, dt * (0.25 + this.recoilAcc * 5)); this.pitch -= r; this.recoilAcc -= r; }
    if (G.time - this.lastFireT > 0.25) this.recoilIdx = Math.max(0, this.recoilIdx - dt * 14);
    this.kick = lerp(this.kick, 0, Math.min(1, dt * 12));
    const pitchTot = clamp(this.pitch + this.swayY + this.kick * 0.012, -1.55, 1.55), yawTot = this.yaw + this.swayX;
    const roll = this.sliding > 0 ? 0.05 : -Input.axis().r * 0.012;
    cam.rotation.set(pitchTot, yawTot, roll, 'YXZ');
    cam.updateMatrixWorld();

    const eye = new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH - this.landDip + bobY, this.pos.z);
    FX.shakeOffset(_shake);
    if (this.tppNow) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const ck = (this.rig && this.rig.camK) || 1;                                              // big-headed skeletal characters need the camera a bit further out and more to the side
      const dist = (this.riding ? 4.3 : this.aimT > 0.3 ? 1.9 : 2.7) * ck, side = (this.riding ? 0 : this.aimT > 0.3 ? 0.55 : 0.5) * (1 + (ck - 1) * 1.6);
      const head = eye.clone(); head.y += 0.1;
      const want = head.clone().addScaledVector(fwd, -dist).addScaledVector(right, side).add(new THREE.Vector3(0, 0.12, 0));
      const dir = want.clone().sub(head), len = dir.length(); dir.normalize();
      let t = Math.min(len, rayBoxes(head, dir, len).dist - 0.25, rayTerrain(head, dir, len) - 0.25);
      t = Math.max(0.3, t);
      cam.position.copy(head).addScaledVector(dir, t);
      const gh = terrainHeight(cam.position.x, cam.position.z) + 0.25; if (cam.position.y < gh) cam.position.y = gh;
    } else cam.position.copy(eye).add(new THREE.Vector3(bobX, 0, 0).applyQuaternion(cam.quaternion));
    cam.position.add(_shake);
    this.camPos.copy(cam.position);

    // field of view
    const baseH = Settings.get('fov') + (this.sprinting ? 5 : 0) + (this.riding && this.bike ? Math.min(14, this.bike.speed * 0.3) : 0) + (this.phase === 'freefall' ? 10 : 0);
    this.aimT = lerp(this.aimT, this.aiming && this.useT <= 0 && this.reloadT <= 0 && this.phase !== 'plane' && this.phase !== 'freefall' && !this.sprinting && !this.riding ? 1 : 0, Math.min(1, dt * (sight && sight.scope ? 9 : 12)));
    const zoom = sight ? sight.zoom : 1.2;
    const tanH = Math.tan(baseH * Math.PI / 360) / lerp(1, zoom, this.aimT);
    const vf = 2 * Math.atan(tanH / cam.aspect) * 180 / Math.PI;
    this.fovV = lerp(this.fovV, vf, Math.min(1, dt * 14));
    if (Math.abs(cam.fov - this.fovV) > 0.005) { cam.fov = this.fovV; cam.updateProjectionMatrix(); }
    G.camera.updateMatrixWorld();
  },

  // ---------- body model (third person / shadows) ----------
  updateRig(dt) {
    const r = this.rig; if (!r) return;
    const w = this.weapon(), key = w ? w.id + w.rarity + w.sight : '';
    if (key !== this.rigGunKey) { this.rigGunKey = key; r.setGun(w ? GM.build(w.id, w.rarity, w.sight) : null, w ? WEAPONS[w.id].hold : 'rifle'); }
    r.root.visible = this.tppNow || (this.phase === 'plane' ? false : false);
    if (!r.root.visible) return;
    if (this.riding && this.bike) this.bike.attachRider(r.root);                                    // on a bike the body is part of the bike
    else { if (r.root.parent !== G.scene) G.scene.add(r.root); r.root.position.copy(this.pos); r.root.rotation.y = this.yaw; }
    const md = Character.moveDir(this.vel.x, this.vel.z, this.yaw, this.speed || 0);
    r.update(dt, {
      speed: this.phase === 'ground' ? this.speed : 0, fwd: md.dirz < -0.3 ? -1 : 1, dirx: md.dirx, dirz: md.dirz, swim: this.swimming, crouch: this.crouch, raise: this.aimT > 0.3 || G.time - this.lastFireT < 1.2 ? 1 : 0, sprint: this.sprinting,
      pitch: this.pitch, slide: this.sliding > 0, air: !this.onGround && this.phase === 'ground', ride: this.riding, dead: !this.alive,
      reload: this.reloadT > 0 ? 1 - this.reloadT / this.reloadTotal : 0, drop: this.phase === 'freefall' ? 'free' : this.phase === 'glide' ? 'glide' : null, recoil: this.kick
    });
    if (r.tick) r.tick(dt);
  },

  updatePrompt() {
    const k = Input.key('interact');
    if (this.phase === 'plane') { HUD.prompt(I18n.t('prompt.jump', { k: Input.key('jump') })); Input.setInteract(false); return; }
    if (this.phase === 'freefall') { HUD.prompt(I18n.t('prompt.glide', { k: Input.key('jump') })); Input.setInteract(false); return; }
    if (this.riding) { HUD.prompt(I18n.t('prompt.dismount', { k })); Input.setInteract(true); return; }
    if (this.phase !== 'ground') { HUD.prompt(null); Input.setInteract(false); return; }
    const b = Vehicles.nearest(this.pos, 3.2);
    if (b) { HUD.prompt(I18n.t('prompt.mount', { k, name: b.def.name }), b.def.color); Input.setInteract(true); return; }
    const l = Loot.nearest(this.pos, 2.6);
    HUD.prompt(l ? I18n.t('prompt.pick', { k, item: Loot.label(l.item) }) : null, l ? Loot.color(l.item) : null); Input.setInteract(!!l);
  },

  // ---------- damage ----------
  takeDamage(amount, attacker, head, wid) {
    if (!this.alive || G.state !== 'playing' || this.invuln) return;
    if (this.useT > 0) { this.useT = 0; this.pendingUse = null; HUD.useBar(0); }
    if (attacker && this.fx) { amount *= 1 - this.fx.dr; if (head) amount *= 1 - this.fx.hsDr; }     // vest / helmet from the shop
    if (attacker && Profile.match && amount > 1) Profile.match.took = true;
    const sh = Math.min(this.shield, amount); this.shield -= sh; this.health -= amount - sh;
    if (amount > 1) {
      if (attacker && attacker !== this && attacker.pos) HUD.damageDir(attacker.pos);
      HUD.damageFlash(attacker ? 'hit' : 'zone');
      if (attacker) Sound.hurt();
    }
    this.lastAttacker = attacker; this.lastWeapon = wid;
    if (this.health <= 0) { this.health = 0; this.die(attacker, wid); }
  },

  die(attacker, wid) {
    this.alive = false; this.firing = false; this.aiming = false; this.frozen = false;
    if (this.riding) Vehicles.dismount(this, true);
    Sound.spinStop(); Sound.engineStop();
    if (this.rig) { this.rig.root.visible = true; this.rig.root.position.copy(this.pos); this.rig.root.rotation.y = this.yaw; this.tppNow = true; }
    Game.playerDied(attacker, wid);
  }
};

const _shake = new THREE.Vector3();
