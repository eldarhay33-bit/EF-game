// Skin catalogue and the procedural accessories that make skins differ in silhouette (helmets, capes, wings, armour, horns...).
const SKINS = [
  { id: 'woodland', name: '', rarity: 0, camo: [0x3f4a2c, 0x5a6638, 0x2b3220, 0x6b5a3a], period: 5, gear: 0x2d3226, helmet: 0x3a4230, glow: null, look: { head: 'helmet', vest: 'plate', back: 'pack' } },
  { id: 'desert', name: '', rarity: 0, camo: [0xb59a6a, 0x8f7a52, 0xc9b58a, 0x6e5c3e], period: 5, gear: 0x6b5e45, helmet: 0x8a7a58, glow: null, look: { head: 'boonie', vest: 'light', back: 'pack' } },
  { id: 'arctic', name: '', rarity: 1, camo: [0xe4e8ec, 0xaab2ba, 0xf5f7f9, 0x7c8590], period: 6, gear: 0x8b939b, helmet: 0xcfd5db, glow: null, look: { head: 'hood', vest: 'heavy', back: 'pack' } },
  { id: 'urban', name: '', rarity: 1, camo: [0x4a4d50, 0x2f3134, 0x6d7074, 0x1f2022], period: 8, gear: 0x1f2022, helmet: 0x2a2c2e, glow: null, look: { head: 'cap', vest: 'plate', back: 'none', shoulders: 'epaulets' } },
  { id: 'digital', name: '', rarity: 1, camo: [0x41505f, 0x2c3743, 0x5d6f80, 0x1e252d], period: 14, gear: 0x232a33, helmet: 0x2c3743, glow: null, look: { head: 'beret', vest: 'light', back: 'quiver' } },
  { id: 'tiger', name: '', rarity: 2, camo: [0x6b4a1e, 0x1e1a10, 0x8f6a2a, 0x403014], period: 9, gear: 0x2a2113, helmet: 0x3a2d16, glow: null, look: { head: 'beanie', vest: 'heavy', back: 'pack', shoulders: 'pads', extras: ['greaves'] } },
  { id: 'ghillie', name: '', rarity: 2, camo: [0x4a5a2a, 0x6b6a35, 0x384420, 0x7a6a3c, 0x2a3318], period: 16, gear: 0x30381f, helmet: 0x3b4524, glow: null, look: { head: 'hood', vest: 'none', back: 'none', extras: ['ghillie'] } },
  { id: 'blackops', name: '', rarity: 2, camo: null, cloth: 0x1b1c1e, gear: 0x111213, helmet: 0x161718, glow: 0xff2a2a, look: { head: 'gasmask', vest: 'heavy', back: 'pack', shoulders: 'pads', extras: ['greaves'] } },
  { id: 'crimson', name: '', rarity: 3, camo: null, cloth: 0x7a1f1f, gear: 0x2a1414, helmet: 0x3a1616, glow: 0xffb040, cape: 0x8a1c1c, look: { head: 'horns', vest: 'armor', back: 'cape', shoulders: 'spikes' } },
  { id: 'cyber', name: '', rarity: 3, camo: null, cloth: 0x15181e, gear: 0x0d0f13, helmet: 0x101319, glow: 0x35f0ff, look: { head: 'visor', vest: 'heavy', back: 'jetpack', extras: ['veins', 'greaves'] } },
  { id: 'samurai', name: '', rarity: 3, camo: null, cloth: 0x2a2f45, gear: 0x7a1f1f, helmet: 0x1c1f2c, glow: 0xffd24a, look: { head: 'samurai', vest: 'robe', back: 'quiver', shoulders: 'plates' } },
  { id: 'astro', name: '', rarity: 3, camo: null, cloth: 0xe8eaee, gear: 0x9aa4b0, helmet: 0xf2f4f7, glow: 0x4aa8ff, look: { head: 'astro', vest: 'light', back: 'pack', extras: ['greaves'] } },
  { id: 'reaper', name: '', rarity: 3, camo: null, cloth: 0x14161a, gear: 0x0c0d10, helmet: 0x101114, glow: 0x59ff8a, cape: 0x0e1012, look: { head: 'skull', vest: 'robe', back: 'cape', extras: ['veins'] } },
  { id: 'phantom', name: '', rarity: 4, camo: null, cloth: 0xdadfe4, gear: 0x8e98a3, helmet: 0xeff2f5, glow: 0x4aa8ff, metal: 0.35, look: { head: 'visor', vest: 'armor', back: 'wings', shoulders: 'plates', extras: ['veins'] } },
  { id: 'gold', name: '', rarity: 4, camo: null, cloth: 0xd1a63a, gear: 0x6b5316, helmet: 0xe6c05a, glow: 0xffe08a, metal: 0.85, cape: 0xb8862a, look: { head: 'crown', vest: 'armor', back: 'cape', shoulders: 'spikes', extras: ['halo'] } },
  { id: 'dragon', name: '', rarity: 4, camo: null, cloth: 0x4a1410, gear: 0x1b0c0a, helmet: 0x2a1210, glow: 0xff7a1a, metal: 0.4, look: { head: 'horns', vest: 'armor', back: 'wings', shoulders: 'spikes', extras: ['tail', 'veins'] } },
  { id: 'ultra', name: '', rarity: 6, price: 40000, camo: null, cloth: 0x08080a, gear: 0xc79a2a, helmet: 0xd9ab35, glow: 0xffc933, metal: 0.92, cape: 0x050506, points: true, look: { head: 'ultra', vest: 'armor', back: 'ultrawings', shoulders: 'spikes', extras: ['halo', 'veins', 'greaves', 'crownjewel'] } }
];
const SKIN_TONES = [0xe1b894, 0xc99468, 0x9c6b46, 0x6f4a30];

Character.extra = function (skin) {
  const k = 'x' + skin.id; if (this.mats[k]) return this.mats[k];
  const M = this.materialsFor(skin, SKIN_TONES[0]), g = skin.glow || 0xffffff;
  const m = (o) => new THREE.MeshStandardMaterial(o);
  return (this.mats[k] = {
    gold: m({ color: 0xe0b038, metalness: 0.95, roughness: 0.22, envMapIntensity: 1.6 }), black: m({ color: 0x0a0a0c, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.4 }),
    bone: m({ color: 0xe9e4d4, roughness: 0.6 }), leaf: m({ map: Tex.t.leaf, color: 0xa8c070, roughness: 1, side: THREE.DoubleSide }),
    glass: m({ color: 0x9fd2ff, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.32, envMapIntensity: 2.2 }),
    cape: m({ color: skin.cape || 0x222222, roughness: 0.85, side: THREE.DoubleSide }),
    wing: m({ color: skin.rarity >= 6 ? 0x101012 : g, emissive: g, emissiveIntensity: skin.rarity >= 6 ? 0.9 : 1.3, transparent: true, opacity: 0.9, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.3 }),
    glowM: m({ color: g, emissive: g, emissiveIntensity: 2.6 }), eye: m({ color: g, emissive: g, emissiveIntensity: 3.2 }), red: m({ color: 0x8a1a1a, roughness: 0.6 })
  });
};

Character.pointsTexture = function (points) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 72; const x = c.getContext('2d');
  x.fillStyle = '#0a0a0c'; x.fillRect(0, 0, 256, 72); x.strokeStyle = '#e0b038'; x.lineWidth = 3; x.strokeRect(3, 3, 250, 66);
  x.fillStyle = '#ffd24a'; x.textAlign = 'center'; x.font = 'bold 22px Arial'; x.fillText('★ ULTRA MAX ★', 128, 28); x.font = 'bold 26px Arial'; x.fillText(Number(points || 0).toLocaleString('en-US') + ' PTS', 128, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};

Rig.prototype.setPoints = function (n) {
  if (!this.plates) return; const tex = Character.pointsTexture(n);
  for (const p of this.plates) { if (p.material.map) p.material.map.dispose(); p.material.map = tex; p.material.needsUpdate = true; }
};

Rig.prototype.addLook = function (M, Gs, skin, opts) {
  const L = skin.look || {}, X = Character.extra(skin), self = this;
  const mk = (geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  const sph = (r, sx = 1, sy = 1, sz = 1, seg = 12) => new THREE.SphereGeometry(r, seg, 9).scale(sx, sy, sz);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s), cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
  const neck = this.neck, chest = this.chest, hips = this.hips, hide = () => this.headMeshes.forEach(m => { m.visible = false; });
  const dome = (r, mat, y = 0.15) => mk(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(1, 0.95, 1.08), mat, neck, 0, y, 0);

  switch (L.head) {
    case 'cap': dome(0.123, M.cloth, 0.14); mk(box(0.18, 0.014, 0.1), M.cloth, neck, 0, 0.145, -0.13); mk(box(0.2, 0.05, 0.03), M.visor, neck, 0, 0.1, -0.1); break;
    case 'beanie': mk(sph(0.125, 1, 0.95, 1.05), M.cloth, neck, 0, 0.16, 0.0); mk(sph(0.03), M.gear, neck, 0, 0.275, 0); mk(box(0.2, 0.05, 0.03), M.visor, neck, 0, 0.1, -0.1); break;
    case 'beret': mk(sph(0.14, 1.1, 0.38, 1.1), M.cloth, neck, 0.03, 0.22, 0.0, 0, 0, 0.18); mk(cyl(0.12, 0.12, 0.03, 14), M.gear, neck, 0, 0.17, 0); mk(box(0.2, 0.05, 0.03), M.visor, neck, 0, 0.1, -0.1); break;
    case 'boonie': mk(cyl(0.23, 0.23, 0.01, 18), M.helmet, neck, 0, 0.18, 0); mk(cyl(0.11, 0.125, 0.09, 14), M.helmet, neck, 0, 0.23, 0); mk(box(0.18, 0.05, 0.03), M.visor, neck, 0, 0.1, -0.1); break;
    case 'hood': mk(sph(0.14, 1, 1.05, 1.08), M.cloth, neck, 0, 0.14, 0.02); mk(cyl(0.12, 0.2, 0.14, 12), M.cloth, neck, 0, 0.0, 0.03); mk(box(0.19, 0.05, 0.03), M.visor, neck, 0, 0.12, -0.1); break;
    case 'gasmask': dome(0.125, M.helmet, 0.15); mk(box(0.11, 0.1, 0.07), M.gear, neck, 0, 0.09, -0.1); mk(cyl(0.035, 0.035, 0.06, 10), M.gear, neck, 0, 0.07, -0.16, Math.PI / 2); mk(sph(0.032, 1, 1, 0.5), M.visor, neck, -0.045, 0.14, -0.105); mk(sph(0.032, 1, 1, 0.5), M.visor, neck, 0.045, 0.14, -0.105); break;
    case 'skull': hide(); mk(sph(0.105, 0.95, 1.12, 1), X.bone, neck, 0, 0.13, 0); mk(box(0.045, 0.045, 0.02), X.black, neck, -0.04, 0.14, -0.1); mk(box(0.045, 0.045, 0.02), X.black, neck, 0.04, 0.14, -0.1);
      mk(box(0.07, 0.07, 0.07), X.bone, neck, 0, 0.045, -0.07); mk(box(0.012, 0.03, 0.01), X.black, neck, 0, 0.09, -0.1); mk(sph(0.14, 1, 1.05, 1.08), M.cloth, neck, 0, 0.15, 0.03); mk(cyl(0.12, 0.22, 0.16, 12), M.cloth, neck, 0, 0.0, 0.04);
      mk(sph(0.012), X.eye, neck, -0.04, 0.14, -0.105); mk(sph(0.012), X.eye, neck, 0.04, 0.14, -0.105); break;
    case 'astro': mk(sph(0.165, 1, 1.02, 1), X.glass, neck, 0, 0.14, 0); mk(new THREE.TorusGeometry(0.115, 0.022, 8, 18).rotateX(Math.PI / 2), M.gear, neck, 0, 0.0, 0); mk(box(0.05, 0.04, 0.05), M.visor, neck, 0.15, 0.14, 0); break;
    case 'samurai': dome(0.13, M.helmet, 0.16); mk(cyl(0.21, 0.15, 0.05, 16), M.helmet, neck, 0, 0.09, 0.03, -0.25); mk(box(0.008, 0.2, 0.01), X.gold, neck, -0.07, 0.3, -0.1, 0, 0, 0.6); mk(box(0.008, 0.2, 0.01), X.gold, neck, 0.07, 0.3, -0.1, 0, 0, -0.6);
      mk(box(0.14, 0.09, 0.05), X.red, neck, 0, 0.06, -0.09); mk(box(0.18, 0.02, 0.03), X.gold, neck, 0, 0.17, -0.12); mk(box(0.18, 0.04, 0.03), M.visor, neck, 0, 0.13, -0.1); break;
    case 'horns': dome(0.127, M.helmet, 0.15); for (const s of [-1, 1]) { mk(cone(0.032, 0.26, 8), skin.rarity >= 4 ? X.bone : X.gold, neck, s * 0.12, 0.27, 0, 0, 0, -s * 0.55); mk(sph(0.014), X.eye, neck, s * 0.045, 0.14, -0.1); } mk(box(0.15, 0.02, 0.03), M.visor, neck, 0, 0.135, -0.1); break;
    case 'crown': dome(0.126, M.helmet, 0.15); mk(cyl(0.118, 0.118, 0.04, 16), X.gold, neck, 0, 0.255, 0); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; mk(cone(0.015, 0.075, 6), X.gold, neck, Math.cos(a) * 0.115, 0.31, Math.sin(a) * 0.115); }
      mk(box(0.15, 0.04, 0.03), M.visor, neck, 0, 0.13, -0.1); break;
    case 'visor': dome(0.128, M.helmet, 0.15); mk(box(0.17, 0.065, 0.045), M.visor, neck, 0, 0.13, -0.095); mk(box(0.02, 0.1, 0.12), M.helmet, neck, 0, 0.255, 0.0); break;
    case 'ultra': hide(); mk(sph(0.112, 0.98, 1.12, 1.05), X.gold, neck, 0, 0.13, 0); mk(box(0.15, 0.045, 0.03), X.black, neck, 0, 0.14, -0.1); mk(box(0.012, 0.03, 0.01), X.eye, neck, -0.04, 0.14, -0.108); mk(box(0.012, 0.03, 0.01), X.eye, neck, 0.04, 0.14, -0.108);
      mk(box(0.05, 0.09, 0.03), X.gold, neck, 0, 0.07, -0.105, -0.2); mk(cyl(0.118, 0.118, 0.045, 18), X.black, neck, 0, 0.255, 0); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, big = i % 3 === 0; mk(cone(0.016, big ? 0.14 : 0.085, 6), X.gold, neck, Math.cos(a) * 0.118, big ? 0.34 : 0.31, Math.sin(a) * 0.118); }
      mk(sph(0.022), X.eye, neck, 0, 0.29, -0.118); break;
    default: break;
  }

  // ----- back -----
  const wingFan = (s, mat, tall, count, rot0) => { const g = new THREE.Group(); g.position.set(s * 0.07, 0.4, 0.17); chest.add(g);
    for (let i = 0; i < count; i++) { const len = tall - i * (tall * 0.12), p = mk(box(0.035, len, 0.008), mat, g, s * (0.02 + i * 0.045), len * 0.45 + 0.02, 0.02, 0, 0, -s * (rot0 + i * 0.28)); p.castShadow = false; } return g; };
  switch (L.back) {
    case 'cape': { const g = new THREE.Group(); g.position.set(0, 0.5, 0.15); chest.add(g); const c = mk(new THREE.PlaneGeometry(0.46, 0.92, 1, 4), X.cape, g, 0, -0.46, 0.02, 0.1); c.castShadow = false;
      if (skin.rarity >= 4) mk(box(0.48, 0.02, 0.012), X.gold, g, 0, -0.92, 0.04, 0.1); self.anim.push(dt => { g.rotation.x = 0.1 + Math.sin(self.t2 * 2 + 1) * 0.04 + Math.min(0.5, self.s.crouch * 0.1); }); self.cape = g; break; }
    case 'wings': { const gl = wingFan(-1, X.wing, 0.62, 5, 0.35), gr = wingFan(1, X.wing, 0.62, 5, 0.35); self.anim.push(() => { const f = Math.sin(self.ph * 0.0 + (self.flap = (self.flap || 0) + 0.02)) * 0.08; gl.rotation.y = -0.45 + f; gr.rotation.y = 0.45 - f; }); break; }
    case 'ultrawings': { const gl = wingFan(-1, X.wing, 0.82, 7, 0.25), gr = wingFan(1, X.wing, 0.82, 7, 0.25); for (const [g, s] of [[gl, -1], [gr, 1]]) for (let i = 0; i < 7; i++) { const len = 0.82 - i * 0.098; mk(box(0.012, len * 0.9, 0.012), X.glowM, g, s * (0.02 + i * 0.045), len * 0.45 + 0.02, 0.03, 0, 0, -s * (0.25 + i * 0.28)).castShadow = false; }
      const c = new THREE.Group(); c.position.set(0, 0.5, 0.15); chest.add(c); mk(new THREE.PlaneGeometry(0.42, 0.85, 1, 4), X.cape, c, 0, -0.42, 0.01, 0.1).castShadow = false; mk(box(0.44, 0.02, 0.012), X.gold, c, 0, -0.85, 0.03, 0.1);
      self.anim.push(() => { const f = Math.sin((self.flap = (self.flap || 0) + 0.018)) * 0.09; gl.rotation.y = -0.5 + f; gr.rotation.y = 0.5 - f; c.rotation.x = 0.1 + Math.sin(self.t2 * 1.7) * 0.04; }); break; }
    case 'jetpack': for (const s of [-1, 1]) { mk(cyl(0.05, 0.05, 0.32, 10), M.gear, chest, s * 0.09, 0.3, 0.2); mk(cone(0.045, 0.1, 10), X.glowM, chest, s * 0.09, 0.08, 0.2, Math.PI); } mk(box(0.24, 0.1, 0.08), M.gear, chest, 0, 0.32, 0.17); break;
    case 'quiver': mk(cyl(0.04, 0.045, 0.42, 10), M.gear, chest, 0.1, 0.32, 0.19, 0.0, 0, 0.35); for (let i = 0; i < 4; i++) mk(cone(0.012, 0.07, 6), X.gold, chest, 0.17 + i * 0.012, 0.56 + i * 0.01, 0.19, 0, 0, 0.35); break;
    default: break;
  }

  // ----- shoulders -----
  for (const s of [-1, 1]) {
    switch (L.shoulders) {
      case 'pads': mk(sph(0.1, 1, 0.8, 1), M.gear, chest, s * 0.235, 0.52, 0); break;
      case 'spikes': mk(sph(0.1, 1, 0.8, 1), skin.rarity >= 4 ? X.gold : M.gear, chest, s * 0.235, 0.52, 0); for (let i = 0; i < 3; i++) mk(cone(0.022, 0.12 - i * 0.02, 6), skin.rarity >= 4 ? X.gold : X.bone, chest, s * (0.215 + i * 0.03), 0.6 + i * 0.01, (i - 1) * 0.05, 0, 0, -s * (0.1 + i * 0.35)); break;
      case 'epaulets': mk(cyl(0.075, 0.075, 0.018, 12), M.gear, chest, s * 0.235, 0.555, 0); break;
      case 'plates': for (let i = 0; i < 3; i++) mk(box(0.13 - i * 0.01, 0.025, 0.14), skin.id === 'samurai' ? X.red : M.gear, chest, s * (0.25 + i * 0.012), 0.55 - i * 0.045, 0, 0, 0, s * (0.2 + i * 0.12)); break;
      default: break;
    }
  }

  // ----- torso variants -----
  if (L.vest === 'armor') {
    const mat = skin.rarity >= 4 ? X.gold : M.gear; mk(box(0.31, 0.3, 0.075), mat, chest, 0, 0.35, -0.115); mk(box(0.27, 0.07, 0.07), mat, chest, 0, 0.17, -0.11); mk(box(0.25, 0.07, 0.07), mat, chest, 0, 0.1, -0.105);
    mk(new THREE.TorusGeometry(0.1, 0.03, 8, 16).rotateX(Math.PI / 2), mat, chest, 0, 0.52, 0); mk(box(0.3, 0.28, 0.06), mat, chest, 0, 0.35, 0.125);
    if (skin.glow) mk(box(0.04, 0.2, 0.01), X.glowM, chest, 0, 0.36, -0.158);
  }
  if (L.vest === 'robe') { mk(cyl(0.18, 0.27, 0.45, 16), M.cloth, hips, 0, -0.25, 0); mk(box(0.34, 0.05, 0.22), X.red, hips, 0, 0.08, 0); mk(box(0.3, 0.36, 0.04), M.cloth, chest, 0, 0.3, -0.125); }

  // ----- extras -----
  for (const ex of L.extras || []) {
    if (ex === 'halo') { const h = mk(new THREE.TorusGeometry(0.17, 0.012, 8, 28).rotateX(Math.PI / 2), X.glowM, neck, 0, 0.5, 0); h.castShadow = false; self.anim.push(dt => { h.rotation.y += dt * 1.2; h.position.y = 0.5 + Math.sin(self.t2 * 2) * 0.012; }); }
    if (ex === 'greaves') for (const s of [-1, 1]) { const sh = this.limb[s < 0 ? 'shL' : 'shR']; mk(box(0.1, 0.18, 0.04), skin.rarity >= 6 ? X.gold : M.gear, sh, 0, -0.2, -0.07); }
    if (ex === 'veins') for (const k of ['upL', 'upR', 'foL', 'foR', 'thL', 'thR', 'shL', 'shR']) { const g = this.limb[k]; mk(box(0.012, 0.22, 0.012), X.glowM, g, 0, -0.14, -0.062).castShadow = false; }
    if (ex === 'tail') { let parent = hips; for (let i = 0; i < 6; i++) { const seg = new THREE.Group(); seg.position.set(0, i ? 0 : -0.05, i ? 0.2 : 0.12); parent.add(seg); mk(box(0.08 - i * 0.01, 0.07 - i * 0.008, 0.22), skin.rarity >= 4 ? M.gear : M.cloth, seg, 0, 0, 0.1); if (i === 5) mk(cone(0.04, 0.12, 6), X.bone, seg, 0, 0, 0.28, Math.PI / 2); parent = seg; (self.tailSegs = self.tailSegs || []).push(seg); }
      self.anim.push(() => { self.tailSegs.forEach((s, i) => { s.rotation.y = Math.sin(self.t2 * 2 + i * 0.5) * 0.12; s.rotation.x = 0.1 + i * 0.015; }); }); }
    if (ex === 'ghillie') {
      const gg = [], rng = mulberry32(77);
      const tuft = (x, y, z, s) => { const g = new THREE.PlaneGeometry(0.05 * s, 0.22 * s, 1, 1); g.translate(0, -0.1 * s, 0); g.rotateY(rng() * 6.28); g.rotateZ((rng() - 0.5) * 0.9); g.translate(x, y, z); return g; };
      for (let i = 0; i < 70; i++) { const a = rng() * 6.283, y = 0.05 + rng() * 0.55; gg.push(tuft(Math.cos(a) * 0.2 * (0.9 + rng() * 0.3), y, Math.sin(a) * 0.14 * (0.9 + rng() * 0.3), 0.8 + rng() * 0.7)); }
      mk(FX.mergeGeometries(gg.map(g => g.toNonIndexed ? g.toNonIndexed() : g), false), X.leaf, chest); const hg = [];
      for (let i = 0; i < 24; i++) { const a = rng() * 6.283; hg.push(tuft(Math.cos(a) * 0.13, 0.12 + rng() * 0.1, Math.sin(a) * 0.13, 0.7 + rng() * 0.5)); }
      mk(FX.mergeGeometries(hg.map(g => g.toNonIndexed ? g.toNonIndexed() : g), false), X.leaf, neck);
      for (const k of ['upL', 'upR', 'shL', 'shR']) { const g = this.limb[k], t = []; for (let i = 0; i < 12; i++) t.push(tuft((rng() - 0.5) * 0.1, -0.05 - rng() * 0.2, (rng() - 0.5) * 0.1, 0.55)); mk(FX.mergeGeometries(t.map(x => x.toNonIndexed ? x.toNonIndexed() : x), false), X.leaf, g); }
    }
    if (ex === 'crownjewel') { mk(new THREE.OctahedronGeometry(0.03), X.glowM, chest, 0, 0.42, -0.165); }
  }

  // ----- points plate (ULTRA MAX) -----
  if (skin.points) {
    const pts = (typeof Profile !== 'undefined' && Profile.d) ? Profile.d.points : 0, tex = Character.pointsTexture(pts);
    this.plates = [];
    const back = mk(new THREE.PlaneGeometry(0.28, 0.08), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), chest, 0, 0.2, 0.225); back.rotation.y = Math.PI; back.castShadow = false; this.plates.push(back);
    const front = mk(new THREE.PlaneGeometry(0.2, 0.056), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), hips, 0, 0.09, -0.118); front.castShadow = false; this.plates.push(front);
  }

  // ----- equipment accents from the loadout -----
  const lo = opts && opts.loadout;
  if (lo) {
    const acc = (tier, mat) => RARITY[Math.max(0, Math.min(4, tier - 1))].color;
    const strip = (parent, color, w, h, d, x, y, z) => { const m = mk(box(w, h, d), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5 }), parent, x, y, z); m.castShadow = false; };
    if (lo.vest) strip(chest, acc(lo.vest), 0.26, 0.018, 0.012, 0, 0.5, -0.155);
    if (lo.helmet) strip(neck, acc(lo.helmet), 0.012, 0.012, 0.2, 0, 0.275, 0);
    if (lo.boots) for (const s of [-1, 1]) strip(this.limb[s < 0 ? 'shL' : 'shR'], acc(lo.boots), 0.13, 0.014, 0.012, 0, -0.4, -0.07);
    if (lo.gloves) for (const s of [-1, 1]) strip(this.limb[s < 0 ? 'foL' : 'foR'], acc(lo.gloves), 0.1, 0.014, 0.1, 0, -0.26, 0);
    if (lo.pack) strip(chest, acc(lo.pack), 0.2, 0.012, 0.012, 0, 0.55, 0.19);
  }
};
