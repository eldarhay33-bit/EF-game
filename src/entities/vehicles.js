// Motorcycles in four tiers: arcade physics on the terrain, mounting for the player and bots, run-over damage, engine sound.
const BIKE_DEFS = [
  { id: 'scooter', name: '',    tier: 0, max: 20, acc: 11, turn: 1.9, body: 0x6f8a4a, color: 0xb4b8bc, armor: 0,    boost: false },
  { id: 'sport',   name: '', tier: 1, max: 33, acc: 16, turn: 2.1, body: 0x2a6fd6, color: 0x3aa0ff, armor: 0,    boost: false },
  { id: 'raider',  name: '', tier: 2, max: 27, acc: 13, turn: 1.7, body: 0x4d5238, color: 0xb25cff, armor: 0.4, boost: false },
  { id: 'hyper',   name: '',    tier: 3, max: 40, acc: 22, turn: 2.3, body: 0x16181c, color: 0xffb833, armor: 0.15, boost: true }
];

// Merges geometries that share a material into one (the bike parts are built small and baked into the bike's space first)
function mergeBikeGeos(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo; else for (let i = 0; i < n; i++) idx[io++] = vo + i;
    vo += n;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}

class Bike {
  constructor(def, x, z, yaw) {
    this.def = def; this.pos = new THREE.Vector3(x, terrainHeight(x, z), z); this.yaw = yaw; this.speed = 0; this.vy = 0;
    this.steer = 0; this.roll = 0; this.pitch = 0; this.rider = null; this.grounded = true; this.boostT = 0; this.boostCd = 0; this.wheelRot = 0; this.stuck = 0; this.fuel = 1;
    this.tp = 0; this.tr = 0; this.accP = 0; this.accR = 0; this.air = 0; this.hopCd = 0; this.gvy = 0; this.wArmed = false;       // trick state (see drive)
    this.build();
    this.sync();
  }

  // A modelled bike (assets/models/bikes/bikes.json, see docs/ADD-MODELS.md): the model stands on the ground, its front towards -z, turned by cfg.yaw and scaled to cfg.length metres (or by cfg.scale).
  // The wheels and the fork are found by node name (wheel_f / front wheel, wheel_r / rear wheel, fork / handlebar / steer) and moved like the parts of the procedural bike (the wheels turn,
  // the fork steers); a model without such nodes is simply rigid. cfg.seat = [x, y, z] says where the rider sits (metres, after scaling).
  buildGlb(gm) {
    const T = THREE, cfg = gm.cfg, root = new T.Group(), model = gm.scene.clone(true);
    model.rotation.y = cfg.yaw || 0; model.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(model), size = box.getSize(new T.Vector3()), k = cfg.scale || (cfg.length || 2) / Math.max(size.x, size.z, 0.01);
    model.scale.setScalar(k); model.updateMatrixWorld(true); box.setFromObject(model);
    const ctr = box.getCenter(new T.Vector3()), h = box.max.y - box.min.y;
    model.position.set(-ctr.x, -box.min.y, -ctr.z); root.add(model); root.updateMatrixWorld(true);
    const find = re => { let f = null; model.traverse(o => { if (!f && o !== model && re.test(o.name || '')) f = o; }); return f; };
    const wf = find(/wheel[ _.-]*(f|front)|front[ _.-]*wheel/i), wr = find(/wheel[ _.-]*(r|rear|back)|(rear|back)[ _.-]*wheel/i), fk = find(/fork|handle|steer/i);
    const bb = o => new T.Box3().setFromObject(o), pivot = (o, p) => { const g = new T.Group(); g.position.copy(p); root.add(g); root.updateMatrixWorld(true); g.updateMatrixWorld(true); g.attach(o); return g; };
    this.wheelRad = 0.33;
    const rear = wr && pivot(wr, bb(wr).getCenter(new T.Vector3()));
    let front = null; if (wf) { const b = bb(wf); front = pivot(wf, b.getCenter(new T.Vector3())); this.wheelRad = Math.max(0.15, (b.max.y - b.min.y) / 2); }
    let steer = null; if (fk) { const b = bb(fk), c = front ? front.position : b.getCenter(new T.Vector3()); steer = pivot(fk, new T.Vector3(c.x, b.max.y, c.z)); if (front) steer.attach(front); }
    this.wheelR = rear || new T.Group(); this.wheelF = front || new T.Group(); this.fork = steer || new T.Group();
    model.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.seatPos = cfg.seat ? new T.Vector3(cfg.seat[0], cfg.seat[1], cfg.seat[2]) : new T.Vector3(0, h * 0.62, 0.06 * Math.max(size.x, size.z) * k);
    this.parts = []; this.root = root; G.scene.add(root);
    return true;
  }

  // The bike is put together from rounded parts and glossy clear-coat paint, then merged into one mesh per material for the body, the steering fork and each wheel
  build() {
    this.seatPos = new THREE.Vector3(0, 0.78, 0.18); this.wheelRad = 0.33;
    const gm = Vehicles.models[this.def.id];
    if (gm) { try { if (this.buildGlb(gm)) return; } catch (e) { console.warn('[bikes] the model of', this.def.id, 'could not be used', e && e.message); } }
    const T = THREE, d = this.def, root = new T.Group(), id = d.id, rugged = id === 'raider';
    const phys = (o) => new T.MeshPhysicalMaterial(Object.assign({ envMapIntensity: 1.35 }, o)), std = (o) => new T.MeshStandardMaterial(Object.assign({ envMapIntensity: 1.2 }, o));
    const paint = phys({ color: d.body, metalness: rugged ? 0.15 : 0.5, roughness: rugged ? 0.62 : 0.3, clearcoat: rugged ? 0 : 1, clearcoatRoughness: 0.07 });
    const trim = phys({ color: d.color, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
    const dark = std({ color: 0x1d1e21, metalness: 0.55, roughness: 0.45 }), chrome = std({ color: 0xd7dade, metalness: 1, roughness: 0.14 });
    const rubber = std({ color: 0x111111, roughness: 0.92, metalness: 0 }), seat = std({ color: 0x25211f, roughness: 0.78, metalness: 0 });
    const lamp = std({ color: 0xffffee, emissive: 0xfff2cc, emissiveIntensity: 2 }), tail = std({ color: 0xff2a20, emissive: 0xff2a20, emissiveIntensity: 1.7 });
    const neon = std({ color: d.color, emissive: d.color, emissiveIntensity: 2.2 }), glass = std({ color: 0x9fc4e6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.38 });
    this.wheelR = new T.Group(); this.wheelR.position.set(0, 0.33, 0.66); root.add(this.wheelR);
    this.fork = new T.Group(); this.fork.position.set(0, 0.66, -0.5); root.add(this.fork);
    this.wheelF = new T.Group(); this.wheelF.position.set(0, -0.33, -0.2); this.fork.add(this.wheelF);
    const groups = { root, fork: this.fork, wf: this.wheelF, wr: this.wheelR }, bag = { root: new Map(), fork: new Map(), wf: new Map(), wr: new Map() };
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), sc = new T.Vector3(1, 1, 1);
    const add = (g, mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      geo.applyMatrix4(m4.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), sc));
      const list = bag[g].get(mat); if (list) list.push(geo); else bag[g].set(mat, [geo]);
    };
    const rbox = (w, h, dd, r) => {
      const g = new T.BoxGeometry(w, h, dd, 5, 5, 5), pa = g.attributes.position, na = g.attributes.normal, v = new T.Vector3(), c = new T.Vector3(), hx = w / 2 - r, hy = h / 2 - r, hz = dd / 2 - r;
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i); c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz)); v.sub(c);
        if (v.lengthSq() > 1e-12) { v.normalize(); na.setXYZ(i, v.x, v.y, v.z); pa.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r); }
      }
      return g;
    };
    const cylX = (r1, r2, l, s = 12) => new T.CylinderGeometry(r1, r2, l, s).rotateZ(Math.PI / 2), cylZ = (r1, r2, l, s = 12) => new T.CylinderGeometry(r1, r2, l, s).rotateX(Math.PI / 2);
    // wheels: round tyre, chrome rim, spokes, hub and a brake disc
    const wheel = (g, tube, wide) => {
      const R = 0.335 - tube, rim = R - tube - 0.02;
      add(g, rubber, new T.TorusGeometry(R, tube, 10, 30).rotateY(Math.PI / 2));
      add(g, chrome, new T.TorusGeometry(rim, 0.02, 6, 26).rotateY(Math.PI / 2));
      add(g, dark, cylX(0.06, 0.06, wide));
      for (let i = 0; i < 3; i++) add(g, id === 'hyper' ? neon : chrome, new T.BoxGeometry(0.014, 0.02, rim * 2), 0, 0, 0, i * Math.PI / 3);
      add(g, chrome, cylX(0.13, 0.13, 0.012, 20), 0.05);
      if (id === 'hyper') for (const s of [-1, 1]) add(g, neon, new T.TorusGeometry(R, 0.012, 6, 28).rotateY(Math.PI / 2), s * 0.075);
    };
    wheel('wf', rugged ? 0.1 : 0.08, 0.18); wheel('wr', rugged ? 0.105 : 0.088, 0.2);
    // steering fork: chrome tubes with dark sliders (leaning back 0.3 rad), bars with grips and mirrors, headlight and front mudguard
    for (const s of [-1, 1]) {
      add('fork', chrome, new T.CylinderGeometry(0.022, 0.024, 0.62, 10), s * 0.08, -0.044, -0.111, 0.3);
      add('fork', dark, new T.CylinderGeometry(0.032, 0.032, 0.24, 10), s * 0.08, -0.31, -0.194, 0.3);
      add('fork', rubber, cylX(0.022, 0.022, 0.12), s * 0.34, 0.3, 0.12);
      add('fork', chrome, new T.CylinderGeometry(0.006, 0.006, 0.17, 6), s * 0.3, 0.385, 0.1, 0, 0, -s * 0.15);
      add('fork', chrome, cylZ(0.04, 0.04, 0.012, 14), s * 0.32, 0.47, 0.085);
    }
    add('fork', chrome, cylX(0.012, 0.012, 0.74), 0, 0.3, 0.12);
    add('fork', dark, rbox(0.2, 0.05, 0.08, 0.02), 0, 0.07, -0.05);
    add('fork', dark, rbox(0.1, 0.1, 0.12, 0.04), 0, 0.2, 0.0);
    add('fork', paint, rbox(0.15, 0.03, 0.46, 0.014), 0, 0.045, -0.2, 0.08);
    if (id !== 'sport' && id !== 'hyper') { add('fork', lamp, new T.SphereGeometry(0.085, 14, 10), 0, 0.15, -0.17); add('fork', chrome, new T.TorusGeometry(0.09, 0.012, 6, 18), 0, 0.15, -0.205); }
    // frame, engine, swing arm and rear shock
    add('root', dark, rbox(0.3, 0.28, 0.44, 0.06), 0, 0.4, -0.02);
    add('root', chrome, rbox(0.18, 0.2, 0.22, 0.05), 0, 0.53, -0.14, -0.35);
    add('root', dark, rbox(0.06, 0.06, 0.95, 0.025), 0, 0.6, 0.05, 0.06);
    add('root', dark, new T.CylinderGeometry(0.025, 0.025, 0.42, 8), 0, 0.48, -0.4, -0.52);
    for (const s of [-1, 1]) add('root', dark, rbox(0.04, 0.06, 0.8, 0.02), s * 0.1, 0.36, 0.33);
    add('root', trim, new T.CylinderGeometry(0.03, 0.03, 0.34, 8), 0, 0.53, 0.46, 0.45);
    // tank with a stripe, seat, tail and light
    add('root', paint, rbox(0.33, 0.26, 0.58, 0.11), 0, 0.76, -0.2);
    add('root', trim, rbox(0.06, 0.02, 0.5, 0.009), 0, 0.887, -0.2);
    add('root', seat, rbox(0.26, 0.09, 0.72, 0.04), 0, 0.72, 0.4);
    add('root', paint, rbox(0.2, 0.07, 0.42, 0.03), 0, 0.74, 0.93, 0.2);
    add('root', tail, rbox(0.12, 0.045, 0.04, 0.015), 0, 0.77, 1.14);
    // exhaust (two pipes on the rugged and the fast one) and foot pegs
    for (const s of (rugged || id === 'hyper' ? [-1, 1] : [1])) {
      add('root', chrome, cylZ(0.042, 0.05, 0.74), s * 0.2, 0.36, 0.52, -0.06);
      add('root', dark, cylZ(0.034, 0.04, 0.05), s * 0.2, 0.37, 0.91, -0.06);
      add('root', chrome, cylZ(0.026, 0.026, 0.4), s * 0.18, 0.28, 0.0);
    }
    for (const s of [-1, 1]) add('root', chrome, cylX(0.014, 0.014, 0.12, 6), s * 0.2, 0.3, 0.16);
    // what makes each of the four different
    if (id === 'scooter') {
      add('root', paint, rbox(0.36, 0.22, 0.4, 0.08), 0, 0.89, 0.95);
      add('root', trim, rbox(0.3, 0.03, 0.34, 0.012), 0, 1.005, 0.95);
      add('root', glass, rbox(0.3, 0.24, 0.02, 0.01), 0, 0.88, -0.6, -0.6);
      add('root', trim, rbox(0.34, 0.04, 0.46, 0.016), 0, 0.3, -0.12);
    } else if (id === 'sport') {
      add('root', paint, rbox(0.4, 0.34, 0.62, 0.13), 0, 0.6, -0.42);
      add('root', trim, rbox(0.12, 0.02, 0.4, 0.009), 0, 0.775, -0.42);
      add('root', glass, rbox(0.28, 0.24, 0.02, 0.01), 0, 0.9, -0.58, -0.8);
      add('root', lamp, new T.SphereGeometry(0.07, 12, 8), 0, 0.62, -0.74);
      for (const s of [-1, 1]) add('root', trim, rbox(0.02, 0.08, 0.34, 0.008), s * 0.2, 0.55, -0.42);
    } else if (rugged) {
      for (const s of [-1, 1]) {
        add('root', dark, rbox(0.13, 0.26, 0.42, 0.05), s * 0.27, 0.56, 0.66); add('root', trim, rbox(0.02, 0.1, 0.3, 0.01), s * 0.34, 0.58, 0.66);
        add('fork', chrome, new T.CylinderGeometry(0.014, 0.014, 0.36, 8), s * 0.2, -0.2, -0.36);
      }
      add('root', chrome, rbox(0.34, 0.03, 0.4, 0.012), 0, 0.86, 0.9);
      add('fork', chrome, cylX(0.014, 0.014, 0.4), 0, -0.03, -0.36);
      add('fork', dark, rbox(0.3, 0.12, 0.06, 0.02), 0, 0.17, -0.3);
    } else {
      add('root', paint, rbox(0.36, 0.28, 0.5, 0.11), 0, 0.58, -0.38);
      add('root', lamp, rbox(0.2, 0.04, 0.04, 0.015), 0, 0.66, -0.7);
      add('root', paint, rbox(0.52, 0.03, 0.22, 0.012), 0, 1.0, 0.95);
      for (const s of [-1, 1]) { add('root', neon, rbox(0.02, 0.03, 0.9, 0.01), s * 0.19, 0.46, 0.08); add('root', neon, rbox(0.03, 0.2, 0.2, 0.01), s * 0.25, 0.9, 0.95); add('root', dark, rbox(0.04, 0.22, 0.05, 0.015), s * 0.1, 0.88, 0.95); }
      this.exhaust = new T.Object3D(); this.exhaust.position.set(0, 0.5, 1.0); root.add(this.exhaust);
    }
    this.parts = [];
    for (const name of Object.keys(bag)) for (const [mat, geos] of bag[name]) {
      const mesh = new T.Mesh(mergeBikeGeos(geos), mat); mesh.castShadow = mat !== glass; groups[name].add(mesh); this.parts.push(mesh);
      for (const g of geos) g.dispose();
    }
    this.root = root; G.scene.add(root);
  }

  dispose() { for (const m of this.parts) { m.geometry.dispose(); m.material.dispose(); } }

  sync() {
    const r = this.root;
    r.position.copy(this.pos); r.rotation.set(this.pitch + this.tp, this.yaw, this.roll + this.tr, 'YXZ');
    this.fork.rotation.y = -this.steer * 0.5;
    this.wheelF.rotation.x = this.wheelR.rotation.x = this.wheelRot;
  }

  seat() { return this.seatPos.clone().applyEuler(this.root.rotation).add(this.pos); }

  // ---------- tricks: the bike spins in the air with the move keys (S = backflip, W = front flip, A / D = barrel roll) and lands without hurting its rider ----------
  startAir() { this.air = 0; this.tp = this.tr = this.accP = this.accR = 0; this.wArmed = false; }

  settle(dt) { const k = Math.min(1, dt * 12); this.tp = lerp(this.tp, 0, k); this.tr = lerp(this.tr, 0, k); }

  // a rotation that is more than half done finishes by itself, a smaller one swings back: so a tap never leaves the bike on its roof
  finishAxis(acc, dt, rate) {
    const turns = Math.abs(acc) / 6.2832, rem = turns - Math.floor(turns), goal = (rem >= 0.5 ? Math.ceil(turns) : Math.floor(turns)) * 6.2832 * Math.sign(acc || 1);
    return clamp(goal - acc, -rate * dt, rate * dt);
  }

  // seconds until the flight path meets the ground ahead (the bike keeps its speed in the air)
  timeToLand() {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    for (let t = 0.1; t < 2.2; t += 0.1) {
      const y = this.pos.y + this.vy * t - 10 * t * t;
      if (y <= groundAt(this.pos.x + fx * this.speed * t, this.pos.z + fz * this.speed * t, y + 3)) return t;
    }
    return 2.2;
  }

  // Holding the jump key in the air switches the move keys to tricks (S = backflip, W = front flip once it was let go of, A / D = roll); without it the bike simply stays level,
  // so holding the throttle over a ramp never flips anybody. The last 0.45 s before touchdown the bike finishes or unwinds its turn by itself.
  airControl(dt, inp) {
    if (this.air < 0.1) return;
    if (!(inp.thr > 0)) this.wArmed = true;
    const trick = !!inp.trick && this.timeToLand() > 0.45, dp = trick ? (inp.brake > 0 ? 1 : inp.thr > 0 && this.wArmed ? -1 : 0) : 0, dr = trick ? -inp.steer : 0;
    let s = 0;
    if (dp) s = dp * 8.5 * dt; else if (Math.abs(this.accP) > 0.01) s = this.finishAxis(this.accP, dt, 6);
    this.tp += s; this.accP += s;
    s = 0;
    if (Math.abs(dr) > 0.2) s = Math.sign(dr) * 9 * dt; else if (Math.abs(this.accR) > 0.01) s = this.finishAxis(this.accR, dt, 6.5);
    this.tr += s; this.accR += s;
  }

  land(ground) {
    const air = this.air, vyIn = this.vy, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    this.pos.y = ground; this.vy = 0; this.grounded = true; this.air = 0;
    const lp = wrap(this.tp), lr = wrap(this.tr), flips = Math.round(Math.abs(this.accP) / 6.2832), rolls = Math.round(Math.abs(this.accR) / 6.2832), n = flips + rolls;
    this.tp = lp; this.tr = lr;                                                       // whole turns are forgotten, what is left eases to upright on the ground
    const clean = Math.abs(lp) < 0.95 && Math.abs(lr) < 1.0, me = !!this.rider && this.rider === Player;
    if (air > 0.25 && vyIn < -5) { FX.shake(clamp(-vyIn * 0.02, 0.1, 0.4), 0.25); Sound.impact('metal', this.pos); FX.dust(new THREE.Vector3(this.pos.x, ground, this.pos.z), { x: 0, z: 0 }, [0.55, 0.5, 0.42], 0.9); }
    if (!clean) {                                                                      // a bad landing costs speed, never health
      this.speed *= 0.45; this.tp = lp * 0.3; this.tr = lr * 0.3;
      if (me && air > 0.4) HUD.trick(I18n.t('trick.bail'), true);
    } else if (me && n > 0) {
      const dirName = I18n.t(this.accP > 0 ? 'trick.back' : 'trick.front'), mult = flips || rolls, pre = mult >= 2 ? I18n.t(mult === 2 ? 'trick.x2' : mult === 3 ? 'trick.x3' : 'trick.xn', { n: mult }) + ' ' : '';
      HUD.trick(pre + (flips ? dirName : I18n.t('trick.roll')) + (flips && rolls ? ' + ' + I18n.t('trick.roll') : '') + ' · ' + I18n.t('trick.air', { s: air.toFixed(1) }), false);
      Profile.track('flips', n); Profile.track('maxFlipJump', n, 'max');
    }
    if (me && air > 0.5) Profile.track('airTime', Math.round(air * 10) / 10);
    this.accP = this.accR = 0;
  }

  // the rider's body is a child of the bike: it leans, hops and flips with it
  attachRider(root) { if (root.parent !== this.root) this.root.add(root); root.position.set(this.seatPos.x, this.seatPos.y - 0.88, this.seatPos.z); root.rotation.set(0, 0, 0); }

  drive(dt, inp) {
    const d = this.def, max = d.max * (this.boostT > 0 ? 1.3 : 1);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    // boost
    if (d.boost) { this.boostCd = Math.max(0, this.boostCd - dt); if (inp.boost && this.boostT <= 0 && this.boostCd <= 0) { this.boostT = 1.8; this.boostCd = 5; } }
    if (this.boostT > 0) { this.boostT -= dt; this.speed += d.acc * 1.6 * dt; if (this.exhaust) { const p = this.exhaust.getWorldPosition(new THREE.Vector3()); FX.glow.spawn(p.x, p.y, p.z, -fx * 4, 0, -fz * 4, 0.25, 0.35, 0.05, 0.3, 0.9, 1, 0.9, 0); } }
    const water = waterDepth(this.pos.x, this.pos.z);
    // throttle / brake: only the wheels on the ground push, in the air the speed is kept
    if (this.grounded) {
      if (inp.thr > 0 && water < 0.7) this.speed += d.acc * (1 - Math.max(0, this.speed) / max * 0.92) * dt * inp.thr;
      else this.speed *= Math.max(0, 1 - 0.35 * dt);
      if (inp.brake > 0) { if (this.speed > 0.5) this.speed -= 24 * dt; else this.speed = Math.max(-7, this.speed - 9 * dt); }
      if (inp.hand) this.speed *= Math.max(0, 1 - 3.2 * dt);
      if (water > 0.5) this.speed *= Math.max(0, 1 - 2.2 * dt);
    }
    this.speed = clamp(this.speed, -7, max * 1.05);
    // a quick tap of the handbrake key (see Vehicles.updatePlayerRide) hops the bike: over small obstacles and as the start of a trick
    this.hopCd = Math.max(0, this.hopCd - dt);
    if (inp.hop && this.grounded && this.hopCd <= 0 && this.speed > 2) { this.vy = 7.4; this.grounded = false; this.hopCd = 0.5; this.startAir(); Sound.whoosh(this.pos); }
    // steering: a little quicker to respond and still some grip at crawling speed; hardly any steering in the air
    const ts = inp.steer * (inp.hand ? 1.5 : 1);
    this.steer = lerp(this.steer, ts, Math.min(1, dt * 9));
    const grip = this.grounded ? clamp(Math.abs(this.speed) / 4, 0, 1) * (1 - Math.abs(this.speed) / (max * 2.2)) : 0.12;
    this.yaw -= this.steer * d.turn * grip * Math.sign(this.speed || 1) * dt;
    this.roll = lerp(this.roll, this.grounded ? -this.steer * clamp(this.speed / max, 0, 1) * 0.55 : 0, Math.min(1, dt * 6));
    // move
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += fx * this.speed * dt; this.pos.z += fz * this.speed * dt;
    const before = this.pos.clone(); this.pos.y = Math.max(this.pos.y, 0);
    pushOutOfColliders(this.pos, 0.55, 1.3);
    const pushed = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    this.pos.x = clamp(this.pos.x, -MAP.half + 4, MAP.half - 4); this.pos.z = clamp(this.pos.z, -MAP.half + 4, MAP.half - 4);
    const gF = groundAt(this.pos.x + fx * 0.62, this.pos.z + fz * 0.62, this.pos.y + 0.5), gR = groundAt(this.pos.x - fx * 0.62, this.pos.z - fz * 0.62, this.pos.y + 0.5);
    const ground = (gF + gR) / 2;
    if (ground - this.pos.y > 1.3 && this.grounded) { this.pos.x = ox; this.pos.z = oz; this.speed *= 0.4; }
    this.crashed = false;
    if (pushed > 0.02 && Math.abs(this.speed) > 3) {                                  // hit something: speed is lost in proportion to how head-on it was, the rider is never hurt
      const hitSpeed = Math.abs(this.speed), head = clamp(pushed / (hitSpeed * dt + 1e-3), 0, 1);
      this.speed *= 1 - 0.55 * head; this.crashed = true;
      if (hitSpeed > 7) { Sound.impact('metal', this.pos); FX.shake(0.12 + 0.2 * head, 0.25); }
    }
    // up and down: the bike leaves a ramp or a crest with the climbing speed of the ground, so jumps are real jumps
    if (this.grounded) {
      this.gvy = lerp(this.gvy, (gF - gR) / 1.24 * Math.max(0, this.speed), 0.4);
      // climbing fast while the ground drops away from the free-flight path just ahead (the lip of a ramp, a sharp crest taken at speed): the bike takes off with the climbing speed.
      // The same when the ground is simply gone (an edge).
      let flies = this.gvy > 4;
      for (let k = 1; flies && k <= 2; k++) {
        const t = 0.12 * k, d = this.speed * t;
        flies = this.pos.y + this.gvy * t - 10 * t * t > groundAt(this.pos.x + fx * d, this.pos.z + fz * d, this.pos.y + 3) + 0.06;
      }
      if (flies || this.pos.y - ground > 0.5) { this.grounded = false; this.vy = clamp(this.gvy, 0, 14); this.startAir(); }
      else this.pos.y = lerp(this.pos.y, ground, Math.min(1, dt * 40));
    }
    if (!this.grounded) {
      this.air += dt; this.vy -= 20 * dt; this.pos.y += this.vy * dt; this.airControl(dt, inp);
      if (this.pos.y <= ground) this.land(ground);
    } else this.settle(dt);
    const targetPitch = Math.atan2(gF - gR, 1.24);
    this.pitch = lerp(this.pitch, this.grounded ? targetPitch : clamp(Math.atan2(this.vy, Math.max(6, Math.abs(this.speed))) * 0.7, -0.5, 0.5), Math.min(1, dt * (this.grounded ? 10 : 4)));   // in the air the nose follows the flight path
    this.wheelRot -= this.speed * dt / this.wheelRad;
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

  // a bike its rider left (or lost) in the air drops and settles instead of hanging there
  fall(dt) {
    this.vy -= 20 * dt; this.pos.y += this.vy * dt;
    const g = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
    if (this.pos.y <= g) { this.pos.y = g; this.vy = 0; this.grounded = true; this.air = 0; this.gvy = 0; }
    this.pitch = lerp(this.pitch, 0, Math.min(1, dt * 4)); this.settle(dt);
  }
}

const Vehicles = {
  bikes: [], models: {},

  // modelled bikes: assets/models/bikes/bikes.json maps a bike id (scooter, sport, raider, hyper) to { file, length, yaw, scale, seat }; nothing there (the file ships empty) = the procedural bikes
  async preload(loader) {
    let man; try { const r = await fetch('assets/models/bikes/bikes.json?v=' + (window.ASSET_VER || 0), { cache: 'no-store' }); if (!r.ok) return; man = await r.json(); } catch (e) { return; }
    await Promise.all(Object.keys(man || {}).map(async id => {
      const c = man[id]; if (!c || !c.file || c.enabled === false || !BIKE_DEFS.some(d => d.id === id)) return;
      try { const g = await loader.loadAsync('assets/models/bikes/' + c.file + '?v=' + (window.ASSET_VER || 0)); this.models[id] = { scene: g.scene, cfg: c }; }
      catch (e) { console.warn('[bikes] could not load', id, e && e.message); }
    }));
  },

  reset() { for (const b of this.bikes) { G.scene.remove(b.root); b.dispose(); } this.bikes = []; },

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
      if (!b.rider) { if (!b.grounded) b.fall(dt); b.sync(); b.root.visible = Math.hypot(b.pos.x - c.x, b.pos.z - c.z) < 260; }
      else b.root.visible = true;
    }
  },

  mount(p, b) {
    p.riding = true; p.bike = b; b.rider = p; p.phase = 'riding'; p.crouch = false; p.sliding = 0; p.aiming = false; p.sprinting = false;
    p.yaw = b.yaw; p.reloadT = 0; p.charging = 0;
    b.gvy = 0; b.hopCd = 0; b.tp = b.tr = b.accP = b.accR = 0;                                         // a bike that was parked (or moved) must not take off on its first frame
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
    // the jump / handbrake key: a quick tap hops (and starts a trick), holding it brakes
    const raw = inp.hand; inp.hop = false;
    if (raw) p.handT = (p.handT || 0) + dt; else { if (p.handT > 0 && p.handT < 0.22) inp.hop = true; p.handT = 0; }
    inp.trick = raw; inp.hand = raw && (p.handT >= 0.22 || b.speed < 2.5);
    b.drive(dt, inp);
    const s = b.seat(); p.pos.set(b.pos.x, b.pos.y + 0.3, b.pos.z); p.vel.set(-Math.sin(b.yaw) * b.speed, 0, -Math.cos(b.yaw) * b.speed);
    p.speed = Math.abs(b.speed); p.onGround = b.grounded; p.bobT += dt * 2;
    if (G.time - (p.lastLookT || 0) > 1.3 && Math.abs(b.speed) > 3) p.yaw += angDiff(p.yaw, b.yaw) * Math.min(1, dt * 2.2);
    Sound.engineSet(clamp(Math.abs(b.speed) / b.def.max, 0, 1.3), b.boostT > 0);
    if (Math.random() < dt * 2) addNoise(b.pos.x, b.pos.z, 40 + Math.abs(b.speed) * 2, p);
  }
};
