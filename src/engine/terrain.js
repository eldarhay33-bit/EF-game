// Terrain mesh with a 4-way splat shader (grass / sand / rock / gravel road), snow caps and winter mode, the lake, the open sea (south)
// and a distant mountain range (north) with low hills on the sides.
const Terrain = {
  water: null, mat: null, ocean: null, uWinter: { value: 0 }, buoys: null,

  build(scene) {
    buildHeightGrid();
    const half = MAP.half + 12, size = half * 2, seg = half;      // 2 m grid
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, n = pos.count;
    const col = new Float32Array(n * 3), splat = new Float32Array(n * 4);
    const w = [1, 0, 0, 0];
    const blend = (i, t) => { t = clamp(t, 0, 1); for (let j = 0; j < 4; j++) w[j] *= (1 - t); w[i] += t; };
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = terrainHeightRaw(x, z);
      pos.setY(i, h);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), z = pos.getZ(i), ny = nrm.getY(i), slope = 1 - ny;
      w[0] = 1; w[1] = 0; w[2] = 0; w[3] = 0;
      blend(1, desertAmount(x, z));
      blend(1, (1 - smoothstep(LAKE.r + 2, LAKE.r + 12, Math.hypot(x - LAKE.x, z - LAKE.z))) * 0.95);
      blend(1, smoothstep(coastZ(x) - 16, coastZ(x) - 4, z) * 0.97);          // beach
      const md = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) / MOUNTAIN.r;
      blend(2, smoothstep(0.95, 0.45, md) * 0.55);
      blend(2, smoothstep(0.07, 0.24, slope));
      blend(3, (1 - smoothstep(ARENA.r - 6, ARENA.r + 8, Math.hypot(x - ARENA.x, z - ARENA.z))) * 0.9);
      blend(3, 1 - smoothstep(1.9, 3.4, distToRoad(x, z)));
      for (let j = 0; j < 4; j++) splat[i * 4 + j] = w[j];
      const m = fbm(x * 0.02 + 9, z * 0.02 + 4, 3), t = 0.78 + m * 0.5;
      const hue = fbm(x * 0.05, z * 0.05 + 30, 2) - 0.5;
      col[i * 3] = t * (1 + hue * 0.22); col[i * 3 + 1] = t * (1 + hue * 0.06); col[i * 3 + 2] = t * (1 - hue * 0.18);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));

    const T = Tex.t, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, envMapIntensity: 0.55 });
    const uWinter = this.uWinter;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: T.grass }; sh.uniforms.tSand = { value: T.sand };
      sh.uniforms.tRock = { value: T.rock }; sh.uniforms.tRoad = { value: T.road }; sh.uniforms.uWinter = uWinter;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * normal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass, tSand, tRock, tRoad;\nuniform float uWinter;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 nn = normalize(vWNrm); vec2 uv = vWPos.xz;
          vec3 cg = texture2D(tGrass, uv * 0.55).rgb * (0.6 + 0.8 * texture2D(tGrass, uv * 0.037).g) * (0.85 + 0.3 * texture2D(tGrass, uv * 0.13).r) * 1.15;
          vec3 cs = texture2D(tSand, uv * 0.20).rgb * (0.78 + 0.44 * texture2D(tSand, uv * 0.029).r) * 1.1;
          vec3 bw = pow(abs(nn), vec3(5.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 cr = (texture2D(tRock, vWPos.zy * 0.11).rgb * bw.x + texture2D(tRock, vWPos.xz * 0.11).rgb * bw.y + texture2D(tRock, vWPos.xy * 0.11).rgb * bw.z);
          vec3 cd = texture2D(tRoad, uv * 0.9).rgb * (0.75 + 0.5 * texture2D(tRoad, uv * 0.07).r) * (0.85 + 0.3 * texture2D(tRoad, uv * 0.21).g);
          vec3 alb = cg * vSplat.x + cs * vSplat.y + cr * vSplat.z + cd * vSplat.w;
          float snow = smoothstep(31.0, 39.0, vWPos.y + (texture2D(tRock, uv * 0.017).r - 0.5) * 9.0) * smoothstep(0.45, 0.78, nn.y);
          alb = mix(alb, vec3(0.74, 0.78, 0.86), snow);
          float wet = smoothstep(0.6, -1.4, vWPos.y) * vSplat.y;
          alb *= 1.0 - wet * 0.35;
          vec3 white = vec3(0.84, 0.88, 0.94) * (0.9 + 0.2 * texture2D(tGrass, uv * 0.05).g);
          alb = mix(alb, white, uWinter * smoothstep(0.3, 0.62, nn.y) * (1.0 - vSplat.w * 0.55) * smoothstep(-1.0, 0.4, vWPos.y));
          diffuseColor.rgb *= alb;`);
    };
    this.mat = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    this.mesh = mesh;

    // lake
    const wm = new THREE.MeshStandardMaterial({
      color: 0x2c6b78, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.86,
      normalMap: T.waterN, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.6
    });
    T.waterN.repeat.set(14, 14);
    const water = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r + 22, 72).rotateX(-Math.PI / 2), wm);
    water.position.set(LAKE.x, WATER_Y, LAKE.z);
    scene.add(water);
    this.water = water;

    this.sea(scene);
    this.horizon(scene);
  },

  // endless ocean to the south: big animated plane, shore foam strip and a line of buoys marking the swim limit
  sea(scene) {
    const T = Tex.t;
    this.seaN = T.waterN.clone(); this.seaN.needsUpdate = true; this.seaN.repeat.set(260, 110);
    this.seaN2 = T.waterN.clone(); this.seaN2.needsUpdate = true; this.seaN2.repeat.set(90, 40);
    const m = new THREE.MeshStandardMaterial({
      color: 0x1d6a86, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.9,
      normalMap: this.seaN, normalScale: new THREE.Vector2(0.75, 0.75), envMapIntensity: 1.8
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(7000, 3400).rotateX(-Math.PI / 2), m);
    plane.position.set(0, WATER_Y, 100 + 1700); plane.renderOrder = 1; plane.frustumCulled = false;
    scene.add(plane); this.ocean = plane;
    // buoys at the edge of the playable sea
    const geo = new THREE.SphereGeometry(0.55, 10, 8), mat = new THREE.MeshStandardMaterial({ color: 0xe85a1c, roughness: 0.5, emissive: 0x401400, emissiveIntensity: 0.6 });
    const list = []; for (let x = -208; x <= 208; x += 13) list.push(x);
    const buoys = new THREE.InstancedMesh(geo, mat, list.length), tmp = new THREE.Matrix4();
    list.forEach((x, i) => { tmp.makeTranslation(x, WATER_Y + 0.1, 211 + Math.sin(i) * 0.8); buoys.setMatrixAt(i, tmp); });
    buoys.castShadow = false; scene.add(buoys); this.buoys = { mesh: buoys, xs: list };
  },

  // contact shadows baked into the terrain vertex colours around buildings, walls, trees and boulders
  bakeAO() {
    const geo = this.mesh.geometry, pos = geo.attributes.position, col = geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      if (Math.abs(x) > MAP.half || Math.abs(z) > MAP.half) continue;
      const near = Grid.query(x - 3.5, z - 3.5, x + 3.5, z + 3.5);
      if (!near.length) continue;
      let ao = 1;
      for (const c of near) {
        if (c.top - c.bottom < 0.9) continue;
        let d, reach;
        if (c.type === 'circle') { d = Math.hypot(x - c.x, z - c.z) - c.r; reach = 2.6 + c.r * 0.5; }
        else { const dx = Math.max(c.minX - x, 0, x - c.maxX), dz = Math.max(c.minZ - z, 0, z - c.maxZ); d = Math.hypot(dx, dz); reach = Math.min(3.2, 1.4 + (c.top - c.bottom) * 0.35); }
        if (d < reach) { const k = 1 - Math.max(d, 0) / reach; ao *= 1 - 0.38 * k * k; }
      }
      if (ao < 1) col.setXYZ(i, col.getX(i) * ao, col.getY(i) * ao, col.getZ(i) * ao);
    }
    col.needsUpdate = true;
  },

  // distant backdrop: a tall snow-capped range to the north, rolling hills east and west, nothing but open water to the south
  horizon(scene) {
    const seg = 220, rings = 14, rIn = 300, rOut = 1500, pos = [], col = [], idx = [];
    const rock = new THREE.Color(0x5d625f), forest = new THREE.Color(0x3f5a40), snow = new THREE.Color(0xe6ebf2), hill = new THREE.Color(0x5f7a4d), c = new THREE.Color();
    for (let j = 0; j <= rings; j++) {
      const t = j / rings, r = rIn + (rOut - rIn) * Math.pow(t, 1.5);
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), x = ca * r, z = sa * r;
        const north = smoothstep(0.1, -0.6, sa), sea = smoothstep(0.02, 0.42, sa), side = (1 - north) * (1 - sea);
        const ridge = 1 - Math.abs(noise2(ca * 4 + 20, sa * 4 + (sa < 0 ? 0 : 50)) * 2 - 1);
        const rough = fbm(x * 0.01 + 5, z * 0.01, 4), far = smoothstep(300, 700, r);
        // the north range is built from several ridgelines of increasing height
        const range = north * far * (50 + 210 * Math.pow(ridge, 1.3) + 90 * rough) * (0.55 + 0.45 * smoothstep(0.1, -0.9, sa));
        const hills = side * smoothstep(300, 520, r) * (14 + 46 * rough) * (1 - sea);
        let h = -40 + smoothstep(290, 400, r) * 58 * (1 - sea) + range + hills;
        if (sea > 0.01) h = lerp(h, -30, sea);
        pos.push(x, h, z);
        const k = clamp((h - 20) / 230, 0, 1);
        c.copy(forest).lerp(hill, side);
        c.lerp(rock, smoothstep(0.1, 0.45, k) * north); c.lerp(snow, smoothstep(0.52, 0.72, k + (rough - 0.5) * 0.2) * north);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, d = a + seg + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    scene.add(m);
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4d5b45 }));
    skirt.position.y = -6; scene.add(skirt);
    this.ring = m; this.skirt = skirt;
  },

  setWinter(v) {
    this.uWinter.value = v;
    if (this.ring) this.ring.material.color.setHex(v ? 0xdde6ee : 0xffffff);
    if (this.skirt) this.skirt.material.color.setHex(v ? 0xcfd8de : 0x4d5b45);
  },

  update(dt) {
    const n = Tex.t.waterN.offset; n.x += dt * 0.012; n.y += dt * 0.008;
    if (this.seaN) { this.seaN.offset.x += dt * 0.004; this.seaN.offset.y += dt * 0.0026; this.seaN2.offset.x -= dt * 0.003; }
    if (this.buoys) {
      const t = G.time, m = this._m || (this._m = new THREE.Matrix4());
      this.buoys.xs.forEach((x, i) => { m.makeTranslation(x, WATER_Y + 0.12 + Math.sin(t * 1.4 + i * 1.3) * 0.12, 211 + Math.sin(i) * 0.8); this.buoys.mesh.setMatrixAt(i, m); });
      this.buoys.mesh.instanceMatrix.needsUpdate = true;
    }
  }
};
