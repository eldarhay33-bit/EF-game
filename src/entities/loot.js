// Floor loot: weapons (all rarities), ammo, healing, shields and grenades, plus the shared pick-up logic.
const AMMO_COLORS = { light: 0xd9c34a, medium: 0xc97a3a, shells: 0xc0453a, heavy: 0x4a8fd9, rocket: 0x59613f };

const Loot = {
  items: [], mats: {}, idN: 0, idPrefix: '', silent: false,

  roll(tier = 1) {
    const r = Math.random();
    if (r < 0.34 + tier * 0.03) return { kind: 'weapon', w: Weapons.roll(tier) };
    if (r < 0.58) {
      const bag = ['light', 'light', 'light', 'medium', 'medium', 'medium', 'medium', 'shells', 'shells', 'heavy', 'rocket'];
      const t = pick(bag);
      return { kind: 'ammo', type: t, amount: AMMO[t].give };
    }
    if (r < 0.7) return Math.random() < 0.25 + tier * 0.1 ? { kind: 'heal', size: 'big' } : { kind: 'heal', size: 'small' };
    if (r < 0.82) return Math.random() < 0.25 + tier * 0.1 ? { kind: 'shield', size: 'big' } : { kind: 'shield', size: 'small' };
    const t = pick(['frag', 'frag', 'smoke', 'flash', 'sticky']);
    return { kind: 'throw', type: t, n: t === 'frag' ? 2 : 1 };
  },

  label(item) {
    switch (item.kind) {
      case 'weapon': return Weapons.label(item.w) + (SIGHTS[item.w.sight] && item.w.sight !== 'iron' ? ' · ' + SIGHTS[item.w.sight].name : '');
      case 'ammo': return `${AMMO[item.type].name} x${item.amount}`;
      case 'throw': return `${THROWABLES[item.type].name} x${item.n}`;
      default: return I18n.t('item.' + item.kind + '.' + item.size);
    }
  },

  color(item) {
    switch (item.kind) {
      case 'weapon': return RARITY[item.w.rarity].color;
      case 'ammo': return AMMO_COLORS[item.type];
      case 'heal': return 0xff5a5a;
      case 'shield': return 0x4ab0ff;
      default: return 0x9fd05a;
    }
  },

  m(key, o) { return this.mats[key] || (this.mats[key] = new THREE.MeshStandardMaterial(o)); },

  body(item) {
    switch (item.kind) {
      case 'weapon': { const g = GM.build(item.w.id, item.w.rarity, item.w.sight); g.scale.setScalar(1.35); g.rotation.y = Math.PI / 2; return g; }
      case 'ammo': {
        const g = new THREE.Group(), box = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.2), this.m('ammoBox', { color: 0x4a4f3a, roughness: 0.6, metalness: 0.4 }));
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.04, 0.21), new THREE.MeshStandardMaterial({ color: AMMO_COLORS[item.type], emissive: AMMO_COLORS[item.type], emissiveIntensity: 0.6 }));
        stripe.position.y = 0.04; g.add(box, stripe); return g;
      }
      case 'heal': {
        const g = new THREE.Group(), b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.26), this.m('med', { color: 0xf0f0f0, roughness: 0.5 }));
        const cm = this.m('cross', { color: 0xd22, emissive: 0xaa1111, emissiveIntensity: 0.8 });
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.06), cm), c2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.2), cm);
        c1.position.y = c2.position.y = 0.115; g.add(b, c1, c2); if (item.size === 'small') g.scale.setScalar(0.7); return g;
      }
      case 'shield': {
        const m = this.m('shieldBottle', { color: 0x3aa0ff, emissive: 0x2a80ff, emissiveIntensity: 1.2, roughness: 0.1, transparent: true, opacity: 0.85 });
        const g = new THREE.Group(), b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.26, 12), m), n = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 10), m);
        n.position.y = 0.18; g.add(b, n); if (item.size === 'small') g.scale.setScalar(0.75); return g;
      }
      default: { const g = GM.grenade(item.type); g.scale.setScalar(2.2); return g; }
    }
  },

  spawn(x, y, z, item) {
    const g = new THREE.Group(), col = this.color(item), body = this.body(item);
    body.position.y = 0.65;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.2, 8, 1, true),
      this.m('beam' + col, { color: col, emissive: col, emissiveIntensity: 1.2, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    beam.position.y = 1.6;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 20).rotateX(-Math.PI / 2), this.m('ring' + col, { color: col, emissive: col, emissiveIntensity: 1.6, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = 0.04;
    g.add(body, beam, ring); g.position.set(x, y, z);
    if (item.kind === 'weapon' && item.w.rarity === 0) beam.visible = false;
    G.scene.add(g);
    const rec = { item, mesh: g, body, beam, phase: Math.random() * 6, x, y, z };
    this.items.push(rec);
    if (Net.active && Net.coop && !this.silent) { rec.id = this.idPrefix + (++this.idN); Net.lootSpawned(rec); }
    return rec;
  },

  clear() { for (const r of this.items) G.scene.remove(r.mesh); this.items.length = 0; this.idN = 0; },

  populate() {
    this.clear();
    for (const s of World.lootSpots) {
      const n = s.tier + 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random(), r = 0.9 + Math.random() * 1.5, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
        this.spawn(x, Math.max(s.y, terrainHeight(x, z)) , z, this.roll(s.tier));
      }
    }
    for (let i = 0; i < 40; i++) {
      const p = randomGroundPoint((x, z) => !inExcl(x, z, 0) || Math.random() < 0.3);
      this.spawn(p.x, terrainHeight(p.x, p.z), p.z, this.roll(0));
    }
    if (Weapons.trial()) {
      const s = World.lootSpots[0] || { x: 0, z: 0, y: 2 };
      this.spawn(s.x + 1.2, s.y, s.z + 1.2, { kind: 'weapon', w: Weapons.make('special', 5) });
    }
  },

  update(dt) {
    const c = G.camera.position;
    for (const r of this.items) {
      const dx = r.x - c.x, dz = r.z - c.z, d2 = dx * dx + dz * dz;
      r.mesh.visible = d2 < 160 * 160;
      if (!r.mesh.visible) continue;
      r.phase += dt * 2;
      r.body.rotation.y += dt * 1.4;
      r.body.position.y = 0.65 + Math.sin(r.phase) * 0.07;
      r.beam.visible = d2 > 1.4 * 1.4 && !(r.item.kind === 'weapon' && r.item.w.rarity === 0);
    }
  },

  nearest(pos, maxD, maxDy = 3) {
    let best = null, bd = maxD;
    for (const r of this.items) {
      const d = Math.hypot(r.x - pos.x, r.z - pos.z);
      if (d < bd && Math.abs(r.y - pos.y) < maxDy) { bd = d; best = r; }
    }
    return best;
  },

  remove(rec) {
    Net.lootRemoved(rec);
    G.scene.remove(rec.mesh);
    const i = this.items.indexOf(rec); if (i >= 0) this.items.splice(i, 1);
  },

  weaponScore(w) {
    const base = { pistol: 20, revolver: 32, smg: 48, ar: 60, ak: 62, dmr: 58, shotgun: 50, autoshotgun: 54, minigun: 78, sniper: 56, rpg: 30, special: 200 }[w.id] || 20;
    return base + w.rarity * 9;
  }
};
