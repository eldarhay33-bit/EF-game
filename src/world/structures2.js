// Points of interest, part 1: central fortress arena, village, farm.
Object.assign(Structures, {
  canPlace(x, z, w, d, margin = 2) {
    const hs = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const px = x + i * (w / 2 + margin), pz = z + j * (d / 2 + margin);
      if (Math.abs(px) > MAP.half - 14 || Math.abs(pz) > MAP.half - 14) return false;
      if (terrainHeight(px, pz) < WATER_Y + 0.5 || distToRoad(px, pz) < 2.8 + (i === 0 && j === 0 ? 3 : 0)) return false;
      hs.push(terrainHeight(px, pz));
    }
    if (Math.max(...hs) - Math.min(...hs) > 1.6) return false;
    return !inExcl(x, z, Math.max(w, d) / 2 + 1);
  },

  ruinWall(cx, cz, len, axis, H, key, gapW) {
    const seg = 4, t = 1;
    for (let p = 0; p < len; p += seg) {
      const mid = p + seg / 2 - len / 2;
      if (gapW && Math.abs(mid) < gapW / 2 + seg / 2 - 0.1) continue;
      let h = H; const r = rand();
      if (r < 0.1) continue; if (r < 0.35) h = H * rr(0.35, 0.7);
      if (axis === 'x') this.box(cx + mid, cz, seg, t, h, key); else this.box(cx, cz + mid, t, seg, h, key);
    }
  },

  arena() {
    const cx = ARENA.x, cz = ARENA.z, hx = 34, hz = 34, wallK = 'concreteWarm';
    addExcl(cx, cz, 56);
    this.ruinWall(cx, cz - hz, hx * 2, 'x', 3.2, wallK, 9);
    this.ruinWall(cx, cz + hz, hx * 2, 'x', 3.2, wallK, 9);
    this.ruinWall(cx - hx, cz, hz * 2, 'z', 3.2, wallK, 9);
    this.ruinWall(cx + hx, cz, hz * 2, 'z', 3.2, wallK, 9);
    this.tower(cx - 26, cz - 26);
    this.tower(cx + 17, cz + 22);

    // central command bunker: two doors, firing slits, walkable roof reached by an outside stair
    const bw = 16, bd = 11, H = 3.2, t = 0.7, base = terrainHeight(cx, cz), fl = base + 0.2;
    this.box(cx, cz, bw + 1, bd + 1, 0.2, 'concreteDark', { walkable: true });
    const slits = [-5, 0, 5].map(c => ({ c, w: 1.6, y0: 1.5, y1: 2.1 }));
    this.wall(cx, cz - bd / 2 + t / 2, bw, 'x', H, t, 'concrete', [{ c: -2.5, w: 2.6, y0: 0, y1: 2.4 }, ...slits.filter(s => Math.abs(s.c + 2.5) > 2.6)], fl);
    this.wall(cx, cz + bd / 2 - t / 2, bw, 'x', H, t, 'concrete', [{ c: 2.5, w: 2.6, y0: 0, y1: 2.4 }, ...slits.filter(s => Math.abs(s.c - 2.5) > 2.6)], fl);
    this.wall(cx - bw / 2 + t / 2, cz, bd - 2 * t, 'z', H, t, 'concrete', [{ c: 0, w: 1.6, y0: 1.5, y1: 2.1 }], fl);
    this.wall(cx + bw / 2 - t / 2, cz, bd - 2 * t, 'z', H, t, 'concrete', [], fl);
    this.box(cx, cz, bw + 1, bd + 1, 0.4, 'concreteDark', { y: fl + H, walkable: true });
    this.box(cx, cz - 1.2, 0.5, 5, 1.6, 'concrete', { y: fl });
    this.stairs(cx + bw / 2 + 5.4, cz, 'x', -1, 6, 2.4, 1, 'concreteDark', base, 0.6);
    this.sandbags(cx - 6, cz - 5.2, 5, true, 0.9);
    this.crateStack(cx + 4.5, cz - 3.5, 4);
    this.box(cx - 5.5, cz + 3.5, 2.2, 0.9, 0.85, 'wood', { y: fl, walkable: true });
    // flag pole on the roof
    this.cyl(cx + 6, cz + 3, 0.07, 6, 'steel', { y: fl + H + 0.4, seg: 6, noCollide: true });
    this.box(cx + 6.8, cz + 3, 1.4, 0.04, 0.9, 'metalRed', { y: fl + H + 4.9, noCollide: true });
    this.spot(cx - 2, cz + 2, 3, fl); this.spot(cx + 4.5, cz - 1, 3, fl); this.spot(cx - 4, cz, 3, fl + H + 0.4);

    // trenches of sandbags facing the centre
    for (const s of [-1, 1]) {
      this.sandbags(cx + s * 21, cz - 12, 12, true); this.sandbags(cx + s * 21, cz - 17, 12, true);
      this.sandbags(cx + s * 14, cz + 28, 10, true, 1.0);
      this.sandbags(cx + s * 27, cz + 8, 8, false, 1.0);
      this.crateStack(cx + s * 28, cz - 5, 5);
      this.spot(cx + s * 21, cz - 14.5, 2);
    }
    this.tank(cx - 18, cz + 17, 'olive'); this.tank(cx + 24, cz - 22, 'olive'); this.tank(cx + 5, cz - 25, 'olive');
    this.car(cx - 25, cz + 6, 'olive', 0.4); this.car(cx + 25, cz + 26, 'metalGreen', -0.3);
    this.container(cx - 25, cz - 8, 'metalGreen', true); this.container(cx - 25, cz - 8, 'metalGreen', true, 1);
    this.container(cx + 27, cz + 10, 'metalOrange', false);
    this.spot(cx - 18, cz + 21, 2); this.spot(cx + 24, cz - 18, 2); this.spot(cx - 25, cz - 12, 2); this.spot(cx + 27, cz + 15, 2);
    [[-12, -9, true], [11, -10, false], [-17, 12, true], [20, 15, false], [-9, 26, true], [10, 20, true], [-28, 24, false], [29, 30, true], [0, -17, true], [-30, 0, false]]
      .forEach(([dx, dz, ax]) => this.barrier(cx + dx, cz + dz, ax));
    [[-4, 14], [6, 12], [-15, -18], [16, -6], [-8, -14], [30, -12]].forEach(([dx, dz]) => this.hedgehog(cx + dx, cz + dz));
    [[-30, -14], [28, -32], [-12, 30], [14, -30]].forEach(([dx, dz]) => this.barrel(cx + dx, cz + dz, 'metalRed'));
  },

  village() {
    const cx = 40, cz = 150;
    addExcl(cx, cz, 4);
    const doors = { '1': '-x', '-1': '+x' }, kinds = ['plasterA', 'plasterB', 'plasterC', 'plasterD'], roofs = ['roofRed', 'roofBrown', 'roofGray'];
    let placed = 0;
    for (let z = 128; z <= 190 && placed < 9; z += 15) for (const s of [-1, 1]) {
      const w = rr(7.5, 10), d = rr(6.5, 9), x = cx + s * (13 + w / 2 + rr(0, 2)), zz = z + rr(-2, 2);
      if (!this.canPlace(x, zz, w, d, 1.5)) continue;
      this.house(x, zz, w, d, { door: doors[s], wall: kinds[Math.floor(rand() * 4)], roof: roofs[Math.floor(rand() * 3)], tier: rand() < 0.35 ? 2 : 1 });
      this.fence(x - w / 2 - 1, zz + d / 2 + 4, x + w / 2 + 1, zz + d / 2 + 4, 'woodDark', 1.1);
      if (rand() < 0.6) this.crateStack(x + s * (w / 2 + 2.5), zz - d / 2 - 1.5, 2 + Math.floor(rand() * 3));
      placed++;
    }
    // town hall
    for (const [x, z] of [[62, 120], [60, 112], [64, 128]]) if (this.canPlace(x, z, 13, 10, 1.5)) { this.house(x, z, 13, 10, { door: '-x', wall: 'plasterB', roof: 'roofGray', tier: 3 }); this.tower2(x + 9, z); break; }
    // gas station
    for (const [x, z] of [[50, 92], [52, 82], [48, 100]]) if (this.canPlace(x, z, 16, 12, 1.5)) { this.gasStation(x, z); break; }
    // water tower
    for (const [x, z] of [[66, 160], [64, 172], [70, 150]]) if (this.canPlace(x, z, 8, 8, 1)) { this.waterTower(x, z); break; }
    for (let z = 120; z < 190; z += 22) { this.pole(cx - 3.5, z, 8); }
    this.car(cx + 6, 168, 'metalYellow', 0.1); this.car(cx - 6, 133, 'metalRed', 1.6);
    this.crateStack(cx + 5, 128, 3); this.barrel(cx - 5, 160, 'metalBlue'); this.barrel(cx - 4.2, 160.6, 'metalRed');
  },

  tower2(x, z) { this.box(x, z, 3.2, 3.2, 8, 'plasterB'); this.gable(x, z, 3.2, 3.2, terrainHeight(x, z) + 8, 2.6, 'roofGray', false); },

  gasStation(cx, cz) {
    const base = terrainHeight(cx, cz);
    addExcl(cx, cz, 14);
    this.house(cx - 4, cz - 1.5, 7, 6, { door: '+z', wall: 'concreteWarm', roof: 'roofGray', tier: 2 });
    for (const [ox, oz] of [[-3, 3], [3, 3], [-3, 8], [3, 8]]) this.box(cx + 6 + ox, cz + oz - 1, 0.5, 0.5, 4.4, 'metalRed');
    this.box(cx + 6, cz + 4.5, 8.5, 8.5, 0.4, 'metalRed', { y: base + 4.4 });
    this.box(cx + 6, cz + 4.5, 7.5, 7.5, 0.25, 'steel', { y: base + 4.0, noCollide: true });
    for (const ox of [-1.8, 1.8]) this.box(cx + 6 + ox, cz + 4.5, 0.6, 1.1, 1.5, 'metalYellow');
    this.car(cx + 16, cz + 6, 'metalBlue', 1.3);
    this.spot(cx + 6, cz + 3, 2, base); this.spot(cx - 4, cz - 1, 2, base + 0.25);
    World.bikeSpots.push({ x: cx + 8, z: cz + 10, tier: 1 });
  },

  waterTower(cx, cz) {
    const base = terrainHeight(cx, cz), legs = 9;
    for (const [ox, oz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) this.box(cx + ox, cz + oz, 0.5, 0.5, legs, 'steel');
    this.box(cx, cz, 5.2, 5.2, 0.4, 'steel', { y: base + legs, walkable: true });
    this.cyl(cx, cz, 2.6, 4.2, 'metalBlue', { y: base + legs + 0.4, seg: 20, noCollide: true });
    this.cyl(cx, cz, 2.6, 4.2, 'metalBlue', { y: base + legs + 0.4, seg: 20, rt: 2.6 });
    this.cyl(cx, cz, 0.1, 2.4, 'steel', { y: base + legs + 4.6, rt: 0.1, noCollide: true });
    this.stairs(cx + 3.2 + 7, cz, 'x', -1, 14, 1.6, 1, 'steel', base, 0.64);
    this.spot(cx, cz, 3, base + legs + 0.4);
    addExcl(cx + 5, cz, 12);
  },

  farm() {
    const fx = -165, fz = 8;
    addExcl(fx, fz, 4);
    const t = (x, z, w, d) => this.canPlace(x, z, w, d, 1);
    const barn = [[-160, -16], [-158, -20], [-150, -18]].find(([x, z]) => t(x, z, 14, 9));
    if (barn) {
      const [x, z] = barn, base = terrainHeight(x, z);
      this.house(x, z, 14, 9, { door: '+z', wall: 'woodRed', roof: 'roofGray', tier: 3 });
      this.box(x + 2, z + 4.3, 3.2, 0.3, 2.6, 'woodRed', { y: base + 0.25, noCollide: true });
      this.hayBales(x + 11, z, 5);
      this.tractor(x - 10, z + 6);
    }
    const hse = [[-158, 28], [-150, 30], [-170, 30]].find(([x, z]) => t(x, z, 9, 7));
    if (hse) this.house(hse[0], hse[1], 9, 7, { door: '-z', wall: 'plasterA', roof: 'roofRed', tier: 2 });
    const silo = [[-186, -4], [-184, 4], [-186, 14]].find(([x, z]) => t(x, z, 7, 7));
    if (silo) {
      const [x, z] = silo, base = terrainHeight(x, z);
      this.cyl(x, z, 3.2, 11, 'metal', { seg: 20 }); this.sphere(x, base + 10.9, z, 3.2, 'metal', 0.8);
      this.cyl(x + 7, z + 1, 2.6, 9, 'metal', { seg: 18 }); this.sphere(x + 7, base + 8.9, z + 1, 2.6, 'metal', 0.8);
      this.spot(x + 3, z + 5, 2);
    }
    // fenced paddock
    const px = -146, pz = 18;
    this.fence(px, pz, px + 24, pz); this.fence(px + 24, pz, px + 24, pz + 18); this.fence(px + 24, pz + 18, px, pz + 18); this.fence(px, pz + 18, px, pz + 8);
    this.hayBales(px + 6, pz + 6, 4);
    this.windmill(-134, -8);
    World.bikeSpots.push({ x: fx + 8, z: fz + 6, tier: 0 });
  },

  hayBales(x, z, n) {
    for (let i = 0; i < n; i++) {
      const bx = x + (i % 3) * 2.4, bz = z + Math.floor(i / 3) * 2.4, y = terrainHeight(bx, bz);
      this.cyl(bx, bz, 0.9, 1.3, 'hay', { y, seg: 14 });
    }
    this.spot(x + 1, z + 3.5, 1);
  },

  tractor(x, z) {
    const base = terrainHeight(x, z);
    this.box(x, z, 3.2, 1.8, 1.0, 'metalGreen', { y: base + 0.6 }); this.box(x - 0.5, z, 1.6, 1.6, 1.0, 'metalGreen', { y: base + 1.6, noCollide: true });
    for (const [ox, oz, r] of [[-1.0, -1.0, 0.85], [-1.0, 1.0, 0.85], [1.2, -0.9, 0.5], [1.2, 0.9, 0.5]]) this.piece(new THREE.CylinderGeometry(r, r, 0.4, 14).rotateX(Math.PI / 2), 'rubber', x + ox, base + r, z + oz);
  },

  windmill(x, z) {
    const base = terrainHeight(x, z);
    this.cyl(x, z, 1.8, 14, 'sandstone', { rt: 1.0, seg: 12 });
    this.cyl(x, z, 1.5, 1.2, 'roofBrown', { y: base + 14, rt: 0.2, seg: 12, noCollide: true });
    const g = new THREE.Group(), mat = this.mat('woodDark');
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.1), mat); b.position.y = 3.6; const p = new THREE.Group(); p.rotation.z = i * Math.PI / 2; p.add(b); g.add(p);
      const sail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5, 0.05), this.mat('canvasTan')); sail.position.set(0.8, 3.8, 0.05); p.add(sail);
    }
    g.position.set(x, base + 12.5, z + 2.1); g.traverse(m => { if (m.isMesh) { m.castShadow = true; } });
    this.scene.add(g);
    World.updaters.push(dt => { g.rotation.z += dt * 0.5; });
    this.spot(x + 2.5, z + 1, 2);
  }
});
