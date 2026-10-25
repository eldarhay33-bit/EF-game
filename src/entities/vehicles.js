// Motorcycles in four tiers: arcade physics on the terrain, mounting for the player and bots, run-over damage, engine sound.
const BIKE_DEFS = [
  { id: 'scooter', name: '',    tier: 0, max: 20, acc: 11, turn: 1.9, body: 0x6f8a4a, color: 0xb4b8bc, armor: 0,    boost: false },
  { id: 'sport',   name: '', tier: 1, max: 33, acc: 16, turn: 2.1, body: 0x2a6fd6, color: 0x3aa0ff, armor: 0,    boost: false },
  { id: 'raider',  name: '', tier: 2, max: 27, acc: 13, turn: 1.7, body: 0x4d5238, color: 0xb25cff, armor: 0.4, boost: false },
  { id: 'hyper',   name: '',    tier: 3, max: 40, acc: 22, turn: 2.3, body: 0x16181c, color: 0xffb833, armor: 0.15, boost: true }
];

class Bike {
  constructor(def, x, z, yaw) {
    this.def = def; this.pos = new THREE.Vector3(x, terrainHeight(x, z), z); this.yaw = yaw; this.speed = 0; this.vy = 0;
    this.steer = 0; this.roll = 0; this.pitch = 0; this.rider = null; this.grounded = true; this.boostT = 0; this.boostCd = 0; this.wheelRot = 0; this.stuck = 0; this.fuel = 1;
    this.build();
    this.sync();
  }

  build() {
    const d = this.def, root = new THREE.Group(), mk = (o) => new THREE.MeshStandardMaterial(Object.assign({ envMapIntensity: 1.2 }, o));
    const body = mk({ color: d.body, metalness: 0.65, roughness: 0.28 }), dark = mk({ color: 0x1b1c1e, metalness: 0.5, roughness: 0.5 }), steel = mk({ color: 0x9a9da0, metalness: 0.95, roughness: 0.25 });
    const rubber = mk({ color: 0x141414, roughness: 0.95, metalness: 0 }), lamp = mk({ color: 0xffffee, emissive: 0xfff2cc, emissiveIntensity: 2 });
    const neon = mk({ color: d.color, emissive: d.color, emissiveIntensity: 2.2 }), glass = mk({ color: 0x88aacc, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.4 });
    const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
    const cylZ = (r, l, s = 10) => new THREE.CylinderGeometry(r, r, l, s).rotateX(Math.PI / 2);
    // main body parts
    add(root, new THREE.BoxGeometry(0.09, 0.1, 1.15), dark, 0, 0.5, 0.05);
    add(root, new THREE.BoxGeometry(0.3, 0.3, 0.42), steel, 0, 0.4, -0.02);
    add(root, new THREE.CapsuleGeometry(0.15, 0.32, 4, 10).rotateX(Math.PI / 2), body, 0, 0.72, -0.22);
    add(root, new THREE.BoxGeometry(0.26, 0.1, 0.6), dark, 0, 0.72, 0.38);
    add(root, new THREE.BoxGeometry(0.2, 0.05, 0.42), body, 0, 0.66, 0.82, -0.15);
    for (const s of [-1, 1]) { add(root, new THREE.BoxGeometry(0.05, 0.07, 0.8), dark, s * 0.1, 0.38, 0.38); add(root, cylZ(0.04, 0.75), steel, s * 0.14, 0.3, 0.42); }
    add(root, new THREE.BoxGeometry(0.1, 0.1, 0.1), lamp, 0, 0.7, 0.86);
    // rear wheel
    this.wheelR = new THREE.Group(); this.wheelR.position.set(0, 0.33, 0.66); root.add(this.wheelR);
    add(this.wheelR, new THREE.CylinderGeometry(0.33, 0.33, 0.15, 22).rotateZ(Math.PI / 2), rubber, 0, 0, 0);
    add(this.wheelR, new THREE.CylinderGeometry(0.2, 0.2, 0.16, 16).rotateZ(Math.PI / 2), steel, 0, 0, 0);
    for (let i = 0; i < 4; i++) add(this.wheelR, new THREE.BoxGeometry(0.17, 0.04, 0.38), dark, 0, 0, 0, i * Math.PI / 4);
    // steering assembly
    this.fork = new THREE.Group(); this.fork.position.set(0, 0.66, -0.5); root.add(this.fork);
    for (const s of [-1, 1]) add(this.fork, new THREE.CylinderGeometry(0.025, 0.03, 0.72, 8), steel, s * 0.08, -0.28, -0.12, -0.28);
    add(this.fork, new THREE.BoxGeometry(0.74, 0.04, 0.05), steel, 0, 0.3, 0.12);
    for (const s of [-1, 1]) add(this.fork, cylZ(0.022, 0.12), rubber, s * 0.38, 0.3, 0.12);
    add(this.fork, new THREE.SphereGeometry(0.09, 12, 10), lamp, 0, 0.18, -0.2);
    add(this.fork, new THREE.BoxGeometry(0.26, 0.2, 0.18), body, 0, 0.2, -0.12);
    this.wheelF = new THREE.Group(); this.wheelF.position.set(0, -0.33, -0.2); this.fork.add(this.wheelF);
    add(this.wheelF, new THREE.CylinderGeometry(0.33, 0.33, 0.13, 22).rotateZ(Math.PI / 2), rubber, 0, 0, 0);
    add(this.wheelF, new THREE.CylinderGeometry(0.2, 0.2, 0.14, 16).rotateZ(Math.PI / 2), steel, 0, 0, 0);
    for (let i = 0; i < 4; i++) add(this.wheelF, new THREE.BoxGeometry(0.15, 0.04, 0.38), dark, 0, 0, 0, i * Math.PI / 4);
    // tier extras
    if (d.id === 'sport') { add(root, new THREE.BoxGeometry(0.34, 0.3, 0.55), body, 0, 0.55, -0.35); add(this.fork, new THREE.BoxGeometry(0.22, 0.2, 0.04), glass, 0, 0.42, -0.12, -0.5); }
    if (d.id === 'raider') {
      for (const s of [-1, 1]) { add(root, new THREE.BoxGeometry(0.05, 0.32, 0.55), body, s * 0.2, 0.55, 0.15); add(root, new THREE.BoxGeometry(0.2, 0.22, 0.3), dark, s * 0.28, 0.62, 0.7); }
      add(this.fork, new THREE.BoxGeometry(0.5, 0.06, 0.06), steel, 0, -0.02, -0.34); add(this.fork, new THREE.BoxGeometry(0.06, 0.4, 0.06), steel, 0.2, -0.2, -0.34); add(this.fork, new THREE.BoxGeometry(0.06, 0.4, 0.06), steel, -0.2, -0.2, -0.34);
    }
    if (d.id === 'hyper') {
      for (const s of [-1, 1]) { add(root, new THREE.BoxGeometry(0.02, 0.03, 0.9), neon, s * 0.17, 0.46, 0.08); add(this.wheelF, new THREE.TorusGeometry(0.31, 0.012, 6, 28).rotateY(Math.PI / 2), neon, s * 0.07, 0, 0); add(this.wheelR, new THREE.TorusGeometry(0.31, 0.012, 6, 28).rotateY(Math.PI / 2), neon, s * 0.08, 0, 0); }
      add(root, new THREE.BoxGeometry(0.5, 0.03, 0.22), body, 0, 0.98, 0.9); add(root, new THREE.BoxGeometry(0.03, 0.2, 0.2), neon, 0.24, 0.9, 0.9); add(root, new THREE.BoxGeometry(0.03, 0.2, 0.2), neon, -0.24, 0.9, 0.9);
      add(root, new THREE.BoxGeometry(0.34, 0.26, 0.5), body, 0, 0.56, -0.38); this.exhaust = new THREE.Object3D(); this.exhaust.position.set(0, 0.5, 1.0); root.add(this.exhaust);
    }
    this.root = root; G.scene.add(root);
    this.parts = []; root.traverse(o => { if (o.isMesh) this.parts.push(o); });
  }

  sync() {
    const r = this.root;
    r.position.copy(this.pos); r.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.fork.rotation.y = -this.steer * 0.5;
    this.wheelF.rotation.x = this.wheelR.rotation.x = this.wheelRot;
  }

  seat() { return new THREE.Vector3(0, 0.78, 0.18).applyEuler(this.root.rotation).add(this.pos); }

  drive(dt, inp) {
    const d = this.def, max = d.max * (this.boostT > 0 ? 1.3 : 1);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    // boost
    if (d.boost) { this.boostCd = Math.max(0, this.boostCd - dt); if (inp.boost && this.boostT <= 0 && this.boostCd <= 0) { this.boostT = 1.8; this.boostCd = 5; } }
    if (this.boostT > 0) { this.boostT -= dt; this.speed += d.acc * 1.6 * dt; if (this.exhaust) { const p = this.exhaust.getWorldPosition(new THREE.Vector3()); FX.glow.spawn(p.x, p.y, p.z, -fx * 4, 0, -fz * 4, 0.25, 0.35, 0.05, 0.3, 0.9, 1, 0.9, 0); } }
    const water = waterDepth(this.pos.x, this.pos.z);
    // throttle / brake
    if (inp.thr > 0 && water < 0.7) this.speed += d.acc * (1 - Math.max(0, this.speed) / max * 0.92) * dt * inp.thr;
    else this.speed *= Math.max(0, 1 - 0.35 * dt);
    if (inp.brake > 0) { if (this.speed > 0.5) this.speed -= 24 * dt; else this.speed = Math.max(-7, this.speed - 9 * dt); }
    if (inp.hand) this.speed *= Math.max(0, 1 - 3.2 * dt);
    if (water > 0.5) this.speed *= Math.max(0, 1 - 2.2 * dt);
    this.speed = clamp(this.speed, -7, max * 1.05);
    // steering
    const ts = inp.steer * (inp.hand ? 1.5 : 1);
    this.steer = lerp(this.steer, ts, Math.min(1, dt * 7));
    const grip = clamp(Math.abs(this.speed) / 5, 0, 1) * (1 - Math.abs(this.speed) / (max * 2.2));
    this.yaw -= this.steer * d.turn * grip * Math.sign(this.speed || 1) * dt;
    this.roll = lerp(this.roll, -this.steer * clamp(this.speed / max, 0, 1) * 0.55, Math.min(1, dt * 6));
    // move
    const ox = this.pos.x, oz = this.pos.z, oldSpeed = this.speed;
    this.pos.x += fx * this.speed * dt; this.pos.z += fz * this.speed * dt;
    const before = this.pos.clone(); this.pos.y = Math.max(this.pos.y, 0);
    pushOutOfColliders(this.pos, 0.55, 1.3);
    const pushed = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    this.pos.x = clamp(this.pos.x, -MAP.half + 4, MAP.half - 4); this.pos.z = clamp(this.pos.z, -MAP.half + 4, MAP.half - 4);
    const gF = groundAt(this.pos.x + fx * 0.62, this.pos.z + fz * 0.62, this.pos.y + 0.5), gR = groundAt(this.pos.x - fx * 0.62, this.pos.z - fz * 0.62, this.pos.y + 0.5);
    let ground = (gF + gR) / 2;
    if (ground - this.pos.y > 0.9 && this.grounded) { this.pos.x = ox; this.pos.z = oz; this.speed *= 0.25; }
    this.crashed = false;
    if (pushed > 0.02 && Math.abs(this.speed) > 3) {
      const hitSpeed = Math.abs(this.speed); this.speed *= 0.35; this.crashed = true;
      if (hitSpeed > 11 && this.rider && this.rider.takeDamage) this.rider.takeDamage((hitSpeed - 10) * 2.6 * (1 - d.armor), null, false);
      if (hitSpeed > 7) { Sound.impact('metal', this.pos); FX.shake(0.3, 0.25); }
    }
    if (this.grounded) { if (this.pos.y - ground > 0.5) this.grounded = false; else this.pos.y = lerp(this.pos.y, ground, Math.min(1, dt * 20)); }
    if (!this.grounded) {
      this.vy -= 20 * dt; this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) { if (this.vy < -9 && this.rider && this.rider.takeDamage) this.rider.takeDamage((-this.vy - 9) * 3 * (1 - d.armor), null, false); if (this.vy < -4) FX.shake(0.25, 0.2); this.pos.y = ground; this.vy = 0; this.grounded = true; }
    }
    const targetPitch = Math.atan2(gF - gR, 1.24);
    this.pitch = lerp(this.pitch, this.grounded ? targetPitch : this.pitch * 0.9, Math.min(1, dt * 10));
    this.wheelRot -= this.speed * dt / 0.33;
    this.stuck = Math.abs(this.speed) < 0.8 && inp.thr > 0 ? this.stuck + dt : 0;
    // run over actors
    if (Math.abs(this.speed) > 7 && this.rider) {
      for (const a of Combat.actors()) {
        if (a === this.rider || a.riding) continue;
        const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z;
        if (dx * dx + dz * dz < 1.2 && Math.abs(a.pos.y - this.pos.y) < 1.6) { const dmg = Math.abs(this.speed) * 4.5; a.takeDamage(dmg, this.rider, false, 'bike'); if (a.knock) a.knock(fx, fz, 5); else { a.vy = 4; a.onGround = false; } this.speed *= 0.8; Sound.impact('flesh', a.pos); }
      }
    }
    // dust
    if (this.grounded && Math.abs(this.speed) > 6 && Math.random() < dt * Math.abs(this.speed) * 0.9 && water < 0.3) {
      const surf = surfaceAt(this.pos.x, this.pos.z, this.pos.y), c = surf === 'sand' ? [0.78, 0.66, 0.45] : surf === 'grass' ? [0.35, 0.32, 0.22] : [0.55, 0.5, 0.42];
      FX.dust(new THREE.Vector3(this.pos.x - fx * 0.7, this.pos.y, this.pos.z - fz * 0.7), { x: -fx * this.speed, z: -fz * this.speed }, c, 0.55);
    }
    this.sync();
  }

  setParked() { this.speed = 0; this.steer = 0; this.sync(); }
}

const Vehicles = {
  bikes: [],

  reset() { for (const b of this.bikes) G.scene.remove(b.root); this.bikes = []; },

  spawnAll() {
    this.reset();
    const spots = World.bikeSpots.slice();
    for (const s of spots) {
      const x = s.x, z = s.z;
      if (waterDepth(x, z) > 0.1) continue;
      const tier = clamp(s.tier + (Math.random() < 0.2 ? 1 : 0) - (Math.random() < 0.15 ? 1 : 0), 0, 3);
      const b = new Bike(BIKE_DEFS[tier], x, z, Math.random() * 6.28);
      this.bikes.push(b);
    }
  },

  nearest(pos, maxD) {
    let best = null, bd = maxD;
    for (const b of this.bikes) { if (b.rider) continue; const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z); if (d < bd && Math.abs(b.pos.y - pos.y) < 2.5) { bd = d; best = b; } }
    return best;
  },

  update(dt) {
    const c = G.camera.position;
    for (const b of this.bikes) {
      if (!b.rider) { b.sync(); b.root.visible = Math.hypot(b.pos.x - c.x, b.pos.z - c.z) < 260; }
      else b.root.visible = true;
    }
  },

  mount(p, b) {
    p.riding = true; p.bike = b; b.rider = p; p.phase = 'riding'; p.crouch = false; p.sliding = 0; p.aiming = false; p.sprinting = false;
    p.yaw = b.yaw; p.reloadT = 0; p.charging = 0;
    HUD.banner(I18n.t('bike.help', { name: b.def.name, keys: I18n.t('bike.keys', { hand: Input.key('jump') }) + (b.def.boost ? I18n.t('bike.boost', { boost: Input.key('sprint') }) : '') }), 2.5);
    Sound.engineStart(); Sound.ui();
  },

  dismount(p, dead) {
    const b = p.bike; if (!b) return;
    p.riding = false; p.phase = 'ground'; p.bike = null; b.rider = null;
    const rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    p.pos.set(b.pos.x - rx * 1.1, b.pos.y, b.pos.z - rz * 1.1); pushOutOfColliders(p.pos, 0.4);
    p.pos.y = groundAt(p.pos.x, p.pos.z, b.pos.y + 1);
    p.vel.set(-Math.sin(b.yaw) * b.speed * 0.45, 0, -Math.cos(b.yaw) * b.speed * 0.45); p.onGround = true;
    b.speed *= 0.3; Sound.engineStop();
  },

  updatePlayerRide(p, dt) {
    const b = p.bike; if (!b) { p.phase = 'ground'; p.riding = false; return; }
    const inp = Input.drive();
    b.drive(dt, inp);
    const s = b.seat(); p.pos.set(b.pos.x, b.pos.y + 0.3, b.pos.z); p.vel.set(-Math.sin(b.yaw) * b.speed, 0, -Math.cos(b.yaw) * b.speed);
    p.speed = Math.abs(b.speed); p.onGround = b.grounded; p.bobT += dt * 2;
    if (G.time - (p.lastLookT || 0) > 1.3 && Math.abs(b.speed) > 3) p.yaw += angDiff(p.yaw, b.yaw) * Math.min(1, dt * 2.2);
    Sound.engineSet(clamp(Math.abs(b.speed) / b.def.max, 0, 1.3), b.boostT > 0);
    if (Math.random() < dt * 2) addNoise(b.pos.x, b.pos.z, 40 + Math.abs(b.speed) * 2, p);
  }
};
