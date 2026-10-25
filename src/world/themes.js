// Map themes for the battle royale (classic / winter / night) and the removable flat arenas used by duels and training.
const Themes = {
  lamp: null, current: 'classic',

  mainVisible(v) { for (const o of World.main || []) o.visible = v; if (Terrain.buoys) Terrain.buoys.mesh.visible = v; },

  apply(id) {
    id = id || 'classic';
    Arena.leave();
    const night = id === 'night', winter = id === 'winter';
    SkySys.apply(night ? 'night' : winter ? 'overcast' : Settings.get('tod'));
    Terrain.setWinter(winter ? 1 : 0); Nature.setWinter(winter ? 1 : 0);
    this.setLamp(night);
    this.current = G.theme = id;
  },

  // headlamp so the night map stays playable
  setLamp(on) {
    if (!this.lamp) {
      const l = new THREE.SpotLight(0xe8f0ff, 0, 90, 0.55, 0.7, 1.5);
      l.position.set(0.1, -0.15, 0); l.target.position.set(0, -0.2, -10); G.camera.add(l); G.camera.add(l.target); this.lamp = l;
    }
    this.lamp.intensity = on ? 520 : 0;
  }
};

// A flat, self-contained arena: hides the open world, swaps the collision grid and builds the arena with the structure kit.
const Arena = {
  group: null, saved: null, kind: null, spawns: [], bounds: null,

  enter(kind) {
    this.leave();
    Themes.mainVisible(false);
    Flat.on = true; Flat.y = 0; Flat.surf = kind === 'neon' ? 'metal' : kind === 'ruins' || kind === 'training' ? 'grass' : 'sand';
    this.saved = { cols: G.colliders, grid: Grid.map, spots: World.lootSpots, excl: Excl.length, mats: Structures.mats };
    G.colliders = []; Grid.map = new Map(); World.lootSpots = [];
    const group = new THREE.Group(); G.scene.add(group); this.group = group; this.kind = kind;
    Structures.begin(group);
    const b = ARENAS[kind](); this.spawns = b.spawns; this.bounds = b.bounds;
    Structures.flush();
    if (Zone.wall) Zone.wall.visible = false;
    G.arena = kind;
  },

  leave() {
    if (!this.group) return;
    G.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const k in Structures.mats) Structures.mats[k].dispose();
    G.colliders = this.saved.cols; Grid.map = this.saved.grid; World.lootSpots = this.saved.spots; Structures.mats = this.saved.mats; Excl.length = this.saved.excl;
    this.group = null; this.saved = null; G.arena = null;
    Flat.on = false; Themes.mainVisible(true);
    if (Zone.wall) Zone.wall.visible = true;
  }
};

// Arena builders return { spawns: [[x, z, yaw], ...], bounds: half extent }. Yaw 0 faces -z, PI/2 faces -x, -PI/2 faces +x.
const ARENAS = {
  // sandy stone colosseum with pillars, low walls and a raised central platform
  colosseum() {
    const S = Structures, hx = 36, hz = 24, H = 7;
    S.cyl(0, 0, 90, 0.5, 'arenaSand', { y: -0.5, seg: 40, noCollide: true });
    for (const s of [-1, 1]) {
      S.wall(0, s * hz, hx * 2 + 2, 'x', H, 2, 'sandstone', [{ c: -22, w: 4, y0: 0, y1: 3.2 }, { c: 22, w: 4, y0: 0, y1: 3.2 }, { c: 0, w: 4, y0: 3.4, y1: 5 }], 0);
      S.wall(s * hx, 0, hz * 2, 'z', H, 2, 'sandstone', [{ c: 0, w: 5, y0: 3.4, y1: 5.4 }], 0);
      for (const [px, pz] of [[s * hx, -hz], [s * hx, hz]]) S.cyl(px, pz, 2.3, H + 2.5, 'marble', { y: 0, seg: 16 });
      // stands behind the walls
      for (let t = 0; t < 5; t++) {
        S.box(0, s * (hz + 4 + t * 2.6), hx * 2 + 4 + t * 2, 2.6, H + 1 + t * 1.6, 'concreteWarm', { y: 0, noCollide: true });
        S.box(s * (hx + 4 + t * 2.6), 0, 2.6, hz * 2 + 4 + t * 2, H + 1 + t * 1.6, 'concreteWarm', { y: 0, noCollide: true });
      }
    }
    // cover: pillars, low walls, central dais with stairs
    for (const [px, pz] of [[-14, -9], [14, 9], [-14, 9], [14, -9], [0, -15], [0, 15]]) S.cyl(px, pz, 1.1, 5.5, 'marble', { y: 0, seg: 14 });
    S.box(0, 0, 11, 7, 1.3, 'sandstone', { y: 0, walkable: true });
    S.stairs(0, 5.75, 'z', -1, 3, 4, 0.9, 'sandstone', 0, 0.43); S.stairs(0, -5.75, 'z', 1, 3, 4, 0.9, 'sandstone', 0, 0.43);
    for (const [px, pz, w, d] of [[-8, 0, 1, 7], [8, 0, 1, 7], [-22, -6, 6, 1], [22, 6, 6, 1], [-22, 8, 6, 1], [22, -8, 6, 1]]) S.box(px, pz, w, d, 1.15, 'concreteWarm', { y: 0 });
    for (const sx of [-1, 1]) { S.sandbags(sx * 29, -4, 5, false, 1.0); S.sandbags(sx * 29, 4, 5, false, 1.0); S.crateStack(sx * 26, -1, 3); }
    // banners
    for (const sx of [-1, 1]) for (const bz of [-12, 12]) S.box(sx * (hx - 1.2), bz, 0.15, 2.6, 5, 'woodRed', { y: 1.6, noCollide: true });
    return { spawns: [[-31, 0, -Math.PI / 2], [31, 0, Math.PI / 2]], bounds: { x: hx - 1.6, z: hz - 1.6 } };
  },

  // overgrown temple ruins at sunset
  ruins() {
    const S = Structures, h = 30;
    S.cyl(0, 0, 110, 0.5, 'turf', { y: -0.5, seg: 40, noCollide: true });
    for (const s of [-1, 1]) {
      S.ruinWall(0, s * h, h * 2, 'x', 5.5, 'mossStone', 0); S.ruinWall(s * h, 0, h * 2, 'z', 5.5, 'mossStone', 0);
      S.wall(0, s * (h + 1), h * 2 + 4, 'x', 8, 1.2, 'mossStone', [], 0); S.wall(s * (h + 1), 0, h * 2 + 4, 'z', 8, 1.2, 'mossStone', [], 0);
    }
    // central temple: stepped platform, ring of columns, altar
    S.box(0, 0, 18, 18, 0.6, 'marble', { y: 0, walkable: true }); S.box(0, 0, 14, 14, 1.2, 'marble', { y: 0, walkable: true }); S.box(0, 0, 10, 10, 1.8, 'marble', { y: 0, walkable: true });
    S.stairs(0, 9.6, 'z', -1, 1, 6, 1.2, 'marble', 0, 0.6); S.stairs(0, -9.6, 'z', 1, 1, 6, 1.2, 'marble', 0, 0.6);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.39, px = Math.cos(a) * 7, pz = Math.sin(a) * 7; S.cyl(px, pz, 0.7, i % 3 === 0 ? 3.2 : 6.5, 'marble', { y: 1.2, seg: 12 }); }
    S.box(0, 0, 3, 1.4, 1.1, 'mossStone', { y: 1.8, walkable: true });
    // scattered columns, broken walls, tree stumps
    for (const [px, pz, hh] of [[-20, -14, 6], [20, 14, 5], [-20, 14, 3.5], [20, -14, 6.5], [-12, 22, 5], [12, -22, 4.5], [-26, 0, 6], [26, 0, 4]]) S.cyl(px, pz, 0.8, hh, 'marble', { y: 0, seg: 12 });
    for (const [px, pz, w, d] of [[-14, -4, 7, 1], [14, 4, 7, 1], [-8, 15, 1, 7], [8, -15, 1, 7], [-22, 8, 5, 1], [22, -8, 5, 1]]) S.box(px, pz, w, d, 1.9, 'mossStone', { y: 0 });
    for (const [px, pz] of [[-17, 4], [17, -4], [4, 18], [-4, -18]]) S.cyl(px, pz, 0.7, 1.0, 'woodDark', { y: 0, seg: 8 });
    for (const sx of [-1, 1]) { S.sandbags(sx * 25, -8, 5, false, 1.0); S.sandbags(sx * 25, 8, 5, false, 1.0); }
    // torch posts
    for (const [px, pz] of [[-9, -9], [9, 9], [-9, 9], [9, -9]]) {
      S.cyl(px, pz, 0.12, 2.6, 'woodDark', { y: 1.2, seg: 6, noCollide: true }); S.box(px, pz, 0.35, 0.35, 0.3, 'torch', { y: 3.8, noCollide: true });
      const l = new THREE.PointLight(0xff8a3a, 90, 26, 2); l.position.set(px, 4.4, pz); S.scene.add(l);
    }
    return { spawns: [[-26, -2, -Math.PI / 2], [26, 2, Math.PI / 2]], bounds: { x: h - 1.5, z: h - 1.5 } };
  },

  // neon sci-fi arena at night: dark tiles, glowing strips, containers and a central tower
  neon() {
    const S = Structures, h = 27;
    S.cyl(0, 0, 100, 0.5, 'tileDark', { y: -0.5, seg: 40, noCollide: true });
    for (const [px, pz, col] of [[-20, -20, 0x00e5ff], [20, 20, 0xff2fb4], [-20, 20, 0xff2fb4], [20, -20, 0x00e5ff], [0, 0, 0x9dff2f]]) { const l = new THREE.PointLight(col, 260, 34, 2); l.position.set(px, 6.5, pz); S.scene.add(l); }
    for (const s of [-1, 1]) {
      S.wall(0, s * h, h * 2 + 2, 'x', 9, 1.4, 'steel', [], 0); S.wall(s * h, 0, h * 2, 'z', 9, 1.4, 'steel', [], 0);
      S.box(0, s * (h - 0.8), h * 2, 0.15, 0.25, 'neonCyan', { y: 2.2, noCollide: true }); S.box(s * (h - 0.8), 0, 0.15, h * 2, 0.25, 'neonPink', { y: 2.2, noCollide: true });
      S.box(0, s * (h - 0.8), h * 2, 0.15, 0.25, 'neonPink', { y: 6.5, noCollide: true }); S.box(s * (h - 0.8), 0, 0.15, h * 2, 0.25, 'neonCyan', { y: 6.5, noCollide: true });
    }
    // floor lines
    S.box(0, 0, 0.35, h * 2 - 4, 0.03, 'neonCyan', { y: 0.01, noCollide: true }); S.box(0, 0, h * 2 - 4, 0.35, 0.03, 'neonPink', { y: 0.01, noCollide: true });
    // central tower with stairs
    S.box(0, 0, 8, 8, 4.2, 'tileDark', { y: 0, walkable: true }); S.box(0, 0, 8.4, 8.4, 0.2, 'neonCyan', { y: 4.2, noCollide: true });
    S.stairs(0, 8.55, 'z', -1, 7, 3, 0.7, 'steel', 0, 0.6); S.stairs(0, -8.55, 'z', 1, 7, 3, 0.7, 'steel', 0, 0.6);
    // container maze and barriers
    S.container(-12, -8, 'metalBlue', true); S.container(12, 8, 'metalOrange', true); S.container(-12, 9, 'metalGreen', false); S.container(12, -9, 'metalRed', false);
    S.container(-12, -8, 'metalBlue', true, 1); S.container(12, 8, 'metalYellow', true, 1);
    for (const [px, pz] of [[-20, 0], [20, 0], [0, -18], [0, 18], [-6, -14], [6, 14]]) { S.box(px, pz, px === 0 ? 5 : 1.2, px === 0 ? 1.2 : 5, 1.3, 'tileDark', { y: 0 }); S.box(px, pz, px === 0 ? 5 : 0.3, px === 0 ? 0.3 : 5, 0.1, 'neonLime', { y: 1.3, noCollide: true }); }
    for (const sx of [-1, 1]) for (const bz of [-15, 15]) { S.cyl(sx * 22, bz, 0.6, 7, 'steel', { y: 0, seg: 10 }); S.cyl(sx * 22, bz, 0.7, 0.4, 'neonCyan', { y: 7, seg: 10, noCollide: true }); }
    return { spawns: [[-23, 0, -Math.PI / 2], [23, 0, Math.PI / 2]], bounds: { x: h - 1.8, z: h - 1.8 } };
  },

  // tutorial training ground: shooting lane, cover, stairs, supplies
  training() {
    const S = Structures, hx = 42, hz = 30;
    S.cyl(0, 0, 130, 0.5, 'turf', { y: -0.5, seg: 40, noCollide: true });
    for (const s of [-1, 1]) { S.wall(0, s * hz, hx * 2 + 2, 'x', 5, 1.2, 'concreteWarm', [], 0); S.wall(s * hx, 0, hz * 2, 'z', 5, 1.2, 'concreteWarm', [], 0); }
    // shooting lane markers
    for (let i = 1; i <= 4; i++) S.box(8 + i * 8, -22, 0.4, 0.4, 1.4, 'woodRed', { y: 0, noCollide: true });
    S.box(26, -22, 52, 0.15, 0.05, 'concrete', { y: 0, noCollide: true });
    // cover for the training bot fight
    S.sandbags(24, 6, 6, true, 1.0); S.sandbags(30, 14, 6, false, 1.0); S.crateStack(34, 4, 5); S.container(18, 18, 'olive', true); S.barrier(14, 4, true); S.barrier(14, 8, true);
    // parkour: stairs up to a platform
    S.box(-26, 12, 8, 6, 2.4, 'concrete', { y: 0, walkable: true }); S.stairs(-26, 18.15, 'z', -1, 4, 3, 0.9, 'concreteDark', 0, 0.6);
    S.box(-14, 14, 1.2, 1.2, 0.8, 'wood', { y: 0, walkable: true }); S.box(-17.5, 15, 1.2, 1.2, 1.6, 'wood', { y: 0, walkable: true });
    S.crateStack(-30, -10, 5); S.sandbags(-18, -12, 8, true, 1.2); S.tower(-34, -22);
    // low crawl wall + wading hint
    S.box(-6, 8, 6, 0.8, 1.0, 'wood', { y: 0 });
    return { spawns: [[-30, 0, -Math.PI / 2]], bounds: { x: hx - 1.6, z: hz - 1.6 } };
  }
};
