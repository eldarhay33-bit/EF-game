// Skin catalogue and the accessories (wings, capes, halos, aura, flames...) that make the rarer skins stand out.
// A skin is a character built by qrig.js from the CC0 base characters of Quaternius and dressed by suit.js. cloth / gear / helmet / glow are the colours of the shop swatch and of the accessories.
//   q.g      'm' | 'f' (the body)         q.tone  light / mid / dark skin       q.hair  hair meshes (Hair_*)      q.hc  hair colour
//   q.suit   c: colours [torso, sleeves, legs, gloves, boots, light lines, pattern 2, pattern 3]   pat: solid | camo | stripe | bands | gradient   on: [torso, sleeves, legs] get the pattern
//            sleeve 0 = short sleeves   pants = height where the trousers end (0 = long)   gloves 0 = bare hands   glow = light lines 0..3   lines 1 sides / 2 circuit / 3 both   metal, rough = the cloth
//   q.gear   what it wears (see suit.js): helmet[:full|cover] cap beanie hood goggles[:neon] visor bubble mask[:gas] headset collar vest[:armor] pack[:jet] pads[:spike] elbows bracers[:plate] cuffs belt holster knees[:soft] shins boots[:sneaker|sci]
//   q.gc     colours of the gear: plate, fabric, metal, rubber, glass
const SKINS = [
  { id: 'recruit', name: '', rarity: 0, cloth: 0x4a5a3a, gear: 0x2a3224, helmet: 0x3f4a33, glow: null, look: {}, q: { g: 'm', tone: 'mid', hair: ['Hair_Buzzed'], hc: 0x3a2a1c, suit: { c: [0x4a5a3a, 0x4a5a3a, 0x3f4a33, 0x1f2220, 0x1a1b1c] }, gear: ['cap', 'belt', 'knees:soft', 'boots', 'collar'], gc: { fabric: 0x3f4a33 } } },
  { id: 'rookie', name: '', rarity: 0, cloth: 0x2f3a46, gear: 0x1a1c20, helmet: 0xe8ecf0, glow: 0x35f0ff, look: {}, q: { g: 'f', tone: 'light', hair: ['Hair_Buns'], hc: 0x5a3a22, suit: { c: [0x2f3a46, 0x2f3a46, 0x1a1c20, 0x1a1c20, 0xf2f2f2, 0x35f0ff], glow: 0.9, lines: 1, sleeve: 1 }, gear: ['headset', 'belt', 'boots:sneaker', 'collar'], gc: { fabric: 0xe8ecf0, plate: 0x2f3a46 } } },
  { id: 'street', name: '', rarity: 1, cloth: 0xe0701a, gear: 0x2a2c33, helmet: 0xe0701a, glow: null, look: {}, q: { g: 'm', tone: 'dark', hair: ['Hair_Buzzed'], hc: 0x151515, suit: { c: [0xe0701a, 0xe0701a, 0x2a2c33, 0x2a2c33, 0xf2f2f2], gloves: 0 }, gear: ['hood', 'boots:sneaker', 'belt'], gc: { fabric: 0xe0701a } } },
  { id: 'pink', name: '', rarity: 1, cloth: 0xe0508a, gear: 0x1a1c20, helmet: 0xffffff, glow: null, look: {}, q: { g: 'f', tone: 'mid', hair: ['Hair_Long'], hc: 0xf2d28a, suit: { c: [0xe0508a, 0xe0508a, 0x1a1c20, 0x1a1c20, 0xf8f8f8, 0xffffff, 0xffffff], pat: 'stripe', on: [0, 1, 0] }, gear: ['goggles', 'belt', 'boots:sneaker'], gc: { fabric: 0xf8f8f8 } } },
  { id: 'mechanic', name: '', rarity: 1, cloth: 0x2a63b8, gear: 0xf2c230, helmet: 0x2a63b8, glow: null, look: {}, q: { g: 'm', tone: 'light', hair: ['Hair_SimpleParted'], hc: 0x6a4426, suit: { c: [0x2a63b8, 0x2a63b8, 0x2a63b8, 0x2a2c33, 0x2a2c33, 0xf2c230, 0xf2c230], pat: 'stripe', on: [1, 1, 1] }, gear: ['cap', 'belt', 'knees:soft', 'boots'], gc: { fabric: 0x2a63b8, rubber: 0x2a2c33 } } },
  { id: 'medic', name: '', rarity: 1, cloth: 0xe8ecf0, gear: 0xd62a2a, helmet: 0xe8ecf0, glow: null, look: {}, q: { g: 'f', tone: 'dark', hair: ['Hair_Buns'], hc: 0x151515, suit: { c: [0xe8ecf0, 0xe8ecf0, 0xe8ecf0, 0xd62a2a, 0xe8ecf0, 0xd62a2a, 0xd62a2a], pat: 'stripe', on: [1, 1, 1] }, gear: ['headset', 'vest', 'belt', 'boots:sneaker'], gc: { fabric: 0xd62a2a, plate: 0xe8ecf0 } } },
  { id: 'desert', name: '', rarity: 2, cloth: 0xb59a6a, gear: 0x6b5e45, helmet: 0x8a7a58, glow: null, look: {}, q: { g: 'm', tone: 'mid', hair: [], hc: 0x3a2a1c, size: 1, suit: { c: [0xb59a6a, 0xb59a6a, 0xb59a6a, 0x3a3226, 0x2a241a, 0, 0x7a6638, 0xd8c690], pat: 'camo', on: [1, 1, 1], size: 1.4 }, gear: ['helmet:cover', 'goggles', 'vest', 'pack', 'knees', 'belt', 'boots'], gc: { plate: 0x6b5e45, rubber: 0x2a241a } } },
  { id: 'arctic', name: '', rarity: 2, cloth: 0xe4e8ec, gear: 0x8b939b, helmet: 0xcfd5db, glow: null, look: {}, q: { g: 'f', tone: 'light', hair: [], hc: 0xe8d8b0, size: 1, suit: { c: [0xe4e8ec, 0xe4e8ec, 0xe4e8ec, 0x6e7680, 0x4a5058, 0, 0xaab2ba, 0x7c8590], pat: 'camo', on: [1, 1, 1] }, gear: ['mask', 'goggles', 'vest', 'pack', 'knees', 'boots'], gc: { plate: 0x8b939b, fabric: 0xe4e8ec } } },
  { id: 'jungle', name: '', rarity: 2, cloth: 0x3f4a2c, gear: 0x2b3220, helmet: 0x5a6638, glow: null, look: {}, q: { g: 'm', tone: 'dark', hair: [], hc: 0x151515, size: 1, suit: { c: [0x3f4a2c, 0x3f4a2c, 0x3f4a2c, 0x1f2418, 0x1a1c14, 0, 0x5a6638, 0x2b3220], pat: 'camo', on: [1, 1, 1] }, gear: ['helmet:cover', 'vest', 'pack', 'belt', 'knees', 'boots'], gc: { plate: 0x2b3220, rubber: 0x1a1c14 } } },
  { id: 'nightops', name: '', rarity: 2, cloth: 0x15171a, gear: 0x0c0d10, helmet: 0x1a1c20, glow: 0x59ff8a, look: {}, q: { g: 'f', tone: 'mid', hair: [], hc: 0x151515, suit: { c: [0x15171a, 0x15171a, 0x15171a, 0x0c0d10, 0x0c0d10, 0x59ff8a], glow: 1.4, lines: 1 }, gear: ['helmet', 'goggles:neon', 'vest', 'pack', 'knees', 'belt', 'holster', 'boots'], gc: { plate: 0x1c1f24, fabric: 0x1a1c20, rubber: 0x0c0d10 } } },
  { id: 'cyber', name: '', rarity: 3, cloth: 0x0c0e12, gear: 0x0d0f13, helmet: 0x101319, glow: 0x35f0ff, look: {}, q: { g: 'm', tone: 'mid', hair: [], hc: 0x101418, suit: { c: [0x0c0e12, 0x0c0e12, 0x0c0e12, 0x16181c, 0x0c0e12, 0x35f0ff], glow: 2.2, lines: 3, metal: 0.35, rough: 0.5 }, gear: ['visor', 'collar', 'pads', 'knees', 'bracers:plate', 'boots:sci'], gc: { plate: 0x14171c, fabric: 0x0c0e12 } } },
  { id: 'neon', name: '', rarity: 3, cloth: 0x1a0b2e, gear: 0x0a0517, helmet: 0x1a0b2e, glow: 0xff2fd1, look: { extras: ['sparkles'] }, q: { g: 'f', tone: 'light', hair: ['Hair_Long'], hc: 0x35d0ff, suit: { c: [0x1a0b2e, 0x1a0b2e, 0x1a0b2e, 0x2a1448, 0x1a0b2e, 0xff2fd1], glow: 2.4, lines: 3, metal: 0.25, rough: 0.45 }, gear: ['goggles:neon', 'pads', 'knees', 'bracers', 'boots:sci'], gc: { plate: 0x241040, fabric: 0x1a0b2e } } },
  { id: 'astro', name: '', rarity: 3, cloth: 0xe8eaee, gear: 0x9aa4b0, helmet: 0xf2f4f7, glow: 0xff7a1a, look: {}, q: { g: 'm', tone: 'light', hair: [], hc: 0x3a2a1c, suit: { c: [0xeceff3, 0xeceff3, 0xeceff3, 0xc8ccd2, 0xc8ccd2, 0xff7a1a, 0xff7a1a], pat: 'stripe', on: [1, 1, 1], glow: 0.6, lines: 1 }, gear: ['bubble', 'collar', 'pack', 'belt', 'boots:sci', 'bracers'], gc: { plate: 0xdfe3e8, fabric: 0xdfe3e8, metal: 0xaab2ba, rubber: 0x6a7078 } } },
  { id: 'racer', name: '', rarity: 3, cloth: 0xd42626, gear: 0xf4f4f4, helmet: 0xf4f4f4, glow: null, look: {}, q: { g: 'f', tone: 'mid', hair: [], hc: 0x151515, suit: { c: [0xd42626, 0xd42626, 0x16181c, 0x16181c, 0x16181c, 0, 0xf4f4f4, 0xf4f4f4], pat: 'stripe', on: [1, 1, 1] }, gear: ['helmet:full', 'belt', 'boots'], gc: { plate: 0xf4f4f4, rubber: 0x16181c } } },
  { id: 'phantom', name: '', rarity: 4, cloth: 0x0d0e10, gear: 0x1c1f24, helmet: 0x14161a, glow: 0xff2a2a, cape: 0x120808, look: { back: 'cape', extras: ['aura'] }, q: { g: 'm', tone: 'dark', hair: [], hc: 0x101012, suit: { c: [0x0d0e10, 0x0d0e10, 0x0d0e10, 0x16181c, 0x0d0e10, 0xff2a2a], glow: 2.6, lines: 3, metal: 0.55, rough: 0.4 }, gear: ['helmet', 'visor', 'vest:armor', 'pads:spike', 'knees', 'bracers:plate', 'boots:sci', 'belt'], gc: { plate: 0x17191d, fabric: 0x0d0e10, metal: 0x4a4d52 } } },
  { id: 'golden', name: '', rarity: 4, cloth: 0xd1a63a, gear: 0x6b5316, helmet: 0xe6c05a, glow: 0xffe08a, look: { extras: ['halo', 'sparkles'], back: 'wings' }, q: { g: 'f', tone: 'light', hair: ['Hair_Long'], hc: 0xf6e8a8, suit: { c: [0xd1a63a, 0xd1a63a, 0xd1a63a, 0x8a6a1a, 0x6b5316, 0xfff0b0], glow: 1.4, lines: 1, metal: 0.95, rough: 0.28 }, gear: ['pads', 'vest:armor', 'bracers:plate', 'knees', 'boots:sci', 'belt'], gc: { plate: 0xe0b038, fabric: 0xd1a63a, metal: 0xf0d070, rubber: 0x6b5316 } } },
  { id: 'inferno', name: '', rarity: 4, cloth: 0x14100e, gear: 0x2a1008, helmet: 0x2a1210, glow: 0xff7a1a, look: { extras: ['flames', 'aura'] }, q: { g: 'm', tone: 'mid', hair: [], hc: 0x151515, suit: { c: [0x14100e, 0x14100e, 0x14100e, 0x24140c, 0x14100e, 0xff7a1a], glow: 2.8, lines: 3, metal: 0.4, rough: 0.5 }, gear: ['helmet', 'visor', 'vest:armor', 'pads:spike', 'bracers:plate', 'knees', 'boots:sci'], gc: { plate: 0x241410, fabric: 0x14100e, metal: 0x6a3a22 } } },
  { id: 'glacier', name: '', rarity: 4, cloth: 0x9fd8f0, gear: 0x3a7fa8, helmet: 0xdff4ff, glow: 0x7fe8ff, look: { extras: ['sparkles'] }, q: { g: 'f', tone: 'light', hair: ['Hair_Long'], hc: 0xeaf6ff, suit: { c: [0x9fd8f0, 0x9fd8f0, 0x8ac8e4, 0xdff4ff, 0x6aa8c8, 0xffffff, 0xdff4ff], pat: 'gradient', on: [1, 1, 1], glow: 1.6, lines: 3, metal: 0.5, rough: 0.35 }, gear: ['visor', 'pads', 'vest:armor', 'bracers:plate', 'boots:sci', 'knees'], gc: { plate: 0xcfeefc, fabric: 0x9fd8f0, metal: 0xdff4ff } } },
  { id: 'ultra', name: '', rarity: 6, price: 40000, cloth: 0x08080a, gear: 0xc79a2a, helmet: 0xd9ab35, glow: 0xffc933, metal: 0.92, cape: 0x050506, points: true, look: { back: 'ultrawings', extras: ['halo', 'aura'] }, q: { g: 'm', tone: 'dark', hair: [], hc: 0x0a0a0c, suit: { c: [0x08080a, 0x08080a, 0x08080a, 0x14120a, 0x08080a, 0xffc933], glow: 3, lines: 3, metal: 0.35, rough: 0.42 }, gear: ['helmet', 'visor', 'vest:armor', 'pads:spike', 'bracers:plate', 'knees', 'boots:sci', 'belt'], gc: { plate: 0xd9ab35, fabric: 0x0a0a0c, metal: 0xf0d070, rubber: 0x14120a } } }
];
const SKIN_TONES = [0xe1b894, 0xc99468, 0x9c6b46, 0x6f4a30];

Character.extra = function (skin) {
  const k = 'x' + skin.id; if (this.mats[k]) return this.mats[k];
  const g = skin.glow || 0xffffff;
  const m = (o) => new THREE.MeshStandardMaterial(o);
  return (this.mats[k] = {
    gold: m({ color: 0xe0b038, metalness: 0.95, roughness: 0.22, envMapIntensity: 1.6 }), black: m({ color: 0x0a0a0c, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.4 }),
    cape: m({ color: skin.cape || 0x222222, roughness: 0.85, side: THREE.DoubleSide }),
    wing: m({ color: skin.rarity >= 6 ? 0x101012 : g, emissive: g, emissiveIntensity: skin.rarity >= 6 ? 0.9 : 1.3, transparent: true, opacity: 0.9, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.3 }),
    glowM: m({ color: g, emissive: g, emissiveIntensity: 2.6 }),
    flame: m({ color: 0xff8a1a, emissive: 0xff4a00, emissiveIntensity: 2.4 }),
    aura: m({ color: g, emissive: g, emissiveIntensity: 2, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
  });
};

Character.pointsTexture = function (points) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 72; const x = c.getContext('2d');
  x.fillStyle = '#0a0a0c'; x.fillRect(0, 0, 256, 72); x.strokeStyle = '#e0b038'; x.lineWidth = 3; x.strokeRect(3, 3, 250, 66);
  x.fillStyle = '#ffd24a'; x.textAlign = 'center'; x.font = 'bold 22px Arial'; x.fillText('★ ULTRA MAX ★', 128, 28); x.font = 'bold 26px Arial'; x.fillText(Number(points || 0).toLocaleString('en-US') + ' PTS', 128, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};

// the points plate of the ULTRA MAX skin shows the player's score: every rig that has one answers to setPoints
Character.setPoints = function (rig, n) {
  if (!rig.plates) return; const tex = Character.pointsTexture(n);
  for (const p of rig.plates) { if (p.material.map) p.material.map.dispose(); p.material.map = tex; p.material.needsUpdate = true; }
};
Rig.prototype.setPoints = function (n) { Character.setPoints(this, n); };

// Accessories on a rig. The rig offers three frames that follow the body: neck (the base of the head), chest (the waist) and hips, all with the character looking along -Z, +Y up,
// plus anim (a list of functions run every frame), t2 (seconds), s.crouch and (optionally) backZ, how far the back items must sit behind the body.
Character.dress = function (rig, M, skin, opts) {
  const L = skin.look || {}, X = Character.extra(skin), self = rig, chest = rig.chest, neck = rig.neck, hips = rig.hips, BZ = rig.backZ || 0;
  const mk = (geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ----- back -----
  const wingFan = (s, mat, tall, count, rot0) => { const g = new THREE.Group(); g.position.set(s * 0.07, 0.4, 0.17 + BZ); chest.add(g);
    for (let i = 0; i < count; i++) { const len = tall - i * (tall * 0.12), p = mk(box(0.035, len, 0.008), mat, g, s * (0.02 + i * 0.045), len * 0.45 + 0.02, 0.02, 0, 0, -s * (rot0 + i * 0.28)); p.castShadow = false; } return g; };
  switch (L.back) {
    case 'cape': { const g = new THREE.Group(); g.position.set(0, 0.5, 0.15 + BZ); chest.add(g); const c = mk(new THREE.PlaneGeometry(0.5, 1.0, 1, 4), X.cape, g, 0, -0.5, 0.02, 0.1); c.castShadow = false;
      if (skin.rarity >= 4) mk(box(0.52, 0.02, 0.012), X.gold, g, 0, -1.0, 0.04, 0.1); self.anim.push(dt => { g.rotation.x = 0.1 + Math.sin(self.t2 * 2 + 1) * 0.04 + Math.min(0.5, self.s.crouch * 0.1); }); self.cape = g; break; }
    case 'wings': { const gl = wingFan(-1, X.wing, 0.7, 5, 0.35), gr = wingFan(1, X.wing, 0.7, 5, 0.35); self.anim.push(() => { const f = Math.sin((self.flap = (self.flap || 0) + 0.02)) * 0.08; gl.rotation.y = -0.45 + f; gr.rotation.y = 0.45 - f; }); break; }
    case 'ultrawings': { const gl = wingFan(-1, X.wing, 0.9, 7, 0.25), gr = wingFan(1, X.wing, 0.9, 7, 0.25); for (const [g, s] of [[gl, -1], [gr, 1]]) for (let i = 0; i < 7; i++) { const len = 0.9 - i * 0.108; mk(box(0.012, len * 0.9, 0.012), X.glowM, g, s * (0.02 + i * 0.045), len * 0.45 + 0.02, 0.03, 0, 0, -s * (0.25 + i * 0.28)).castShadow = false; }
      const c = new THREE.Group(); c.position.set(0, 0.5, 0.15 + BZ); chest.add(c); mk(new THREE.PlaneGeometry(0.46, 0.95, 1, 4), X.cape, c, 0, -0.47, 0.01, 0.1).castShadow = false; mk(box(0.48, 0.02, 0.012), X.gold, c, 0, -0.95, 0.03, 0.1);
      self.anim.push(() => { const f = Math.sin((self.flap = (self.flap || 0) + 0.018)) * 0.09; gl.rotation.y = -0.5 + f; gr.rotation.y = 0.5 - f; c.rotation.x = 0.1 + Math.sin(self.t2 * 1.7) * 0.04; }); break; }
    default: break;
  }

  // ----- extras -----
  for (const ex of L.extras || []) {
    if (ex === 'halo') { const h = mk(new THREE.TorusGeometry(0.18, 0.012, 8, 28).rotateX(Math.PI / 2), X.glowM, neck, 0, 0.5, 0); h.castShadow = false; self.anim.push(dt => { h.rotation.y += dt * 1.2; h.position.y = 0.5 + Math.sin(self.t2 * 2) * 0.012; }); }
    if (ex === 'sparkles') { const g = new THREE.Group(); rig.root.add(g); const items = [], geo = new THREE.OctahedronGeometry(0.025); for (let i = 0; i < 14; i++) { const m = mk(geo, X.glowM, g); m.castShadow = false; items.push({ m, a: i / 14 * 6.283, r: 0.38 + (i % 3) * 0.08, h: 0.2 + (i * 0.13) % 1.6, s: 0.6 + (i % 4) * 0.3 }); }
      self.anim.push(() => { for (const it of items) { const a = it.a + self.t2 * it.s; it.m.position.set(Math.cos(a) * it.r, it.h + Math.sin(self.t2 * 1.5 + it.a) * 0.08, Math.sin(a) * it.r); it.m.rotation.y = a * 2; } }); }
    if (ex === 'aura') { const r1 = mk(new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2), X.aura, rig.root, 0, 0.03, 0), r2 = mk(new THREE.RingGeometry(0.28, 0.32, 40).rotateX(-Math.PI / 2), X.aura, rig.root, 0, 0.032, 0); r1.castShadow = r2.castShadow = false; self.anim.push(() => { r1.rotation.y += 0.01; r2.rotation.y -= 0.016; }); }
    if (ex === 'flames') { const fl = []; for (const [par, x, y, z] of [[chest, 0.26, 0.58, 0], [chest, -0.26, 0.58, 0], [neck, 0, 0.3, 0], [chest, 0, 0.5, 0.2 + BZ]]) { const c = mk(new THREE.ConeGeometry(0.05, 0.2, 7), X.flame, par, x, y, z); c.castShadow = false; fl.push(c); } self.anim.push(() => { fl.forEach((c, i) => { const k = 1 + Math.sin(self.t2 * 14 + i * 2) * 0.25; c.scale.set(k, 0.8 + Math.sin(self.t2 * 11 + i) * 0.3, k); }); }); }
  }

  // ----- points plate (ULTRA MAX) -----
  if (skin.points) {
    const pts = (typeof Profile !== 'undefined' && Profile.d) ? Profile.d.points : 0, tex = Character.pointsTexture(pts);
    self.plates = [];
    const back = mk(new THREE.PlaneGeometry(0.28, 0.08), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), chest, 0, 0.2, 0.225 + BZ); back.rotation.y = Math.PI; back.castShadow = false; self.plates.push(back);
    const front = mk(new THREE.PlaneGeometry(0.2, 0.056), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), hips, 0, 0.09, -0.15 - BZ * 0.5); front.castShadow = false; self.plates.push(front);
  }

  // ----- equipment accents from the loadout (vest, helmet, boots, gloves, pack) -----
  const lo = opts && opts.loadout;
  if (lo && !rig.isQ) {                                                                       // (skeletal characters wear the real pieces of gear.js instead)
    const acc = (tier) => RARITY[Math.max(0, Math.min(4, tier - 1))].color;
    const strip = (parent, color, w, h, d, x, y, z) => { const m = mk(box(w, h, d), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5 }), parent, x, y, z); m.castShadow = false; };
    if (lo.vest) strip(chest, acc(lo.vest), 0.3, 0.02, 0.012, 0, 0.5, -0.17);
    if (lo.helmet) strip(neck, acc(lo.helmet), 0.012, 0.012, 0.22, 0, 0.29, 0);
    if (lo.boots && rig.feet) for (const s of [-1, 1]) strip(rig.feet[s < 0 ? 0 : 1], acc(lo.boots), 0.13, 0.014, 0.012, 0, 0.1, -0.09);
    if (lo.gloves && rig.hands) for (const s of [-1, 1]) strip(rig.hands[s < 0 ? 0 : 1], acc(lo.gloves), 0.1, 0.014, 0.1, 0, 0, 0);
    if (lo.pack) strip(chest, acc(lo.pack), 0.22, 0.012, 0.012, 0, 0.55, 0.2 + BZ);
  }
};
Rig.prototype.addLook = function (M, Gs, skin, opts) { Character.dress(this, M, skin, opts); };
