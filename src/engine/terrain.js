// Terrain mesh with a 4-way splat shader (grass / sand / rock / gravel road), snow caps and winter mode, the lake, the open sea (south)
// and a distant mountain range (north) with low hills on the sides.
const Terrain = {
  water: null, mat: null, ocean: null, uWinter: { value: 0 }, buoys: null, uBumpK: { value: 0.5 }, uDetail: null,

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
      blend(3, smoothstep(0.05, 0.5, rampHeight(x, z)) * 0.96);                // the bike jumps are bare dirt
      for (let j = 0; j < 4; j++) splat[i * 4 + j] = w[j];
      const m = fbm(x * 0.02 + 9, z * 0.02 + 4, 3), t = 0.78 + m * 0.5;
      const hue = fbm(x * 0.05, z * 0.05 + 30, 2) - 0.5;
      col[i * 3] = t * (1 + hue * 0.22); col[i * 3 + 1] = t * (1 + hue * 0.06); col[i * 3 + 2] = t * (1 - hue * 0.18);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));

    const T = Tex.t, mat = FastEnv.make({ vertexColors: true, roughness: 0.97, metalness: 0, envMapIntensity: 0.55 });          // (matte: Lambert and the SH sky light, see engine/fastenv.js)
    const uWinter = this.uWinter;
    // the close-up grain of each surface comes from its own "detail" sampler: the painted texture at first, the photograph once Tex.loadPhotos() has it; the wide colour drift always comes from the painted one
    this.uDetail = { grass: { value: T.grass }, sand: { value: T.sand }, rock: { value: T.rock }, road: { value: T.road } };
    // the normal maps of the photographs (Tex.loadPhotos puts them in): a flat one until then, uNorm = 0 keeps them out of the shader's way
    const flatN = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); flatN.needsUpdate = true;
    this.uDetailN = { grass: { value: flatN }, sand: { value: flatN }, rock: { value: flatN }, road: { value: flatN } }; this.uNorm = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrassP = this.uDetail.grass; sh.uniforms.tSandP = this.uDetail.sand; sh.uniforms.tRockP = this.uDetail.rock; sh.uniforms.tRoadP = this.uDetail.road;
      sh.uniforms.tGrassN = this.uDetailN.grass; sh.uniforms.tSandN = this.uDetailN.sand; sh.uniforms.tRockN = this.uDetailN.rock; sh.uniforms.tRoadN = this.uDetailN.road; sh.uniforms.uNorm = this.uNorm;
      sh.uniforms.tGrass = { value: T.grass }; sh.uniforms.tSand = { value: T.sand };
      sh.uniforms.tRock = { value: T.rock }; sh.uniforms.tRoad = { value: T.road }; sh.uniforms.uWinter = uWinter; sh.uniforms.uWT = this.uWaterT || (this.uWaterT = { value: 0 }); sh.uniforms.uBumpK = this.uBumpK;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * normal);');
      // A layer is only read where it has weight (about nine texture reads fewer on most of the ground). The derivatives are taken once, outside every branch, and handed to textureGrad (TG),
      // so the filtering stays right where the branches change.
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass, tSand, tRock, tRoad, tGrassP, tSandP, tRockP, tRoadP, tGrassN, tSandN, tRockN, tRoadN;\nuniform float uWinter, uWT, uBumpK, uNorm;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n#define TG(T, K) textureGrad(T, uv * K, ux * K, uy * K)')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 nn = normalize(vWNrm); vec2 uv = vWPos.xz;
          vec3 dpx = dFdx(vWPos), dpy = dFdy(vWPos); vec2 ux = dpx.xz, uy = dpy.xz;
          vec3 cg = vec3(0.0), cs = vec3(0.0), cr = vec3(0.0), cd = vec3(0.0);
          if (vSplat.x > 0.004) cg = TG(tGrassP, 0.55).rgb * (0.6 + 0.8 * TG(tGrass, 0.037).g) * (0.85 + 0.3 * TG(tGrass, 0.13).r) * vec3(1.05, 1.28, 0.82);
          if (vSplat.y > 0.004) cs = TG(tSandP, 0.20).rgb * (0.78 + 0.44 * TG(tSand, 0.029).r) * 1.1;
          vec3 bw = pow(abs(nn), vec3(5.0)); bw /= (bw.x + bw.y + bw.z);
          if (vSplat.z > 0.004) cr = textureGrad(tRockP, vWPos.zy * 0.11, dpx.zy * 0.11, dpy.zy * 0.11).rgb * bw.x + textureGrad(tRockP, vWPos.xz * 0.11, dpx.xz * 0.11, dpy.xz * 0.11).rgb * bw.y + textureGrad(tRockP, vWPos.xy * 0.11, dpx.xy * 0.11, dpy.xy * 0.11).rgb * bw.z;
          if (vSplat.w > 0.004) cd = TG(tRoadP, 0.9).rgb * (0.75 + 0.5 * TG(tRoad, 0.07).r) * (0.85 + 0.3 * TG(tRoad, 0.21).g) * vec3(1.14, 1.05, 0.86);
          vec3 alb = cg * vSplat.x + cs * vSplat.y + cr * vSplat.z + cd * vSplat.w;
          if (vWPos.y > 14.0) {
            float snow = smoothstep(31.0, 39.0, vWPos.y + (TG(tRock, 0.017).r - 0.5) * 9.0) * smoothstep(0.45, 0.78, nn.y);
            alb = mix(alb, vec3(0.74, 0.78, 0.86), snow);
          }
          float wet = smoothstep(0.6, -1.4, vWPos.y) * vSplat.y;
          alb *= 1.0 - wet * 0.35;
          if (uWinter > 0.0) {
            vec3 white = vec3(0.84, 0.88, 0.94) * (0.9 + 0.2 * TG(tGrass, 0.05).g);
            alb = mix(alb, white, uWinter * smoothstep(0.3, 0.62, nn.y) * (1.0 - vSplat.w * 0.55) * smoothstep(-1.0, 0.4, vWPos.y));
          }
          diffuseColor.rgb *= alb;
          float csh = texture2D(tGrass, vWPos.xz * 0.0024 + vec2(uWT * 0.0042, uWT * 0.0027)).g;                 // slow drifting cloud shadows
          diffuseColor.rgb *= 0.84 + 0.3 * smoothstep(0.38, 0.66, csh);`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {                                                                                                     // micro relief: bump from the albedo brightness so the sun rakes across grit and grass
            float hgt = dot(alb, vec3(0.299, 0.587, 0.114));
            vec2 dh = vec2(dFdx(hgt), dFdy(hgt));
            vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition), R1 = cross(sY, normal), R2 = cross(normal, sX);
            float det = dot(sX, R1) * faceDirection;
            vec3 grad = sign(det) * (dh.x * R1 + dh.y * R2);
            float nearB = 1.0 - smoothstep(9.0, 36.0, length(vViewPosition));                                 // the bump fades out with the distance: from there the derivatives of a fine texture only sparkle
            normal = normalize(abs(det) * normal - uBumpK * nearB * clamp(grad, vec3(-0.5), vec3(0.5)));
          }
          {                                                                                                     // the photographs' own normal maps, projected from above (UDN: the tilt is added to the normal), near the camera only
            float nf = (1.0 - smoothstep(24.0, 72.0, length(vViewPosition))) * uNorm;
            if (nf > 0.0) {
              vec2 g = vec2(0.0);
              if (vSplat.x > 0.004) g += (TG(tGrassN, 0.55).xy * 2.0 - 1.0) * (vSplat.x * 0.9);
              if (vSplat.y > 0.004) g += (TG(tSandN, 0.20).xy * 2.0 - 1.0) * (vSplat.y * 0.7);
              if (vSplat.w > 0.004) g += (TG(tRoadN, 0.9).xy * 2.0 - 1.0) * (vSplat.w * 1.0);
              if (vSplat.z > 0.004) g += (textureGrad(tRockN, vWPos.xz * 0.11, dpx.xz * 0.11, dpy.xz * 0.11).xy * 2.0 - 1.0) * (vSplat.z * bw.y * 1.0);
              normal = normalize(normal + (mat3(viewMatrix) * vec3(g.x, 0.0, g.y)) * nf);
            }
          }`);
    };
    this.mat = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    this.mesh = mesh;

    // lake
    const wm = new THREE.MeshStandardMaterial({
      color: 0x1f9aa8, roughness: 0.14, metalness: 0.2, transparent: true, opacity: 0.86, emissive: 0x04323a, emissiveIntensity: 0.5,
      normalMap: T.waterN, normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 1.4
    });
    T.waterN.repeat.set(6, 6);
    const water = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r + 22, 72).rotateX(-Math.PI / 2), wm);
    water.position.set(LAKE.x, WATER_Y, LAKE.z);
    scene.add(water);
    this.water = water;

    this.sea(scene);
    this.horizon(scene);
    this.fancyWater(this.water.material); this.fancyWater(this.ocean.material);
  },

  // depth map of the sea / lake floor (R8, 0..8 m over the playable square) so the water can show shallows, foam and clear edges
  depthTexture() {
    if (this.depthTex) return this.depthTex;
    const N = 256, span = (MAP.half + 12) * 2, data = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / (N - 1) - 0.5) * span, z = (j / (N - 1) - 0.5) * span;
      data[j * N + i] = Math.round(clamp(waterDepth(x, z) / 8, 0, 1) * 255);
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    return (this.depthTex = t);
  },

  // turns a standard water material into a shallow-to-deep gradient with animated shore foam
  fancyWater(mat) {
    const depthTex = this.depthTexture(), span = (MAP.half + 12) * 2, uT = this.uWaterT || (this.uWaterT = { value: 0 }), foamTex = Tex.t.foam || Tex.t.waterN;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tDepth = { value: depthTex }; sh.uniforms.uWT = uT; sh.uniforms.tFoam = { value: foamTex };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tDepth, tFoam;\nuniform float uWT;\nvarying vec3 vWp;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float wd = length(cameraPosition - vWp), far = smoothstep(35.0, 130.0, wd);
          vec2 duv = (vWp.xz + vec2(${(span / 2).toFixed(1)})) / ${span.toFixed(1)};
          float inside = step(0.0, duv.x) * step(duv.x, 1.0) * step(0.0, duv.y) * step(duv.y, 1.0);
          float dm = mix(8.0, texture2D(tDepth, duv).r * 8.0, inside);
          vec3 shallowC = vec3(0.30, 0.92, 0.80), midC = vec3(0.07, 0.62, 0.78), deepC = vec3(0.02, 0.22, 0.46);
          vec3 wcol = mix(mix(shallowC, midC, smoothstep(0.0, 1.6, dm)), deepC, smoothstep(1.4, 6.5, dm));
          float lace = mix(texture2D(tFoam, vWp.xz * 0.06 + vec2(uWT * 0.012, -uWT * 0.008)).r, 0.5, far);
          float wave = mix(0.5 + 0.5 * sin(dm * 3.4 - uWT * 1.7 + lace * 3.0), 0.55, far);
          float foam = (1.0 - smoothstep(0.0, 0.95, dm)) * smoothstep(0.3, 0.85, lace * 0.55 + wave * 0.75) + (1.0 - smoothstep(0.0, 0.14, dm));
          diffuseColor.rgb = mix(wcol, vec3(1.0), clamp(foam, 0.0, 1.0));
          diffuseColor.a = mix(0.5, 0.95, smoothstep(0.0, 2.2, dm));`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal = normalize(mix(nonPerturbedNormal, normal, 1.0 - smoothstep(30.0, 140.0, length(vViewPosition))));`);
    };
    mat.needsUpdate = true;
  },

  // endless ocean to the south: big animated plane, shore foam strip and a line of buoys marking the swim limit
  sea(scene) {
    const T = Tex.t;
    this.seaN = T.waterN.clone(); this.seaN.needsUpdate = true; this.seaN.repeat.set(110, 46);
    this.seaN2 = T.waterN.clone(); this.seaN2.needsUpdate = true; this.seaN2.repeat.set(40, 18);
    const m = new THREE.MeshStandardMaterial({
      color: 0x12a0c4, roughness: 0.14, metalness: 0.2, transparent: true, opacity: 0.88, emissive: 0x04323f, emissiveIntensity: 0.6,
      normalMap: this.seaN, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 1.5
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
  // The range is a denser mesh with craggy ridges on top of the broad ones, coloured by height (forest, rock, snow) and in the shader broken up with the rock and grass textures (more rock on the steep
  // places), so the mountains read as mountains and not as smooth white blobs. The fog still hides what is far away.
  horizon(scene) {
    const seg = 480, rings = 30, rIn = 300, rOut = 1500, pos = [], col = [], idx = [];
    const rock = new THREE.Color(0x5d625f), forest = new THREE.Color(0x3f5a40), snow = new THREE.Color(0xe6ebf2), hill = new THREE.Color(0x5f7a4d), c = new THREE.Color();
    for (let j = 0; j <= rings; j++) {
      const t = j / rings, r = rIn + (rOut - rIn) * Math.pow(t, 1.5);
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), x = ca * r, z = sa * r;
        const north = smoothstep(0.1, -0.6, sa), sea = smoothstep(0.02, 0.42, sa), side = (1 - north) * (1 - sea);
        const ridge = 1 - Math.abs(noise2(ca * 4 + 20, sa * 4 + (sa < 0 ? 0 : 50)) * 2 - 1);
        const rough = fbm(x * 0.01 + 5, z * 0.01, 4), far = smoothstep(300, 700, r);
        const crag = Math.pow(1 - Math.abs(noise2(x * 0.016 + 40, z * 0.016 + 70) * 2 - 1), 2), crinkle = fbm(x * 0.045 + 11, z * 0.045 + 3, 3);          // crags on the ridges, small folds everywhere
        // the north range is built from several ridgelines of increasing height
        const range = north * far * (50 + 210 * Math.pow(ridge, 1.3) + 90 * rough + 70 * crag * (0.35 + rough) + 22 * crinkle) * (0.55 + 0.45 * smoothstep(0.1, -0.9, sa));
        const hills = side * smoothstep(300, 520, r) * (14 + 46 * rough + 10 * crinkle) * (1 - sea);
        let h = -40 + smoothstep(290, 400, r) * 58 * (1 - sea) + range + hills;
        if (sea > 0.01) h = lerp(h, -30, sea);
        pos.push(x, h, z);
        const k = (h - 20) / 230;                                                           // 0 at the foot, 1 at about 250 m: forest, then bare rock from about 80 m, snow only on the high ridges
        c.copy(forest).lerp(hill, side);
        c.lerp(rock, smoothstep(0.2, 0.5, k + (rough - 0.5) * 0.25) * north); c.lerp(snow, smoothstep(0.8, 1.02, k + (rough - 0.5) * 0.2 + (crag - 0.4) * 0.14) * north);
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
    const T = Tex.t, mat = FastEnv.make({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.5 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tRock = { value: T.rock }; sh.uniforms.tGrass = { value: T.grass };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tRock, tGrass;\nvarying vec3 vWP;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {                                                                                                     // the texture breaks up the colour: grass on the low slopes, rock higher up and where it is steep (snow stays smooth)
            vec3 wn = inverseTransformDirection(normalize(vNormal), viewMatrix);
            float k = clamp((vWP.y - 20.0) / 230.0, 0.0, 1.0), steep = 1.0 - abs(wn.y), snowy = smoothstep(0.62, 0.86, dot(diffuseColor.rgb, vec3(0.3333)));
            float rocky = clamp(smoothstep(0.06, 0.4, k) + smoothstep(0.22, 0.6, steep), 0.0, 1.0);
            float tg = texture2D(tGrass, vWP.xz * 0.006).g;
            vec2 sideUv = abs(wn.x) > abs(wn.z) ? vWP.zy : vWP.xy;
            float tr = texture2D(tRock, vWP.xz * 0.004).g * (1.0 - steep) + texture2D(tRock, sideUv * 0.004).g * steep;
            float d = mix(0.78 + 0.5 * tg, 0.5 + 1.05 * tr, rocky);
            diffuseColor.rgb *= mix(d, 0.92 + 0.16 * tr, snowy);
          }`)
        .replace('#include <fog_fragment>', '#ifdef USE_FOG\n float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth * 0.3 );          // a third of the fog of the nearby world: the range stays a range\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif');
    };
    const m = new THREE.Mesh(g, mat);
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
    if (this.uWaterT) this.uWaterT.value += dt;
    if (this.seaN) { this.seaN.offset.x += dt * 0.004; this.seaN.offset.y += dt * 0.0026; this.seaN2.offset.x -= dt * 0.003; }
    if (this.buoys) {
      const t = G.time, m = this._m || (this._m = new THREE.Matrix4());
      this.buoys.xs.forEach((x, i) => { m.makeTranslation(x, WATER_Y + 0.12 + Math.sin(t * 1.4 + i * 1.3) * 0.12, 211 + Math.sin(i) * 0.8); this.buoys.mesh.setMatrixAt(i, m); });
      this.buoys.mesh.instanceMatrix.needsUpdate = true;
    }
  }
};
