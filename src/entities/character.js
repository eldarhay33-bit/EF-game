// Humanoid rig with two-bone arm IK (hands follow the held weapon), procedural walk/run/crouch/slide/ride poses and skins.

const Character = {
  mats: {}, geo: null,
  byId(id) { return SKINS.find(s => s.id === id) || SKINS[0]; },

  materialsFor(skin, tone) {
    const k = skin.id + tone;
    if (this.mats[k]) return this.mats[k];
    const cloth = new THREE.MeshPhysicalMaterial({
      map: skin.camo ? Tex.camo(skin.camo, SKINS.indexOf(skin) + 1, skin.period) : null, color: skin.camo ? 0xffffff : skin.cloth,
      roughness: skin.metal ? 0.35 : 0.88, metalness: skin.metal || 0, envMapIntensity: 0.8, sheen: skin.metal ? 0 : 0.7, sheenRoughness: 0.45, sheenColor: new THREE.Color(skin.camo ? skin.camo[2] : skin.cloth).lerp(new THREE.Color(0xffffff), 0.45), clearcoat: skin.metal ? 0.6 : 0, clearcoatRoughness: 0.22
    });
    const gear = new THREE.MeshPhysicalMaterial({ color: skin.gear, roughness: 0.62, metalness: skin.metal ? 0.6 : 0.1, envMapIntensity: 0.8, clearcoat: 0.35, clearcoatRoughness: 0.3 });
    const helmet = new THREE.MeshPhysicalMaterial({ color: skin.helmet, roughness: 0.42, metalness: skin.metal ? 0.7 : 0.25, envMapIntensity: 1.0, clearcoat: 0.75, clearcoatRoughness: 0.14 });
    const flesh = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.65, metalness: 0 });
    const pants = cloth.clone(); pants.color = new THREE.Color(skin.camo ? 0xb9b9b9 : skin.cloth).multiplyScalar(skin.camo ? 1 : 0.82);
    const mask = new THREE.MeshStandardMaterial({ color: new THREE.Color(skin.gear).multiplyScalar(1.15), roughness: 0.9, metalness: 0 });
    const glow = skin.glow ? new THREE.MeshStandardMaterial({ color: skin.glow, emissive: skin.glow, emissiveIntensity: 2.2 }) : null;
    const visor = new THREE.MeshStandardMaterial({ color: skin.glow || 0x222a33, emissive: skin.glow || 0x000000, emissiveIntensity: skin.glow ? 1.3 : 0, roughness: 0.1, metalness: 0.6 });
    return (this.mats[k] = { cloth, pants, gear, helmet, flesh, mask, glow, visor });
  },

  faceMat() { return this.mats.face || (this.mats.face = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })); },

  geos() {
    if (this.geo) return this.geo;
    const cyl = (a, b, l, s = 18) => new THREE.CylinderGeometry(a, b, l, s);
    const sph = (r, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 20, 14).scale(sx, sy, sz);
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const T = (g, x, y, z) => g.translate(x, y, z);
    this.geo = {
      thigh: T(cyl(0.088, 0.064, 0.46), 0, -0.23, 0), knee: T(sph(0.066), 0, -0.01, 0.0), shin: T(cyl(0.062, 0.048, 0.44), 0, -0.22, 0), calf: T(sph(0.06, 1, 1.3, 1.05), 0, -0.14, 0.02),
      boot: T(box(0.12, 0.13, 0.3), 0, -0.45, -0.045), toe: T(sph(0.065, 0.95, 0.65, 1.2), 0, -0.47, -0.17), sole: T(box(0.125, 0.03, 0.32), 0, -0.52, -0.04), cuff: T(cyl(0.062, 0.066, 0.06, 10), 0, -0.4, 0),
      kneepad: T(box(0.105, 0.11, 0.045), 0, -0.01, -0.072), holster: T(box(0.06, 0.17, 0.09), 0.1, -0.13, 0.0),
      upperArm: T(cyl(0.058, 0.047, 0.3), 0, -0.15, 0), elbow: T(sph(0.05), 0, -0.285, 0), foreArm: T(cyl(0.048, 0.04, 0.27), 0, -0.145, 0), glove: T(sph(0.052, 1, 1.15, 1), 0, -0.3, 0), cuffArm: T(cyl(0.05, 0.052, 0.05, 8), 0, -0.25, 0),
      torso: T(cyl(0.18, 0.15, 0.52, 16).scale(1.08, 1, 0.64), 0, 0.27, 0),
      pelvis: T(box(0.33, 0.17, 0.2), 0, -0.02, 0), belt: T(box(0.36, 0.055, 0.225), 0, 0.075, 0), buckle: T(box(0.06, 0.05, 0.02), 0, 0.075, -0.115),
      vest: T(box(0.35, 0.34, 0.215), 0, 0.33, 0), plateF: T(box(0.26, 0.28, 0.045), 0, 0.34, -0.125), plateB: T(box(0.24, 0.26, 0.04), 0, 0.34, 0.125),
      strapL: T(box(0.06, 0.2, 0.235), -0.12, 0.52, 0), strapR: T(box(0.06, 0.2, 0.235), 0.12, 0.52, 0), pouch: box(0.075, 0.1, 0.055), radio: T(box(0.05, 0.14, 0.04), -0.13, 0.44, -0.12), antenna: T(cyl(0.004, 0.004, 0.22, 4), -0.13, 0.62, -0.12),
      pack: T(box(0.27, 0.36, 0.15), 0, 0.3, 0.185), roll: T(cyl(0.05, 0.05, 0.32, 8).rotateZ(Math.PI / 2), 0, 0.5, 0.2), packTop: T(box(0.22, 0.08, 0.12), 0, 0.5, 0.185),
      head: T(sph(0.098, 0.96, 1.12, 1.02), 0, 0.125, 0), neck: T(cyl(0.045, 0.052, 0.1, 8), 0, 0.02, 0), nose: T(box(0.025, 0.035, 0.03), 0, 0.12, -0.1),
      helmet: T(new THREE.SphereGeometry(0.128, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(1, 0.95, 1.08), 0, 0.15, 0.0),
      brim: T(box(0.2, 0.016, 0.05), 0, 0.195, -0.12), nvg: T(box(0.06, 0.05, 0.05), 0, 0.2, -0.13), rail: T(box(0.03, 0.03, 0.17), 0.125, 0.14, 0), cover: T(sph(0.13, 1, 0.5, 1.1), 0, 0.2, 0.0),
      goggle: T(box(0.185, 0.05, 0.03), 0, 0.135, -0.098), strap: T(new THREE.TorusGeometry(0.104, 0.011, 6, 16).rotateX(Math.PI / 2), 0, 0.125, 0), chin: T(box(0.16, 0.03, 0.03), 0, 0.045, -0.085),
      stripe: box(0.018, 0.28, 0.004), shoulder: T(sph(0.07, 1, 0.85, 1), 0, 0.0, 0)
    };
    return this.geo;
  },

  // which way a body moves relative to the way it looks: { dirx: to its right, dirz: forwards }, both -1..1 (the rigs turn the legs towards it)
  moveDir(vx, vz, yaw, sp) {
    if (sp < 0.3) return { dirx: 0, dirz: 1 };
    return { dirx: (vx * Math.cos(yaw) - vz * Math.sin(yaw)) / sp, dirz: (-vx * Math.sin(yaw) - vz * Math.cos(yaw)) / sp };
  },

  build(skinId, toneIdx = 0, opts) {
    const skin = this.byId(skinId);
    if (skin.q && this.q && this.q.ready && window.QRig) return new QRig(skin, opts || {});          // skeletal character (see qrig.js)
    return new Rig(skin, SKIN_TONES[toneIdx % SKIN_TONES.length], opts || {});                        // the procedural soldier when the character files could not be loaded
  }
};

const _V = { down: new THREE.Vector3(0, -1, 0), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3(), q1: new THREE.Quaternion(), q2: new THREE.Quaternion() };

class Rig {
  constructor(skin, tone, opts = {}) {
    const M = Character.materialsFor(skin, tone), Gs = Character.geos();
    this.skin = skin; this.root = new THREE.Group(); this.root.scale.setScalar(0.96);
    const merge = (list) => FX.mergeGeometries(list.map(g => g.clone()), false);
    const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = false; return m; };
    const grp = (x, y, z, parent) => { const g = new THREE.Group(); g.position.set(x, y, z); (parent || this.root).add(g); return g; };

    this.hips = grp(0, 0.98, 0);
    this.hips.add(mesh(merge([Gs.pelvis]), M.pants));
    this.hips.add(mesh(merge([Gs.belt, Gs.buckle]), M.gear));
    this.limb = {};
    for (const s of [-1, 1]) {
      const th = grp(s * 0.1, -0.02, 0, this.hips); th.add(mesh(merge([Gs.thigh, Gs.knee]), M.pants));
      const pad = [Gs.kneepad.clone().translate(0, -0.46, 0)]; if (s > 0) pad.push(Gs.holster.clone());
      th.add(mesh(merge(pad), M.gear));
      const sh = grp(0, -0.46, 0, th); sh.add(mesh(merge([Gs.shin, Gs.calf]), M.pants)); sh.add(mesh(merge([Gs.boot, Gs.toe, Gs.sole, Gs.cuff]), M.gear));
      this.limb[s < 0 ? 'thL' : 'thR'] = th; this.limb[s < 0 ? 'shL' : 'shR'] = sh;
    }
    this.chest = grp(0, 0.04, 0, this.hips);
    this.chest.add(mesh(Gs.torso, M.cloth));
    const Lk = skin.look || {}, vestT = Lk.vest || 'plate', headT = Lk.head || 'helmet', backT = Lk.back || 'pack';
    const gearGeos = [];
    if (vestT === 'plate' || vestT === 'heavy') gearGeos.push(Gs.vest, Gs.plateF, Gs.plateB, Gs.strapL, Gs.strapR, Gs.radio, Gs.antenna);
    else if (vestT === 'light') gearGeos.push(Gs.strapL, Gs.strapR, Gs.radio);
    if (backT === 'pack') gearGeos.push(Gs.pack, Gs.roll, Gs.packTop);
    if (vestT === 'plate' || vestT === 'heavy' || vestT === 'light') for (const x of [-0.1, 0, 0.1]) { const p = Gs.pouch.clone(); p.translate(x, 0.2, -0.15); gearGeos.push(p); }
    if (gearGeos.length) this.chest.add(mesh(merge(gearGeos), M.gear));
    if (M.glow) {
      const st = []; for (const x of [-0.1, 0.1]) { const g = Gs.stripe.clone(); g.translate(x, 0.36, -0.15); st.push(g); }
      this.chest.add(mesh(merge(st), M.glow));
    }
    this.neck = grp(0, 0.54, 0, this.chest);
    this.headMeshes = [mesh(Gs.neck, M.flesh), mesh(merge([Gs.head, Gs.nose]), M.flesh)];
    {                                                                                       // face: eyes with pupils, brows, ears and a mouth in one vertex-coloured mesh
      const colr = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g; };
      const fg = [], dark = new THREE.Color(tone).multiplyScalar(0.62).getHex();
      for (const s of [-1, 1]) {
        fg.push(colr(new THREE.SphereGeometry(0.0165, 12, 10).scale(1.2, 0.85, 0.55).translate(s * 0.037, 0.138, -0.094), 0xf1eee6));
        fg.push(colr(new THREE.SphereGeometry(0.0085, 8, 6).scale(1, 1, 0.6).translate(s * 0.037, 0.138, -0.1015), 0x1d1610));
        fg.push(colr(new THREE.BoxGeometry(0.036, 0.007, 0.01).rotateZ(-s * 0.14).translate(s * 0.038, 0.164, -0.094), 0x2b1d14));
        fg.push(colr(new THREE.SphereGeometry(0.02, 8, 6).scale(0.5, 1.5, 0.9).translate(s * 0.097, 0.125, 0.004), tone));
      }
      fg.push(colr(new THREE.BoxGeometry(0.042, 0.006, 0.01).translate(0, 0.078, -0.096), dark));
      const face = mesh(FX.mergeGeometries(fg, false), Character.faceMat()); face.castShadow = false;
      this.headMeshes.push(face);
    }
    this.headMeshes.forEach(m => this.neck.add(m));
    if (headT === 'helmet') { this.neck.add(mesh(merge([Gs.helmet, Gs.brim, Gs.strap, Gs.nvg, Gs.rail, Gs.chin]), M.helmet)); this.neck.add(mesh(Gs.goggle, M.visor)); }
    for (const s of [-1, 1]) {
      const up = grp(s * 0.235, 0.49, 0, this.chest); up.add(mesh(merge([Gs.upperArm, Gs.elbow]), M.cloth)); up.add(mesh(Gs.shoulder, M.cloth));
      const fo = grp(0, -0.29, 0, up); fo.add(mesh(Gs.foreArm, M.cloth)); fo.add(mesh(merge([Gs.glove, Gs.cuffArm]), M.gear));
      this.limb[s < 0 ? 'upL' : 'upR'] = up; this.limb[s < 0 ? 'foL' : 'foR'] = fo;
    }
    this.gunMount = grp(0.1, 0.42, -0.18, this.chest);
    this.gun = null; this.hold = 'rifle';
    this.ph = 0; this.s = { crouch: 0, lower: 1, lean: 0, slide: 0, ride: 0, dead: 0, air: 0, reload: 0, spread: 0 };
    this.anim = []; this.opts = opts;
    if (this.addLook) this.addLook(M, Gs, skin, opts);
    this.parts = [];
    this.root.traverse(o => { if (o.isMesh) this.parts.push(o); });
  }

  tick(dt) { this.t2 = (this.t2 || 0) + dt; for (const f of this.anim) f(dt); }

  setGun(gun, hold) {
    if (this.gun) this.gunMount.remove(this.gun);
    this.gun = gun; this.hold = hold || 'rifle';
    if (gun) this.gunMount.add(gun);
  }

  setShadows(on) { for (const m of this.parts) m.castShadow = on; }

  // two-bone IK: place hand at target (chest-local) with the elbow pointing along pole
  arm(side, target, pole) {
    const up = this.limb[side < 0 ? 'upL' : 'upR'], fo = this.limb[side < 0 ? 'foL' : 'foR'];
    const l1 = 0.29, l2 = 0.3, S = up.position, v = _V;
    v.a.copy(target).sub(S); let dist = v.a.length(); dist = clamp(dist, 0.12, l1 + l2 - 0.01); v.a.normalize();
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    v.b.copy(pole).addScaledVector(v.a, -pole.dot(v.a)).normalize();
    v.c.copy(S).addScaledVector(v.a, a).addScaledVector(v.b, h);               // elbow
    v.d.copy(v.c).sub(S).normalize(); v.e.copy(target).sub(v.c).normalize();
    v.q1.setFromUnitVectors(v.down, v.d); v.q2.setFromUnitVectors(v.down, v.e);
    up.quaternion.copy(v.q1); fo.quaternion.copy(v.q1).invert().multiply(v.q2);
  }

  // st: {speed, fwd(1/-1), crouch, raise(0..1), sprint, pitch, slide, air, ride, dead, reload(0..1), drop('free'|'glide'), lean}
  update(dt, st) {
    const S = this.s, k = Math.min(1, dt * 10), L = this.limb;
    S.crouch = lerp(S.crouch, st.crouch ? 1 : 0, k);
    S.lower = lerp(S.lower, st.raise > 0.5 && !st.sprint ? 0 : 1, Math.min(1, dt * 8));
    S.slide = lerp(S.slide, st.slide ? 1 : 0, k);
    S.ride = lerp(S.ride, st.ride ? 1 : 0, k);
    S.dead = lerp(S.dead, st.dead ? 1 : 0, Math.min(1, dt * 6));
    S.air = lerp(S.air, st.air ? 1 : 0, Math.min(1, dt * 8));
    S.reload = st.reload || 0;
    const moving = clamp(st.speed / 6, 0, 1.6);
    this.ph += dt * st.speed * 1.55 * (st.fwd < 0 ? -1 : 1);
    const sw = Math.sin(this.ph), sw2 = Math.sin(this.ph + Math.PI), amp = 0.75 * Math.min(moving, 1.2) * (1 - S.crouch * 0.5);

    // legs
    let tl = sw * amp, tr = sw2 * amp, sl = Math.max(0, -Math.sin(this.ph + 1.2)) * amp * 1.5 + S.crouch * 1.1, sr = Math.max(0, -Math.sin(this.ph + 1.2 + Math.PI)) * amp * 1.5 + S.crouch * 1.1;
    let tlx = tl + S.crouch * 1.05, trx = tr + S.crouch * 1.05;
    tlx = lerp(tlx, 1.45, S.slide); trx = lerp(trx, -0.2, S.slide); sl = lerp(sl, 0.1, S.slide); sr = lerp(sr, 1.2, S.slide);
    tlx = lerp(tlx, 1.15, S.ride); trx = lerp(trx, 1.15, S.ride); sl = lerp(sl, 1.25, S.ride); sr = lerp(sr, 1.25, S.ride);
    if (S.air > 0.01) { tlx = lerp(tlx, 0.5, S.air); trx = lerp(trx, -0.3, S.air); sl = lerp(sl, 0.8, S.air); sr = lerp(sr, 0.5, S.air); }
    if (st.drop === 'free') { tlx = -0.5; trx = -0.5; sl = 0.7; sr = 0.7; }
    L.thL.rotation.set(tlx, 0, 0.05 + S.ride * 0.2); L.thR.rotation.set(trx, 0, -0.05 - S.ride * 0.2);
    L.shL.rotation.set(-sl, 0, 0); L.shR.rotation.set(-sr, 0, 0);

    // body
    const bob = Math.abs(Math.sin(this.ph)) * 0.035 * moving * (1 - S.crouch);
    this.hips.position.y = 0.98 - S.crouch * 0.4 - S.slide * 0.45 - S.ride * 0.3 + bob;
    this.hips.position.z = S.slide * 0.1 + S.ride * -0.05;
    const lean = (st.sprint ? 0.2 : 0.05) * Math.min(moving, 1) + S.crouch * 0.18 + S.ride * 0.45 - S.slide * 0.5;
    this.hips.rotation.x = lerp(this.hips.rotation.x, lean * 0.6, k);
    const pitch = clamp(st.pitch || 0, -1.2, 1.2);
    this.chest.rotation.set(lean * 0.5 + pitch * 0.55 * (1 - S.ride) * (st.dead ? 0 : 1), Math.sin(this.ph) * 0.07 * moving * S.lower, 0);
    this.neck.rotation.x = pitch * 0.45 * (1 - S.ride) - lean * 0.3;

    // gun mount: raised aim pose vs low-ready / sprint carry
    const gm = this.gunMount, pistol = this.hold === 'pistol', heavy = this.hold === 'heavy', launcher = this.hold === 'launcher';
    const aimPos = pistol ? [0.06, 0.4, -0.3] : launcher ? [0.12, 0.45, -0.12] : heavy ? [0.1, 0.34, -0.15] : [0.1, 0.4, -0.2];
    const lowPos = st.sprint ? [0.17, 0.2, -0.2] : pistol ? [0.1, 0.22, -0.25] : [0.14, 0.27, -0.2];
    const lowRot = st.sprint ? [-0.85, 0.55, 0.1] : launcher ? [-0.3, 0.05, 0] : [-0.5, 0.12, 0.05];
    const rl = S.reload > 0 ? Math.sin(Math.min(1, S.reload) * Math.PI) : 0;
    gm.position.set(lerp(aimPos[0], lowPos[0], S.lower), lerp(aimPos[1], lowPos[1], S.lower) - rl * 0.1, lerp(aimPos[2], lowPos[2], S.lower) + (st.recoil || 0) * 0.04);
    gm.rotation.set(lerp(0, lowRot[0], S.lower) + rl * 0.3 + (st.recoil || 0) * 0.06, lerp(0, lowRot[1], S.lower), lerp(0, lowRot[2], S.lower) + rl * 0.35);
    gm.visible = S.ride < 0.5 && !!this.gun;

    // hands follow the weapon
    const gp = _V.a;
    const grip = pistol ? [0, -0.065, -0.02] : [0, -0.07, -0.02];
    const fore = pistol ? [-0.02, -0.06, -0.05] : launcher ? [0, -0.1, -0.58] : heavy ? [0, 0.14, -0.15] : this.gun && this.gun.userData.muzzleZ < -0.9 ? [0, -0.04, -0.46] : [0, -0.04, -0.32];
    const toChest = (p, out) => out.set(p[0], p[1], p[2]).applyEuler(gm.rotation).add(gm.position);
    const rT = toChest(grip, new THREE.Vector3()), lT = toChest(fore, new THREE.Vector3());
    if (S.reload > 0.15 && S.reload < 0.85 && !pistol) lT.copy(toChest([0.01, -0.2, -0.12], new THREE.Vector3()));
    if (S.ride > 0.5) { rT.set(0.2, 0.18, -0.46); lT.set(-0.2, 0.18, -0.46); }
    const poleR = new THREE.Vector3(0.5, -1, 0.15), poleL = new THREE.Vector3(-0.5, -1, 0.15);
    if (S.dead > 0.5) { rT.set(0.3, 0.1, -0.3); lT.set(-0.3, 0.1, -0.3); }
    if (st.drop === 'free') { rT.set(0.6, 0.55, -0.2); lT.set(-0.6, 0.55, -0.2); }
    else if (st.drop === 'glide') { rT.set(0.3, 0.95, -0.05); lT.set(-0.3, 0.95, -0.05); }
    if (!this.gun && !st.drop && S.ride < 0.5) { rT.set(0.2, 0.0 + Math.sin(this.ph) * 0.08, -0.05 - sw * 0.1 * moving); lT.set(-0.2, 0.0 - Math.sin(this.ph) * 0.08, -0.05 + sw * 0.1 * moving); }
    this.arm(1, rT, poleR); this.arm(-1, lT, poleL);

    // overall pose: dead rotates the whole body to the ground
    this.root.rotation.x = -S.dead * Math.PI / 2 * 0.98;
    this.hips.position.y += S.dead * 0.2;
  }
}
