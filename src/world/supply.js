// Supply drops: a crate on a parachute lands inside the safe zone with guaranteed high-tier loot and a coloured smoke column.
const Supply = {
  list: [],

  reset() { for (const s of this.list) { G.scene.remove(s.group); } this.list.length = 0; },

  drop(x, z) {
    const g = new THREE.Group();
    const metal = Structures.mat('olive'), stripe = new THREE.MeshStandardMaterial({ color: 0xffc400, emissive: 0xffa000, emissiveIntensity: 0.9 });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), metal); crate.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.2, 1.52), stripe); band.position.y = 0.25;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 1.2), stripe); lid.position.y = 0.62;
    crate.add(band, lid); crate.position.y = 0.6; g.add(crate);
    const chute = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.8, side: THREE.DoubleSide }));
    dome.position.y = 4.4; dome.castShadow = true; chute.add(dome);
    const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; pts.push(new THREE.Vector3(Math.cos(a) * 3.1, 4.6, Math.sin(a) * 3.1), new THREE.Vector3(Math.cos(a) * 0.5, 1.3, Math.sin(a) * 0.5)); }
    chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xeeeeee })));
    g.add(chute);
    const gy = terrainHeight(x, z);
    g.position.set(x, gy + 190, z); G.scene.add(g);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 120, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 60; beam.visible = false; g.add(beam);
    const s = { x, z, gy, group: g, chute, beam, landed: false, t: 0, smokeT: 0, looted: false };
    this.list.push(s);
    HUD.banner(I18n.t('banner.supply'), 3.5); HUD.feed(I18n.t('feed.supply'), 0xffc400);
    Sound.whoosh(null);
    return s;
  },

  update(dt) {
    for (const s of this.list) {
      s.t += dt;
      if (!s.landed) {
        s.group.position.y -= 15 * dt;
        s.group.rotation.y += dt * 0.15;
        if (s.group.position.y <= s.gy) { s.group.position.y = s.gy; s.landed = true; s.group.remove(s.chute); s.beam.visible = true; s.group.rotation.y = 0; this.spawnLoot(s); Sound.land(true); FX.shake(0.15, 0.3); }
      } else {
        s.smokeT -= dt;
        if (s.smokeT <= 0) {
          s.smokeT = 0.12;
          FX.smoke.spawn(s.x + (Math.random() - 0.5) * 0.6, s.gy + 1.4, s.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4 + 0.3, 5 + Math.random() * 2, (Math.random() - 0.5) * 0.4, 8, 0.7, 2.6, 1, 0.75, 0.1, 0.55, 0);
        }
        s.beam.visible = Math.hypot(s.x - G.camera.position.x, s.z - G.camera.position.z) > 3;
      }
    }
  },

  spawnLoot(s) {
    const place = (item, i) => { const a = i / 7 * 6.28, r = 1.6 + Math.random() * 0.7; Loot.spawn(s.x + Math.cos(a) * r, s.gy, s.z + Math.sin(a) * r, item); };
    let i = 0;
    for (let k = 0; k < 2; k++) { let it = Loot.roll(5); let tries = 0; while ((it.kind !== 'weapon' || it.w.rarity < 3) && tries++ < 40) it = Loot.roll(5); if (it.kind !== 'weapon') it = { kind: 'weapon', w: Weapons.make('ar', 3) }; place(it, i++); }
    place({ kind: 'ammo', type: 'medium', amount: 90 }, i++); place({ kind: 'ammo', type: 'light', amount: 90 }, i++);
    place({ kind: 'shield', size: 'big' }, i++); place({ kind: 'heal', size: 'big' }, i++);
    place({ kind: 'throw', type: 'frag', n: 3 }, i++);
  },

  // zone phases call this when they announce the next circle
  dropForZone() {
    const t = Zone.to; if (!t) return;
    const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * t.r * 0.55;
    const x = clamp(t.x + Math.cos(a) * d, -MAP.half + 20, MAP.half - 20), z = clamp(t.z + Math.sin(a) * d, -MAP.half + 20, MAP.half - 20);
    if (waterDepth(x, z) > 0.1) return;
    this.drop(x, z);
  },

  active() { return this.list.filter(s => s.landed && Loot.items.some(r => Math.hypot(r.x - s.x, r.z - s.z) < 4)); }
};
