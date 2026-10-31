// Skeletal characters: the base characters of Quaternius (CC0, Universal Base Characters: a body with a face, eyes and 20 hair styles on a 65-bone humanoid skeleton) dressed by suit.js
// (a coloured suit shader on the body plus gear fixed to the bones) and animated with clips of the Universal Animation Library (CC0, same skeleton).
// tools/make-chars.ps1 prepares the files in assets/models/q; skins.js says what a skin is.
// QRig answers to the same calls as the procedural Rig (root, update(dt, state), tick, setGun, setShadows, gun, hips, camK), so bots, the player, online puppets and the lobby need no changes.
// Legs, body and head come from the clips (idle / walk / jog / sprint / crouch / swim / jump / sit / death) and turn towards the way the character moves;
// the gun is carried by the chest and both arms are solved with two-bone IK onto it, the fingers close around it.
Character.q = { ready: false, SU: null, clips: {}, src: { base: {}, hair: {} }, tpl: {}, body: {}, cloth: {} };

(function () {
  const Q = Character.q, V = THREE.Vector3, Qn = THREE.Quaternion, M4 = THREE.Matrix4, clamp = THREE.MathUtils.clamp;
  const BASES = { idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', cidle: 'Crouch_Idle_Loop', cwalk: 'Crouch_Fwd_Loop', air: 'Jump_Loop', swim: 'Swim_Fwd_Loop', sidle: 'Swim_Idle_Loop', dead: 'Death01', sit: 'Driving_Loop' };
  const SPEED = { walk: 0.97, jog: 5.36, sprint: 8.25, cwalk: 0.75, swim: 2.18 };                  // the ground speed (m/s) each clip was made for
  const P = { sign: -1, s1: 0.2, s2: 0.26, s3: 0.3, head: 0.24, gun: 0.3 };                         // looking up / down: how much each bone takes (the gun takes the rest)
  const LOWER = { rifle: [0.35, 0.12], pistol: [0.3, 0.1], heavy: [0.3, 0.1], launcher: [0.2, 0.05] };    // low-ready: [muzzle down (rad), muzzle across (rad)]
  // where each kind of gun sits in front of the chest (model space: the character looks along +Z, its right hand side is -X) and where the two hands hold it (gun space, the muzzle points to -Z)
  const HOLD = Q.hold = {
    rifle: { o: [-0.13, 1.3, 0.16], grip: [0, -0.07, -0.02], fore: [0, -0.04, -0.28], reload: [0.01, -0.2, -0.12], size: 1.0 },
    pistol: { o: [-0.07, 1.3, 0.3], grip: [0, -0.065, -0.02], fore: [-0.02, -0.06, -0.05], reload: [0, -0.2, -0.04], size: 1.1 },
    heavy: { o: [-0.12, 1.22, 0.14], grip: [0, -0.07, -0.02], fore: [0, 0.14, -0.15], reload: [0.01, -0.2, -0.1], size: 0.95 },
    launcher: { o: [-0.2, 1.4, 0.0], grip: [0, -0.07, -0.02], fore: [0, -0.1, -0.35], reload: [0.01, -0.2, -0.1], size: 0.9 }
  };
  const FINGERS = ['index', 'middle', 'ring', 'pinky', 'thumb'];
  const TONES = { light: [1.5, 1.4, 1.3], mid: [1.22, 1.13, 1.04], dark: [1, 1, 1] };

  // ---------- loading ----------
  const slim = (c) => new THREE.AnimationClip(c.name, c.duration, c.tracks.filter(t => {                      // no root, no scale, and only the pelvis moves: the mixer has a third of the work
    const i = t.name.indexOf('.'), b = t.name.slice(0, i), p = t.name.slice(i + 1); return b !== 'root' && p !== 'scale' && (p !== 'position' || b === 'pelvis');
  }));

  Character.preload = async function (loader) {
    const q = this.q; if (!SKINS.some(s => s.q)) return;
    try {
      q.SU = await import('three/addons/utils/SkeletonUtils.js');
      const lite = typeof Device !== 'undefined' && (Device.phone || (typeof Game !== 'undefined' && Game.qualityKey === 'low'));
      const mgr = new THREE.LoadingManager(); if (lite) mgr.setURLModifier(u => u.replace('/models/q/tex/', '/models/q/tex/s/'));             // phones and weak machines load the 512 px textures
      const GL = new loader.constructor(mgr), v = '?v=' + (window.ASSET_VER || 0), dir = 'assets/models/q/', get = (n) => GL.loadAsync(dir + n + v);
      const need = { base: new Set(), hair: new Set() };
      for (const s of SKINS) if (s.q) { need.base.add(s.q.g); for (const h of s.q.hair || []) need.hair.add(h); }
      const jobs = [get('anim.glb').then(r => { for (const c of r.animations) q.clips[c.name] = slim(c); })];
      for (const n of need.base) jobs.push(get('base/' + n + '.gltf').then(r => { q.src.base[n] = r; }));
      for (const n of need.hair) jobs.push(get('hair/' + n + '.gltf').then(r => { q.src.hair[n] = r; }));
      await Promise.all(jobs);
      const missing = Object.values(BASES).filter(n => !q.clips[n]);
      if (missing.length) { console.warn('[chars] animations missing in anim.glb:', missing.join(', ')); return; }
      q.ready = true;
    } catch (e) { console.warn('[chars] unavailable', e); }
  };

  // ---------- assembling a body ----------
  const f32 = (a, n) => { const out = new Float32Array(a.count * n); for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = a.getComponent(i, k); return new THREE.BufferAttribute(out, n); };
  const remapFor = (srcNames, names) => srcNames.every((n, i) => names[i] === n) ? null : srcNames.map(n => Math.max(0, names.indexOf(n)));
  // same attributes everywhere (merging needs it) and the bone numbers of the skeleton in use
  const prep = (src, remap) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', f32(src.attributes.position, 3)); g.setAttribute('normal', f32(src.attributes.normal, 3)); g.setAttribute('uv', f32(src.attributes.uv, 2)); g.setAttribute('skinWeight', f32(src.attributes.skinWeight, 4));
    const si = src.attributes.skinIndex, ids = new Uint16Array(si.count * 4); for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k); ids[i * 4 + k] = remap ? remap[b] : b; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(ids, 4)); g.setIndex(Array.from(src.index.array)); return g;
  };
  // which part of the body a bone belongs to: 0 head and neck, 1 torso, 2 upper arm, 3 forearm, 4 legs and pelvis, 5 feet, 6 hands
  const partOf = (n) => /^(Head|neck)/.test(n) ? 0 : /^upperarm/.test(n) ? 2 : /^lowerarm/.test(n) ? 3 : /^(pelvis|thigh|calf)/.test(n) ? 4 : /^(foot|ball)/.test(n) ? 5 : /^(hand|index|middle|ring|pinky|thumb)/.test(n) ? 6 : 1;
  // the body mesh of a base character, with how much of every vertex belongs to each part of the body (the suit shader paints by it)
  const bodyOf = (g) => {
    if (Q.body[g]) return Q.body[g];
    let mesh = null; Q.src.base[g].scene.traverse(o => { if (o.isSkinnedMesh && !/Eyes|Eyebrow/i.test(o.name)) mesh = o; });
    const geo = prep(mesh.geometry), names = mesh.skeleton.bones.map(b => b.name), si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, n = geo.attributes.position.count, pa = new Float32Array(n * 4), pb = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k), id = partOf(names[si.getComponent(i, k)]); if (id < 4) pa[i * 4 + id] += w; else pb[i * 4 + id - 4] += w; }
    geo.setAttribute('partA', new THREE.BufferAttribute(pa, 4)); geo.setAttribute('partB', new THREE.BufferAttribute(pb, 4)); geo.computeBoundingSphere();
    return (Q.body[g] = geo);
  };

  // The clothes: a copy of the clothed parts of the body, pushed outwards along the normals (the thickness of the fabric) and smoothed, so a jacket or trousers have a volume of their own
  // instead of looking like paint on the skin. Cut where the clothes end (collar, cuffs and boots hide the edge).
  const CLOTH_T = [0, 0.012, 0.01, 0.009, 0.011, 0, 0.005];          // thickness by part: head, torso, upper arm, forearm, legs, feet, hands
  const clothOf = (g, U) => {
    const key = [g, U.sleeve === 0 ? 's' : 'l', U.pants || 0, U.gloves === 0 ? 'n' : 'g', U.fit || 1].join('|');
    if (Q.cloth[key]) return Q.cloth[key];
    const body = bodyOf(g), pos = body.attributes.position, nor = body.attributes.normal, pa = body.attributes.partA, pb = body.attributes.partB, idx = body.index, n = pos.count;
    const long = U.sleeve !== 0, cut = U.pants || 0, gloves = U.gloves !== 0, fit = U.fit || 1, amt = new Float32Array(n), th = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const w = [pa.getX(i), pa.getY(i), pa.getZ(i), pa.getW(i), pb.getX(i), pb.getY(i), pb.getZ(i)].map(v => v * v * v * v), tot = w.reduce((a, b) => a + b, 0) + 1e-5, leg = cut > 0 && pos.getY(i) < cut ? 0 : w[4];
      amt[i] = (w[1] + w[2] + (long ? w[3] : 0) + leg + (gloves ? w[6] : 0)) / tot;
      th[i] = (w[1] * CLOTH_T[1] + w[2] * CLOTH_T[2] + w[3] * CLOTH_T[3] + w[4] * CLOTH_T[4] + w[6] * CLOTH_T[6]) / tot * fit;
    }
    const tris = [], used = new Map(), list = [];
    for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (amt[a] > 0.5 && amt[b] > 0.5 && amt[c] > 0.5) tris.push(a, b, c); }
    for (const v of tris) if (!used.has(v)) { used.set(v, list.length); list.push(v); }
    const m = list.length, P = new Float32Array(m * 3), N = new Float32Array(m * 3), key3 = new Map(), grp = new Int32Array(m);
    for (let j = 0; j < m; j++) {
      const v = list[j]; for (let a = 0; a < 3; a++) { P[j * 3 + a] = pos.getComponent(v, a) + nor.getComponent(v, a) * th[v]; N[j * 3 + a] = nor.getComponent(v, a); }
      const k = Math.round(pos.getX(v) * 4000) + ',' + Math.round(pos.getY(v) * 4000) + ',' + Math.round(pos.getZ(v) * 4000); if (!key3.has(k)) key3.set(k, key3.size); grp[j] = key3.get(k);       // the same spot, copied for every texture seam, is one point for the smoothing
    }
    const ng = key3.size, nb = Array.from({ length: ng }, () => new Set());
    for (let t = 0; t < tris.length; t += 3) { const a = grp[used.get(tris[t])], b = grp[used.get(tris[t + 1])], c = grp[used.get(tris[t + 2])]; nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b); }
    for (let it = 0; it < (U.smooth === undefined ? 3 : U.smooth); it++) {                       // Laplacian smoothing of the points and the normals
      const sp = new Float32Array(ng * 3), sn = new Float32Array(ng * 3), cnt = new Float32Array(ng), rep = new Int32Array(ng);
      for (let j = 0; j < m; j++) { const g2 = grp[j]; if (!cnt[g2]) { cnt[g2] = 1; rep[g2] = j; } }
      for (let g2 = 0; g2 < ng; g2++) { const j = rep[g2], list2 = nb[g2]; if (!list2.size) { for (let a = 0; a < 3; a++) { sp[g2 * 3 + a] = P[j * 3 + a]; sn[g2 * 3 + a] = N[j * 3 + a]; } continue; }
        for (let a = 0; a < 3; a++) { let ap = 0, an = 0; for (const o of list2) { ap += P[rep[o] * 3 + a]; an += N[rep[o] * 3 + a]; } sp[g2 * 3 + a] = P[j * 3 + a] * 0.5 + ap / list2.size * 0.5; sn[g2 * 3 + a] = N[j * 3 + a] * 0.5 + an / list2.size * 0.5; } }
      for (let j = 0; j < m; j++) { const g2 = grp[j], l = Math.hypot(sn[g2 * 3], sn[g2 * 3 + 1], sn[g2 * 3 + 2]) || 1; for (let a = 0; a < 3; a++) { P[j * 3 + a] = sp[g2 * 3 + a]; N[j * 3 + a] = sn[g2 * 3 + a] / l; } }
    }
    for (let j = 0; j < m; j++) {                                                                // smoothing pulls the cloth into the muscles: never closer to the skin than half the fabric
      const v = list[j], need = th[v] * 0.6; let d = 0; for (let a = 0; a < 3; a++) d += (P[j * 3 + a] - pos.getComponent(v, a)) * nor.getComponent(v, a);
      if (d < need) for (let a = 0; a < 3; a++) P[j * 3 + a] += nor.getComponent(v, a) * (need - d);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    for (const [name, size, Arr] of [['uv', 2, Float32Array], ['skinIndex', 4, Uint16Array], ['skinWeight', 4, Float32Array], ['partA', 4, Float32Array], ['partB', 4, Float32Array]]) {
      const src = body.attributes[name], arr = new Arr(m * size); for (let j = 0; j < m; j++) for (let a = 0; a < size; a++) arr[j * size + a] = src.getComponent(list[j], a); geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    geo.setIndex(tris.map(v => used.get(v))); geo.computeBoundingSphere();
    return (Q.cloth[key] = geo);
  };

  // the materials of one skin
  Character.qMats = function (skin) {
    const S = skin.q, U = S.suit || {}, gc = Object.assign({ plate: 0x3a3f46, fabric: 0x55603f, metal: 0x9aa0a6, rubber: 0x17181b, glass: 0x0b1118 }, S.gc || {}), tone = TONES[S.tone] || TONES.dark, glow = skin.glow || (U.c && U.c[5]) || 0x35f0ff, M = {};
    let srcBody = null, srcEyes = null; Q.src.base[S.g].scene.traverse(o => { if (!o.isSkinnedMesh) return; if (/Eyes/i.test(o.name)) srcEyes = o.material; else if (!/Eyebrow/i.test(o.name)) srcBody = o.material; });
    const fix = (m) => { m.vertexColors = false; m.envMapIntensity = 0.85; return m; };       // the loader switches vertex colours on when the file has them; the merged meshes carry none (they would be black)
    M.body = fix(srcBody.clone()); M.body.side = THREE.FrontSide; M.body.color.setRGB(tone[0], tone[1], tone[2]);
    M.eyes = fix(srcEyes.clone());
    const std = (o) => new THREE.MeshStandardMaterial(o), phys = (o) => new THREE.MeshPhysicalMaterial(o);
    M.cloth = phys({ color: 0xffffff, roughness: 0.85, metalness: 0, sheen: 0.6, sheenRoughness: 0.55, sheenColor: new THREE.Color(0.55, 0.55, 0.55), bumpMap: Character.fabricBump(), bumpScale: 0.5, envMapIntensity: 0.9, side: THREE.FrontSide }); Character.suitShader(M.cloth, U);
    M.plate = phys({ color: gc.plate, roughness: 0.42, metalness: U.metal > 0.5 ? 0.85 : 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1.2 });
    M.fabric = std({ color: gc.fabric, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }); if (U.pat === 'camo') Character.camoShader(M.fabric, U);
    const tc = (i) => (U.c && U.c[i] !== undefined ? U.c[i] : 0x333333);
    M.collar = std({ color: tc(0), roughness: 0.9, side: THREE.DoubleSide }); M.cuff = std({ color: tc(1), roughness: 0.9, side: THREE.DoubleSide }); M.hem = std({ color: tc(2), roughness: 0.9, side: THREE.DoubleSide });
    M.metal = std({ color: gc.metal, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.3 }); M.rubber = std({ color: gc.rubber, roughness: 0.95, metalness: 0 });
    M.trim = std({ color: glow, emissive: glow, emissiveIntensity: 2.2 }); M.glass = phys({ color: gc.glass, roughness: 0.05, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 });
    M.clear = phys({ color: 0xbfe4ff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, envMapIntensity: 2, depthWrite: false });
    M.alloy = phys({ color: 0xffffff, vertexColors: true, roughness: 0.3, metalness: 0.9, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.4 });                  // equipment (gear.js): metal tinted by the tier through the vertex colours
    M.eq = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });                                                                                     // equipment: the glowing accent in the colour of the tier
    return M;
  };

  // the meshes of one body (suit body + eyes + hair + gear) merged into one skinned mesh per material: a few draw calls instead of a few dozen
  // T: the equipment worn (Character.tiersOf), or null. One template per skin AND set of equipment: the skin's own helmet or vest is left out when a better one is worn, so they differ in their meshes.
  Character.qTemplate = function (skin0, T) {
    const key = skin0.id + '|' + Character.gearKey(T); if (Q.tpl[key]) return Q.tpl[key];
    const skin = Character.equipSkin(skin0, T);
    const S = skin.q, SU = Q.SU, scene = SU.clone(Q.src.base[S.g].scene), M = Character.qMats(skin), hairs = S.hair || [];
    let sk = null, bind = null, parent = null; scene.traverse(o => { if (o.isSkinnedMesh && !sk) { sk = o.skeleton; bind = o.bindMatrix.clone(); parent = o.parent; } });
    const names = sk.bones.map(b => b.name), old = [], parts = [];
    scene.traverse(o => { if (o.isSkinnedMesh) old.push(o); });
    scene.updateMatrixWorld(true); const rest = {}; for (const b of sk.bones) rest[b.name] = new V().setFromMatrixPosition(b.matrixWorld);
    const hairKind = (m) => { const k = 'hair:' + m.name; if (!M[k]) { const h = m.clone(); h.vertexColors = false; h.envMapIntensity = 0.85; h.color.set(S.hc || 0x3a2a1c).multiplyScalar(1.7); M[k] = h; } return k; };
    for (const o of old) if (/Eyes/i.test(o.name)) parts.push({ geo: prep(o.geometry), kind: 'eyes' }); else if (/Eyebrow/i.test(o.name)) parts.push({ geo: prep(o.geometry), kind: hairKind(o.material) });
    for (const h of hairs) Q.src.hair[h].scene.traverse(o => { if (o.isSkinnedMesh) parts.push({ geo: prep(o.geometry, remapFor(o.skeleton.bones.map(b => b.name), names)), kind: hairKind(o.material) }); });
    for (const gp of Character.buildGear(skin, rest, names, T)) parts.push(gp);
    for (const o of old) o.parent.remove(o);
    const by = new Map(); for (const p of parts) { if (!by.has(p.kind)) by.set(p.kind, []); by.get(p.kind).push(p.geo); }
    const add = (kind, geo) => { const mesh = new THREE.SkinnedMesh(geo, M[kind]); mesh.name = 'Q_' + kind; mesh.userData.kind = kind; parent.add(mesh); mesh.bind(sk, bind); mesh.boundingSphere = geo.boundingSphere.clone(); mesh.boundingSphere.radius *= 1.5; return mesh; };
    add('body', bodyOf(S.g)); add('cloth', clothOf(S.g, S.suit || {}));
    for (const [kind, list] of by) { const geo = FX.mergeGeometries(list, false); geo.computeBoundingSphere(); add(kind, geo); }
    Q.tpl[key] = { scene }; (Q.tplOrder = Q.tplOrder || []).push(key);
    while (Q.tplOrder.length > 64) delete Q.tpl[Q.tplOrder.shift()];                                 // many skin x equipment combinations over a long session: forget the oldest (characters already built keep their meshes)
    return Q.tpl[key];
  };

  // ---------- the rig ----------
  const _gm = new M4(), _inv = new M4(), _mi = new M4(), _t = new M4(), _lo = new M4(), _q = new Qn(), _q2 = new Qn(), _qx = new Qn(), _e = new THREE.Euler();
  const _a = new V(), _b = new V(), _c = new V(), _d = new V(), _f = new V(), _g = new V(), _h = new V(), _i = new V(), _p = new V(), _s = new V(), _tr = new V(), _tl = new V();
  const POLE = { r: new V(-0.7, -1, -0.5), l: new V(0.7, -1, -0.5) }, LEGPOLE = { r: new V(-0.3, 0.2, 1), l: new V(0.3, 0.2, 1) };                    // where the elbows and the knees point (model space)
  const AX = new V(1, 0, 0), AY = new V(0, 1, 0), CURL_AXIS = Q.curlAxis = new V(0, 0, 1);       // the axis a finger bone bends around
  const TWEAK = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r'];
  for (const s of ['l', 'r']) for (const f of FINGERS) for (const n of ['01', '02', '03']) TWEAK.push(f + '_' + n + '_' + s);

  class QRig {
    constructor(skin, opts = {}) {
      const tpl = Character.qTemplate(skin, Character.tiersOf(opts.loadout));                  // opts.loadout: what is worn from the shop (null: only the skin's own gear)
      this.skin = skin; this.opts = opts; this.isQ = true; this.root = new THREE.Group();
      this.model = Q.SU.clone(tpl.scene); this.model.rotation.y = Math.PI; this.model.updateMatrix(); this.root.add(this.model);
      this.bones = {}; this.parts = [];
      this.model.traverse(o => { if (o.isBone) this.bones[o.name] = o; if (o.isSkinnedMesh) { o.castShadow = true; o.receiveShadow = false; o.userData.keepGeo = true; this.parts.push(o); } });
      this.gunMount = new THREE.Group(); this.gunMount.matrixAutoUpdate = false; this.root.add(this.gunMount);
      this.gun = null; this.hold = 'rifle'; this.acc = 0; this.wasDead = false; this.camK = 1; this.t2 = 0; this.anim = []; this.backZ = 0.1; this.previewScale = 1.12;
      this.s = { w: {}, crouch: 0, lower: 1, yaw: 0, ride: 0 }; for (const k in BASES) this.s.w[k] = k === 'idle' ? 1 : 0;
      this.tw = TWEAK.filter(n => this.bones[n]).map(n => ({ b: this.bones[n], base: this.bones[n].quaternion.clone(), out: this.bones[n].quaternion.clone() }));
      this.mixer = new THREE.AnimationMixer(this.model); this.act = {};
      for (const k in BASES) { const a = this.mixer.clipAction(Q.clips[BASES[k]]); if (k === 'dead') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else { a.play(); a.setEffectiveWeight(k === 'idle' ? 1 : 0); } this.act[k] = a; }
      this.mixer.update(0.2); this.model.updateMatrixWorld(true);
      this.frames();                                                                    // neck / chest / hips frames for the accessories
      this.calibrate();
      Character.dress(this, null, skin, opts);
    }

    // a frame that sits where a part of the old procedural rig sat (neck, chest, hips) and moves with the bone next to it
    frames() {
      _inv.copy(this.model.matrixWorld).invert();
      const defs = [['neck', 'Head', 1.56], ['chest', 'spine_01', 1.02], ['hips', 'pelvis', 0.98]];
      this.fr = defs.map(([n, bone, y]) => { const g = this[n] = new THREE.Group(); g.matrixAutoUpdate = false; this.root.add(g); const b = this.bones[bone]; return { g, b, rest: new M4().copy(this.model.matrix).multiply(_mi.multiplyMatrices(_inv, b.matrixWorld)).invert(), t: new M4().makeTranslation(0, y, 0) }; });
    }
    updateFrames() {
      _inv.copy(this.model.matrixWorld).invert();
      for (const f of this.fr) { f.g.matrix.copy(this.model.matrix).multiply(_mi.multiplyMatrices(_inv, f.b.matrixWorld)).multiply(f.rest).multiply(f.t); f.g.matrixWorldNeedsUpdate = true; }
    }

    // the gun is carried by the chest: remember where it sits relative to the upper spine in the idle pose
    calibrate() {
      _inv.copy(this.model.matrixWorld).invert();
      const cInv = new M4().multiplyMatrices(_inv, this.bones.spine_03.matrixWorld).invert();
      this.mount = {};
      for (const k in HOLD) { const h = HOLD[k], z = new V(0, 0, -1), y = new V(0, 1, 0), x = new V().crossVectors(y, z); this.mount[k] = { local: cInv.clone().multiply(new M4().makeBasis(x, y, z).setPosition(h.o[0], h.o[1], h.o[2])), grip: new V(...h.grip), fore: new V(...h.fore), reload: new V(...h.reload), size: h.size }; }
    }

    tick(dt) { this.t2 += dt; for (const f of this.anim) f(dt); }
    setShadows(on) { for (const m of this.parts) m.castShadow = on; }
    setPoints(n) { Character.setPoints(this, n); }
    setGun(gun, hold) { if (this.gun) this.gunMount.remove(this.gun); this.gun = gun; this.hold = HOLD[hold] ? hold : 'rifle'; if (gun) this.gunMount.add(gun); }

    mp(bone, out) { return out.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_inv); }                  // a bone's position in model space
    palm(n, out) { const H = this.bones['hand_' + n], F = this.bones['middle_01_' + n]; this.mp(H, out); return out.lerp(this.mp(F, _h), 0.55); }     // the middle of the hand, where the grip goes
    turn(bone, rq) {                                                                                            // rotate a bone by a rotation given in model space (the bones' own axes are not aligned with the model)
      _q.identity(); for (let o = bone.parent; o && o !== this.model; o = o.parent) _q.premultiply(o.quaternion);
      _qx.copy(_q).invert().multiply(rq).multiply(_q); bone.quaternion.premultiply(_qx);
    }
    rot(bone, from, to) { this.turn(bone, _q2.setFromUnitVectors(from, to)); }                                // turn a bone so that the model space direction "from" becomes "to"
    // two-bone IK: the end (the palm of a hand, or the foot) goes to the target (model space), the middle joint (elbow, knee) bends towards the pole
    ik2(U, L, end, target, pole) {
      if (!U || !L) return;
      const S = this.mp(U, _a), E = this.mp(L, _b), W = end(_c), l1 = S.distanceTo(E), l2 = E.distanceTo(W);
      const d = _d.copy(target).sub(S), dist = clamp(d.length(), 0.1, l1 + l2 - 0.005); d.normalize();
      const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const p = _p.copy(pole).addScaledVector(d, -pole.dot(d)).normalize(), E2 = _f.copy(S).addScaledVector(d, a).addScaledVector(p, h), goal = _i.copy(S).addScaledVector(d, dist);
      this.rot(U, _g.copy(E).sub(S).normalize(), _h.copy(E2).sub(S).normalize()); U.updateMatrixWorld(true);
      const E3 = this.mp(L, _b), W3 = end(_c);
      this.rot(L, _g.copy(W3).sub(E3).normalize(), _h.copy(goal).sub(E3).normalize()); L.updateMatrixWorld(true);
    }
    ik(n, target) { this.ik2(this.bones['upperarm_' + n], this.bones['lowerarm_' + n], (o) => this.palm(n, o), target, POLE[n]); }                  // an arm: the palm goes to the target
    legIk(n, target) { const F = this.bones['foot_' + n]; this.ik2(this.bones['thigh_' + n], this.bones['calf_' + n], (o) => this.mp(F, o), target, n === 'l' ? LEGPOLE.l : LEGPOLE.r); }       // a leg: the ankle goes to the target
    // the fingers close around a grip (amount 0..1)
    curl(n, amount) {
      for (const f of FINGERS) for (let i = 1; i <= 3; i++) { const b = this.bones[f + '_0' + i + '_' + n]; if (b) b.quaternion.multiply(_q.setFromAxisAngle(CURL_AXIS, (n === 'l' ? 1 : -1) * amount * (f === 'thumb' ? 0.5 : 0.9 - i * 0.12))); }
    }

    update(dt, st) {
      const S = this.s, A = this.act, sp = st.speed || 0, k = Math.min(1, dt * 8);
      let base = 'idle';
      if (st.dead) base = 'dead'; else if (st.ride) base = 'sit'; else if (st.drop || st.air) base = 'air';
      else if (st.swim) base = sp > 0.5 ? 'swim' : 'sidle';
      else if (st.crouch || st.slide) base = sp > 0.4 ? 'cwalk' : 'cidle';
      else if (sp > 0.35) base = sp > 6.6 ? 'sprint' : sp > 2.3 ? 'jog' : 'walk';
      if (st.dead && !this.wasDead) A.dead.reset().play();
      else if (!st.dead && this.wasDead) { A.dead.stop(); for (const n in S.w) S.w[n] = n === 'idle' ? 1 : 0; }
      this.wasDead = !!st.dead;
      let sum = 0; for (const n in S.w) { S.w[n] += ((n === base ? 1 : 0) - S.w[n]) * (n === 'dead' ? Math.min(1, dt * 14) : k); sum += S.w[n]; }
      for (const n in S.w) if (n !== 'dead' || this.wasDead) A[n].setEffectiveWeight(S.w[n] / sum);        // the weights always add up to 1, otherwise the pose blends with the bind pose
      // the way it moves relative to where it looks: backwards plays the clip in reverse, sideways turns the legs and counter-turns the spine
      let dx = st.dirx, dz = st.dirz; if (dx === undefined || dx * dx + dz * dz < 0.04) { dx = 0; dz = st.fwd < 0 ? -1 : 1; }          // no direction known: forwards, or backwards when the caller says so
      const ang = Math.atan2(dx, dz), back = Math.abs(ang) > 1.9, want = sp > 0.5 && !st.ride && !st.dead ? -(back ? ang - Math.sign(ang) * Math.PI : ang) : 0;        // (a turn of the model about +Y is to the left: moving right is a negative turn)
      S.yaw += (clamp(want, -1.25, 1.25) - S.yaw) * Math.min(1, dt * 9);
      const dir = back ? -1 : 1;
      A.walk.timeScale = dir * clamp(sp / SPEED.walk, 0.5, 2.6); A.jog.timeScale = dir * clamp(sp / SPEED.jog, 0.55, 1.4); A.sprint.timeScale = clamp(sp / SPEED.sprint, 0.8, 1.3);
      A.cwalk.timeScale = dir * clamp(sp / SPEED.cwalk, 0.6, 3); A.swim.timeScale = clamp(sp / SPEED.swim, 0.6, 1.8);
      S.crouch += ((st.crouch || st.slide ? 1 : 0) - S.crouch) * Math.min(1, dt * 10);
      S.lower += ((st.raise > 0.5 && !st.sprint ? 0 : 1) - S.lower) * Math.min(1, dt * 8);
      S.ride += ((st.ride ? 1 : 0) - S.ride) * Math.min(1, dt * 8);
      // far away characters animate at a lower rate (the lobby preview always runs at full speed)
      this.acc += dt; let step = 0;
      if (!this.opts.preview && !st.dead && G.camera) { const d2 = G.camera.position.distanceToSquared(this.root.position); step = d2 > 8100 ? 0.12 : d2 > 2025 ? 0.05 : 0; }
      if (!this.root.visible && !st.dead) { this.acc = 0; return; }                       // nobody sees it: no work (a falling body is always laid down, seen or not)
      if (this.acc < step) return;                                                        // the bones keep the pose of the last step
      this.mixer.update(this.acc); this.acc = 0;
      // the mixer only writes a bone when its animated value changed: put back the pose it made before the bones are bent again, otherwise the bending piles up
      for (const t of this.tw) if (t.b.quaternion.equals(t.out)) t.b.quaternion.copy(t.base); else t.base.copy(t.b.quaternion);
      this.pose(st);
      for (const t of this.tw) t.out.copy(t.b.quaternion);
      this.sync();
    }

    // everything the clips do not know about: look up / down, the body facing the aim while the legs follow the movement, the gun in the hands, the arms on the gun
    pose(st) {
      const S = this.s, bn = this.bones, ride = S.ride, pitch = clamp(st.pitch || 0, -1.2, 1.2) * (st.dead ? 0 : 1) * (1 - ride);
      this.model.rotation.y = Math.PI + S.yaw; this.model.position.set(0, 0.44 * ride, -0.27 * ride); this.model.updateMatrix(); this.model.updateMatrixWorld(true);       // (on a bike the seated clip is shifted onto the seat)
      _inv.copy(this.model.matrixWorld).invert();
      if (Math.abs(S.yaw) > 0.01) {                                                         // the chest keeps facing the way it aims
        this.turn(bn.spine_01, _q2.setFromAxisAngle(AY, -S.yaw * 0.25)); this.turn(bn.spine_02, _q2.setFromAxisAngle(AY, -S.yaw * 0.3)); this.turn(bn.spine_03, _q2.setFromAxisAngle(AY, -S.yaw * 0.3)); this.turn(bn.neck_01, _q2.setFromAxisAngle(AY, -S.yaw * 0.1));
      }
      if (pitch || ride > 0.01) {                                                           // the spine carries the gun, the head follows a little; on a bike the rider leans over the handlebars
        this.turn(bn.spine_01, _q2.setFromAxisAngle(AX, P.sign * pitch * P.s1 + ride * 0.12)); this.turn(bn.spine_02, _q2.setFromAxisAngle(AX, P.sign * pitch * P.s2 + ride * 0.12));
        this.turn(bn.spine_03, _q2.setFromAxisAngle(AX, P.sign * pitch * P.s3 + ride * 0.12)); this.turn(bn.Head, _q2.setFromAxisAngle(AX, P.sign * pitch * P.head - ride * 0.15));
      }
      this.model.updateMatrixWorld(true);
      this.gunMount.visible = !!this.gun && ride < 0.5 && this.s.w.dead < 0.5 && !st.drop;
      if (st.drop === 'glide') { this.mp(bn.Head, _s); const y = _s.y + 0.4; this.ik('r', _tr.set(-0.55, y, 0.05)); this.ik('l', _tl.set(0.55, y, 0.05)); }
      else if (ride > 0.5) {                                                                // both hands on the handlebars (root space: the character looks along -Z, its right hand side is +X)
        _mi.copy(this.model.matrix).invert(); this.ik('r', _tr.set(0.34, 1.06, -0.56).applyMatrix4(_mi)); this.ik('l', _tl.set(-0.34, 1.06, -0.56).applyMatrix4(_mi));
        this.legIk('r', _tr.set(0.2, 0.5, -0.02).applyMatrix4(_mi)); this.legIk('l', _tl.set(-0.2, 0.5, -0.02).applyMatrix4(_mi));                        // the feet on the pegs
        this.curl('r', 0.75); this.curl('l', 0.75);
      }
      if (!this.gunMount.visible) return;
      // the gun: rigid pose of the chest (model space) times the mount, nudged for low-ready / sprint / reload / recoil
      const mt = this.mount[this.hold], lw = LOWER[this.hold], lo = S.lower, rl = st.reload > 0 ? Math.sin(Math.min(1, st.reload) * Math.PI) : 0, kick = st.recoil || 0, gw = mt.size;
      _e.set(lo * (st.sprint ? 0.2 : lw[0]) - rl * 0.3 - kick * 0.06, lo * (st.sprint ? 0.35 : lw[1]), rl * 0.35, 'YXZ');
      _lo.makeRotationFromEuler(_e).setPosition(0, -lo * 0.12 - rl * 0.1, -lo * 0.06 - kick * 0.04);
      _gm.copy(_inv).multiply(bn.spine_03.matrixWorld).multiply(_lo).multiply(mt.local).scale(_s.set(gw, gw, gw));       // gun in model space
      if (pitch) {                                                                                              // the body only leans a part of the way, the gun is lifted the rest around the shoulders
        _t.makeRotationX(P.sign * pitch * P.gun); _s.set(0, 1.4, 0).applyMatrix4(_t); _t.setPosition(-_s.x, 1.4 - _s.y, -_s.z); _gm.premultiply(_t);
      }
      // in root space the position follows the model, the orientation and the size do not
      _q.setFromRotationMatrix(_t.extractRotation(_gm)); _q2.setFromEuler(this.model.rotation); _q.premultiply(_q2);
      _a.setFromMatrixPosition(_gm).applyMatrix4(this.model.matrix);
      this.gunMount.matrix.compose(_a, _q, _s.set(gw, gw, gw)); this.gunMount.matrixWorldNeedsUpdate = true;
      if (st.drop || this.s.w.dead > 0.5) return;
      this.ik('r', _tr.copy(mt.grip).applyMatrix4(_gm));
      this.ik('l', _tl.copy(rl > 0.5 && this.hold !== 'pistol' ? mt.reload : mt.fore).applyMatrix4(_gm));
      this.curl('r', 0.9); this.curl('l', 0.75);
    }

    // after the rest of the frame (the mixer and the poses above) the frames of the accessories follow the bones
    sync() { this.model.updateMatrixWorld(true); this.updateFrames(); }
  }
  window.QRig = QRig;
})();
