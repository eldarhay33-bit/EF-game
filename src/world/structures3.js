// Points of interest, part 2: industrial yard, lake cabin and dock, mountain camps and summit, desert, scattered farms and camps.
Object.assign(Structures, {
  industrial() {
    const cx = 36, cz = -168;
    addExcl(cx, cz, 44);
    const warehouse = (x, z, w, d, key, rk) => {
      if (!this.canPlace(x, z, w, d, 0.5)) return false;
      this.house(x, z, w, d, { door: '+z', wall: key, roof: rk, tier: 2 });
      this.box(x + w * 0.2, z + d / 2 - 0.2, 4, 0.4, 3, key, { noCollide: true, y: terrainHeight(x, z) + 0.25 });
      return true;
    };
    warehouse(cx - 18, cz - 8, 20, 12, 'metal', 'roofGray');
    warehouse(cx + 16, cz - 10, 16, 11, 'metalBlue', 'roofGray');
    // container yard
    const cols = ['metalRed', 'metalBlue', 'metalGreen', 'metalOrange', 'metalYellow'];
    for (let i = 0; i < 6; i++) {
      const x = cx - 22 + (i % 3) * 7, z = cz + 14 + Math.floor(i / 3) * 3.4;
      this.container(x, z, cols[i % 5], true);
      if (i % 2 === 0) this.container(x, z, cols[(i + 2) % 5], true, 1);
    }
    this.container(cx + 8, cz + 12, 'metalGreen', false); this.container(cx + 8, cz + 19, 'metalRed', false); this.container(cx + 8, cz + 19, 'metalBlue', false, 1);
    // fuel tanks and pipes
    for (const [ox, oz] of [[30, 2], [30, 12], [38, 7]]) this.cyl(cx + ox, cz + oz, 3.4, 6.5, 'metalYellow', { seg: 20 });
    this.htank(cx + 20, cz + 26, 10, 0.5, 'steel', { lift: 1.2 });
    this.box(cx + 16, cz + 26, 0.5, 0.5, 1.2, 'steel'); this.box(cx + 24, cz + 26, 0.5, 0.5, 1.2, 'steel');
    // gantry crane
    const base = terrainHeight(cx - 4, cz + 28);
    for (const ox of [-8, 8]) { this.box(cx - 4 + ox, cz + 28, 1.2, 1.2, 12, 'metalYellow'); this.box(cx - 4 + ox, cz + 32, 1.2, 1.2, 12, 'metalYellow'); }
    this.box(cx - 4, cz + 28, 18, 1.0, 1.0, 'metalYellow', { y: base + 12, noCollide: true }); this.box(cx - 4, cz + 32, 18, 1.0, 1.0, 'metalYellow', { y: base + 12, noCollide: true });
    // perimeter fence with gates
    const fx0 = cx - 34, fx1 = cx + 42, fz0 = cz - 22, fz1 = cz + 40;
    this.fence(fx0, fz0, fx1, fz0, 'steel', 2.2); this.fence(fx1, fz0, fx1, fz1, 'steel', 2.2); this.fence(fx0, fz0, fx0, fz1, 'steel', 2.2);
    this.fence(fx0, fz1, cx - 6, fz1, 'steel', 2.2); this.fence(cx + 6, fz1, fx1, fz1, 'steel', 2.2);
    this.car(cx - 10, cz + 38, 'metalYellow', 0.2); this.barrel(cx + 4, cz + 8, 'metalRed'); this.barrel(cx + 5, cz + 8.6, 'metalBlue');
    this.spot(cx - 18, cz - 2, 3, terrainHeight(cx - 18, cz - 8) + 0.25); this.spot(cx + 16, cz - 4, 2); this.spot(cx - 14, cz + 18, 2); this.spot(cx + 22, cz + 12, 2);
    this.crateStack(cx + 2, cz - 6, 6, 'woodDark');
    World.bikeSpots.push({ x: cx + 2, z: cz + 30, tier: 2 }, { x: cx - 4, z: cz + 36, tier: 1 });
    World.supplySpots.push({ x: cx, z: cz + 4 });
  },

  lake() {
    const cabinSpots = [[-70, 154], [-64, 150], [-76, 158], [-62, 142]];
    const c = cabinSpots.find(([x, z]) => this.canPlace(x, z, 9, 7, 1));
    if (c) { this.house(c[0], c[1], 9, 7, { door: '-z', wall: 'woodDark', roof: 'roofBrown', tier: 2 }); this.crateStack(c[0] + 6, c[1] + 1, 3); this.barrel(c[0] - 6, c[1] + 2); }
    // dock into the lake
    const dx = LAKE.x + 3, y = WATER_Y + 0.55;
    for (let i = 0; i < 9; i++) {
      const z = LAKE.z + LAKE.r + 4 - i * 2.2;
      if (terrainHeight(dx, z) > y - 0.3 && i < 2) { this.box(dx, z, 2.6, 2.2, 0.15, 'wood', { y: y, walkable: true }); continue; }
      this.box(dx, z, 2.6, 2.2, 0.15, 'wood', { y, walkable: true });
      if (i % 2 === 0) { this.box(dx - 1.2, z, 0.2, 0.2, 1.4, 'woodDark', { y: y - 1.2, noCollide: true }); this.box(dx + 1.2, z, 0.2, 0.2, 1.4, 'woodDark', { y: y - 1.2, noCollide: true }); }
    }
    this.spot(dx, LAKE.z + LAKE.r - 8, 2, y + 0.15);
    // boat
    const bx = dx + 4, bz = LAKE.z + LAKE.r - 10;
    this.piece(new THREE.BoxGeometry(1.6, 0.6, 5.2), 'woodRed', bx, WATER_Y + 0.1, bz, 0.2);
    this.box(bx, bz, 1.6, 5.2, 0.6, 'woodRed', { y: WATER_Y - 0.2, noCollide: true, rotY: 0.2 });
    // rock islands
    this.spot(LAKE.x + 4, LAKE.z - 6, 3, terrainHeight(LAKE.x + 4, LAKE.z - 6));
    World.bikeSpots.push({ x: dx + 6, z: LAKE.z + LAKE.r + 8, tier: 0 });
  },

  mountain() {
    const sx = MOUNTAIN.x, sz = MOUNTAIN.z, peak = terrainHeight(sx, sz);
    // summit lookout: concrete ring with a radio mast
    const k = 'concreteDark';
    this.box(sx, sz - 5, 11, 0.8, 2.6, k); this.box(sx - 5.5, sz, 0.8, 9, 2.6, k); this.box(sx + 5.5, sz - 2, 0.8, 5, 2.6, k); this.box(sx - 2, sz + 5, 7, 0.8, 2.6, k);
    this.box(sx + 2, sz + 2, 5, 5, 0.3, 'concrete', { y: peak + 3.0, noCollide: false });
    const mast = this.cyl(sx + 3, sz, 0.35, 24, 'steel', { rt: 0.14, seg: 8 });
    for (let i = 0; i < 4; i++) this.piece(new THREE.BoxGeometry(0.5, 0.5, 0.5), i % 2 ? 'metalRed' : 'concrete', sx + 3, peak + 4 + i * 5, sz);
    this.crateStack(sx - 3, sz - 2, 3);
    this.spot(sx, sz, 3, peak); this.spot(sx - 2, sz + 2, 3, peak);
    World.bikeSpots.push({ x: sx + 8, z: sz + 8, tier: 3 });
    addExcl(sx, sz, 16);
    // camps on flat enough ledges
    let n = 0;
    for (let i = 0; i < 400 && n < 5; i++) {
      const a = rr(0, 6.28), r = rr(18, 58), x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r;
      if (slopeAt(x, z) > 0.1 || terrainHeight(x, z) < 4 || inExcl(x, z, 8)) continue;
      this.tent(x, z); this.crateStack(x + 3.5, z + 1, 3); this.sandbags(x - 3, z - 3, 5, true, 0.9); this.spot(x + 1, z - 2, 2);
      addExcl(x, z, 8); n++;
    }
  },

  tent(x, z) {
    const base = terrainHeight(x, z), geo = new THREE.ConeGeometry(2.4, 2.2, 4, 1).rotateY(Math.PI / 4).translate(0, 1.1, 0);
    this.piece(geo, 'canvas', x, base, z, 0);
    addCollider({ type: 'circle', x, z, r: 1.6, bottom: base, top: base + 2, mat: 'wood' });
  },

  desert() {
    // sandstone outpost with a tower and tents
    const ox = 158, oz = -64, sc = 'sandstone';
    addExcl(ox, oz, 26);
    this.ruinWall(ox, oz - 17, 34, 'x', 3.2, sc, 8); this.ruinWall(ox, oz + 17, 34, 'x', 3.2, sc, 0);
    this.ruinWall(ox - 17, oz, 34, 'z', 3.2, sc, 0); this.ruinWall(ox + 17, oz, 34, 'z', 3.2, sc, 8);
    this.tower(ox - 6, oz + 8, 'sandstone');
    this.tent(ox + 6, oz - 4); this.tent(ox + 9, oz + 6); this.crateStack(ox + 2, oz + 10, 5);
    this.car(ox - 8, oz - 9, 'olive', 0.3);
    this.spot(ox + 4, oz + 2, 3); this.spot(ox - 10, oz - 4, 2); this.spot(ox + 8, oz - 1, 2);
    World.bikeSpots.push({ x: ox + 3, z: oz - 12, tier: 2 }, { x: ox - 12, z: oz + 12, tier: 1 });

    // ruined temple: ring of pillars, podium, broken arches
    const rx = 150, rz = 105;
    addExcl(rx, rz, 24);
    for (let a = 0; a < 12; a++) {
      const ang = a / 12 * Math.PI * 2, px = rx + Math.cos(ang) * 15, pz = rz + Math.sin(ang) * 15, tall = rand() < 0.35 ? 3.4 : 7.5;
      this.cyl(px, pz, 1.1, tall, 'sandstone', { seg: 14 });
      if (tall > 7 && a % 2 === 0) { const nx = rx + Math.cos(ang + 0.52) * 15, nz = rz + Math.sin(ang + 0.52) * 15; this.box((px + nx) / 2, (pz + nz) / 2, 3.2, 2.0, 1.2, 'sandstone', { y: terrainHeight(px, pz) + 7.5, noCollide: true, rotY: -(ang + 0.26) }); }
    }
    this.box(rx, rz, 7, 7, 1.6, 'sandstone', { walkable: true }); this.box(rx, rz, 4.4, 4.4, 1.6, 'sandstone', { y: terrainHeight(rx, rz) + 1.6, walkable: true });
    this.spot(rx, rz, 3, terrainHeight(rx, rz) + 3.2); this.spot(rx + 9, rz + 3, 2); this.spot(rx - 8, rz - 6, 2);
    World.bikeSpots.push({ x: rx + 12, z: rz - 12, tier: 3 });

    // oil derrick and storage
    const dx = 192, dz = 24, base = terrainHeight(dx, dz);
    addExcl(dx, dz, 22);
    for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) this.box(dx + a, dz + b, 0.5, 0.5, 18, 'steel');
    for (let h = 4; h < 18; h += 4.5) { this.box(dx, dz - 3, 6.4, 0.25, 0.25, 'steel', { y: base + h, noCollide: true }); this.box(dx, dz + 3, 6.4, 0.25, 0.25, 'steel', { y: base + h, noCollide: true }); this.box(dx - 3, dz, 0.25, 6.4, 0.25, 'steel', { y: base + h, noCollide: true }); this.box(dx + 3, dz, 0.25, 6.4, 0.25, 'steel', { y: base + h, noCollide: true }); }
    this.box(dx, dz, 7, 7, 0.4, 'steel', { y: base + 9, walkable: true });
    this.stairs(dx + 4 + 10, dz, 'x', -1, 15, 1.6, 1, 'steel', base, 0.6);
    this.cyl(dx + 14, dz + 8, 3.2, 5, 'metal', { seg: 18 }); this.cyl(dx + 14, dz - 8, 3.2, 5, 'metalOrange', { seg: 18 });
    this.pumpJack(dx - 14, dz + 14);
    this.spot(dx, dz, 3, base + 9.4); this.spot(dx + 10, dz + 1, 2);

    // crashed cargo plane
    const px = 178, pz = -168, pb = terrainHeight(px, pz);
    addExcl(px, pz, 20);
    this.htank(px, pz, 20, 1.9, 'metal', { lift: 0.2 });
    this.box(px - 1.5, pz, 4, 22, 0.35, 'metal', { y: pb + 1.2, noCollide: true });
    this.box(px - 9, pz, 3, 8, 0.3, 'metal', { y: pb + 2.4, noCollide: true }); this.box(px - 9, pz, 3, 0.3, 3.6, 'metal', { y: pb + 2.4, noCollide: true });
    this.crateStack(px + 12, pz + 4, 4, 'olive'); this.spot(px + 2, pz + 3, 3, pb + 0.2); this.spot(px + 12, pz + 7, 2);

    // dune camps
    for (const [x, z] of [[112, 16], [236, 40], [128, -168], [200, 180], [110, 150]]) {
      if (!this.canPlace(x, z, 8, 8, 1) && terrainHeight(x, z) < 0) continue;
      this.sandbags(x, z, 7, true, 0.9); this.sandbags(x, z + 4, 7, true, 0.9); this.tent(x + 6, z + 2); this.crateStack(x + 3, z + 1.5, 3); this.spot(x + 1, z + 2, 1);
      addExcl(x, z, 8);
    }
  },

  pumpJack(x, z) {
    const base = terrainHeight(x, z);
    this.box(x, z, 4, 1.6, 0.8, 'metalBlue'); this.box(x - 1.4, z, 0.4, 0.4, 3.4, 'steel'); this.box(x + 1.4, z, 0.4, 0.4, 3.4, 'steel');
    this.piece(new THREE.BoxGeometry(5, 0.4, 0.5), 'metalOrange', x, base + 3.8, z, 0, 0, 0.18);
    this.piece(new THREE.BoxGeometry(0.9, 1.1, 0.9), 'metalOrange', x - 2.4, base + 4.2, z, 0);
  },

  scatter() {
    // lone farmhouses (their spots come from a fixed seed: every online player has to get the same houses)
    const rg = mulberry32(90417), rgf = (a, b) => a + rg() * (b - a);
    let n = 0;
    for (let i = 0; i < 600 && n < 6; i++) {
      const p = randomGroundPoint((x, z) => biomeAt(x, z) === 'field' && Math.hypot(x - ARENA.x, z - ARENA.z) > 70, rgf);
      const w = rr(7, 10), d = rr(6, 9);
      if (!this.canPlace(p.x, p.z, w, d, 2) || distToRoad(p.x, p.z) > 45) continue;
      const doors = ['+z', '-z', '+x', '-x'];
      this.house(p.x, p.z, w, d, { door: doors[Math.floor(rand() * 4)], wall: ['plasterA', 'plasterB', 'plasterC', 'woodDark'][Math.floor(rand() * 4)], roof: ['roofRed', 'roofGray', 'roofBrown'][Math.floor(rand() * 3)], tier: rand() < 0.4 ? 2 : 1 });
      if (rand() < 0.7) this.crateStack(p.x + w / 2 + 2.5, p.z + 1, 2 + Math.floor(rand() * 3));
      n++;
    }
    // road-side wrecks and supply stops
    const cars = ['metalRed', 'metalBlue', 'metalYellow', 'olive', 'metalGreen', 'metalOrange'];
    let c = 0;
    for (let i = 0; i < 300 && c < 9; i++) {
      const seg = RoadSegs[Math.floor(rand() * RoadSegs.length)], t = rand();
      const x = lerp(seg[0], seg[2], t) + rr(-5, 5), z = lerp(seg[1], seg[3], t) + rr(-5, 5);
      if (Math.abs(x) > MAP.half - 20 || Math.abs(z) > MAP.half - 20 || inExcl(x, z, 4) || waterDepth(x, z) > 0) continue;
      if (c % 3 === 2) { this.crateStack(x, z, 3 + (c % 3)); this.barrel(x + 4, z + 1); this.spot(x + 1, z + 3, 1); }
      else this.car(x, z, cars[c % cars.length], rr(0, 3.14));
      c++;
    }
    // power lines along the main roads
    for (const line of ROADS.slice(0, 2)) for (const [x, z] of line) if (!inExcl(x + 6, z, 4) && waterDepth(x + 6, z) === 0) this.pole(x + 6, z, 8);
    World.bikeSpots.push({ x: 8, z: 56, tier: 1 }, { x: -8, z: -56, tier: 0 }, { x: 56, z: 8, tier: 2 });
  },

  buildPOIs() {
    this.arena(); this.village(); this.farm(); this.industrial(); this.lake(); this.mountain(); this.desert(); this.scatter();
  }
});
