// Short, dense, wind-swept grass of real blade geometry around the camera (High and Ultra only; Low, Med and phones keep the flat ground).
// It is ONE instanced draw call and costs the CPU nothing per frame: the instances sit on a grid of cells that follows the camera (a cell keeps its blades while the camera moves,
// the cells that fall off the far edge come back on the near edge, where they are still invisible because blades shrink to nothing towards the edge), the position of every clump
// is computed in the vertex shader from a hash of its cell, and the height of the ground and the "is there grass here" mask come from one 1 m texture made from the terrain.
// The grass keeps off roads, sand, rock, the water's edge, house footprints, tree trunks and loot spots. It bends away from the player's feet and sways with the same clock as the tufts.
const Grass3D = {
  mesh: null, tier: null, want: null, maps: null, k: 1,
  uCam: { value: new THREE.Vector3() }, uPlayer: { value: new THREE.Vector4() }, uR: { value: 16 },                // uR: the radius in use (the tier's radius times k)
  // R: radius in metres, cell: spacing of the clumps, blades: blades per clump, seg: segments per blade
  TIERS: { high: { R: 16, cell: 0.45, blades: 5, seg: 3 }, ultra: { R: 22, cell: 0.42, blades: 6, seg: 3 } },

  // called when the quality is set: only High and Ultra on a desktop grow grass
  apply(key) {
    this.want = this.TIERS[key] && !Device.phone && !/[?&]grass3d=0/.test(location.search) ? key : null;
    if (!this.want) { if (this.mesh) this.mesh.visible = false; return; }
    if (!G.arena && Terrain.mesh) this.make(this.want);
  },

  // height of the ground (red) and grass mask (green) every metre over the terrain square, 16 bit floats so the graphics card can interpolate them
  buildMaps() {
    if (this.maps) return this.maps;
    const geo = Terrain.mesh.geometry, pos = geo.attributes.position, spl = geo.attributes.splat, half = MAP.half + 12, seg = half, n1 = seg + 1, W = half * 2;      // the terrain is (seg + 1)^2 vertices 2 m apart
    const Hg = new Float32Array(n1 * n1), Gg = new Float32Array(n1 * n1);
    for (let i = 0; i < pos.count; i++) { const c = Math.round((pos.getX(i) + half) / 2), r = Math.round((pos.getZ(i) + half) / 2), k = r * n1 + c; Hg[k] = pos.getY(i); Gg[k] = spl.getX(i); }
    const block = new Uint8Array(W * W), mark = (x0, x1, z0, z1) => {
      for (let j = Math.max(0, Math.floor(z0 + half)); j <= Math.min(W - 1, Math.ceil(z1 + half)); j++) for (let i = Math.max(0, Math.floor(x0 + half)); i <= Math.min(W - 1, Math.ceil(x1 + half)); i++) block[j * W + i] = 1;
    };
    for (const c of G.colliders) {                                                                         // footprints of houses, walls, floors and rocks; trunks and stumps
      if (c.type === 'box') mark(c.minX - 0.7, c.maxX + 0.7, c.minZ - 0.7, c.maxZ + 0.7);
      else if (c.type === 'circle') mark(c.x - c.r - 0.45, c.x + c.r + 0.45, c.z - c.r - 0.45, c.z + c.r + 0.45);
    }
    for (const s of World.mainSpots || World.lootSpots) mark(s.x - 1.2, s.x + 1.2, s.z - 1.2, s.z + 1.2);   // loot must not hide in the grass
    const HT = new Uint16Array(W * W * 2), toHalf = THREE.DataUtils.toHalfFloat, ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    for (let j = 0; j < W; j++) {
      const fz = clamp((j + 0.5) / 2, 0, seg - 1e-4), iz = Math.floor(fz), tz = fz - iz;
      for (let i = 0; i < W; i++) {
        const fx = clamp((i + 0.5) / 2, 0, seg - 1e-4), ix = Math.floor(fx), tx = fx - ix, k = iz * n1 + ix;
        const h = (Hg[k] * (1 - tx) + Hg[k + 1] * tx) * (1 - tz) + (Hg[k + n1] * (1 - tx) + Hg[k + n1 + 1] * tx) * tz;
        const g = (Gg[k] * (1 - tx) + Gg[k + 1] * tx) * (1 - tz) + (Gg[k + n1] * (1 - tx) + Gg[k + n1 + 1] * tx) * tz;
        let m = ss(0.62, 0.92, g) * ss(0.3, 0.8, h) * (1 - ss(26, 32, h));
        if (m > 0) { m *= ss(0.08, 0.28, fbm((i - half) * 0.045 + 70, (j - half) * 0.045 + 20, 2)); if (block[j * W + i]) m = 0; }
        const o = (j * W + i) * 2; HT[o] = toHalf(h); HT[o + 1] = toHalf(m);
      }
    }
    const tex = new THREE.DataTexture(HT, W, W, THREE.RGFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.needsUpdate = true;
    return (this.maps = { tex, half, W });
  },

  // a clump of blades: every vertex carries (across the blade -1..1, up the blade 0..1, width factor) and (offset in the clump x, z, yaw, height factor)
  clumpGeo(T, N) {
    const rng = mulberry32(4242), S = T.seg, vpb = 2 * S + 1, pos = [], shp = [], bld = [], idx = [];
    for (let b = 0; b < T.blades; b++) {
      const a = rng() * 6.2832, r = 0.012 + 0.12 * Math.sqrt(rng()), dx = Math.cos(a) * r, dz = Math.sin(a) * r, yaw = rng() * 6.2832, hf = 0.62 + 0.75 * rng(), wf = rng(), base = b * vpb;
      for (let l = 0; l < S; l++) for (const side of [-1, 1]) { pos.push(side, l / S, 0); shp.push(side, l / S, wf); bld.push(dx, dz, yaw, hf); }
      pos.push(0, 1, 0); shp.push(0, 1, wf); bld.push(dx, dz, yaw, hf);                                  // the tip is a single vertex
      for (let l = 0; l < S - 1; l++) { const v0 = base + 2 * l, v1 = v0 + 1, v2 = v0 + 2, v3 = v0 + 3; idx.push(v0, v1, v3, v0, v3, v2); }
      idx.push(base + 2 * (S - 1), base + 2 * (S - 1) + 1, base + 2 * S);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aShape', new THREE.Float32BufferAttribute(shp, 3)); g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bld, 4));
    g.setIndex(idx); g.instanceCount = N * N;
    return g;
  },

  material(T, N, maps) {
    const mat = FastEnv.make({ color: 0xffffff, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.4 });
    const U = { uCam: this.uCam, uPlayer: this.uPlayer, uTime: Nature.uTime, uMap: { value: maps.tex }, uOrg: { value: new THREE.Vector2(-maps.half, -maps.half) }, uInv: { value: 1 / maps.W },
      uN: { value: N }, uCell: { value: T.cell }, uR: this.uR, uBase: { value: new THREE.Color(0.026, 0.066, 0.013) }, uTip: { value: new THREE.Color(0.125, 0.25, 0.042) }, uFar: { value: new THREE.Color(0.06, 0.13, 0.035) } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aShape; attribute vec4 aBlade;
          uniform vec3 uCam; uniform vec4 uPlayer; uniform float uTime, uCell, uR; uniform sampler2D uMap; uniform vec2 uOrg; uniform float uInv; uniform int uN; uniform vec3 uBase, uTip, uFar;
          varying vec3 vGC;
          float gHash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
          float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <beginnormal_vertex>', `
          // which cell of the world this instance is standing in: the one with the same index (mod N) that lies within N / 2 cells of the camera
          float gN = float(uN), gIx = float(gl_InstanceID % uN), gIy = float(gl_InstanceID / uN);
          vec2 gCamCell = floor(uCam.xz / uCell), gLoc = vec2(gIx, gIy);
          vec2 gCell = gLoc + gN * floor((gCamCell - gLoc + 0.5 * gN) / gN);
          vec2 gh2 = vec2(gHash(gCell + 3.1), gHash(gCell + 41.7));
          float gh3 = gHash(gCell + 93.3), gh4 = gHash(gCell + 7.9), gh5 = gHash(gCell + 55.5);
          vec2 gWp = (gCell + 0.15 + 0.7 * gh2) * uCell;
          float gD = distance(gWp, uCam.xz);
          vec4 gM = textureLod(uMap, (gWp - uOrg) * uInv, 0.0);                                           // r: height of the ground, g: how much grass grows here
          float gKeep = step(gh3, gM.g) * step(gh5, 1.0 - 0.55 * smoothstep(0.35 * uR, uR, gD));         // thinner with distance
          float gVis = gKeep * (1.0 - smoothstep(0.55 * uR, uR, gD)) * (1.0 - smoothstep(7.0, 22.0, uCam.y - gM.r));
          float gPatch = 0.65 + 0.7 * gNoise(gWp * 0.07 + 5.0);
          float gH = (0.2 + 0.26 * gh4) * gPatch * gVis * aBlade.w;
          float gCa = gh2.x * 6.2832, gcs = cos(gCa), gsn = sin(gCa);
          vec2 gRp = gWp + vec2(aBlade.x * gcs - aBlade.y * gsn, aBlade.x * gsn + aBlade.y * gcs);
          float gYaw = aBlade.z + gCa;
          vec2 gSd = vec2(cos(gYaw), sin(gYaw)), gFd = vec2(-gSd.y, gSd.x);
          float gT = aShape.y, gW = (0.012 + 0.006 * aShape.z) * (1.0 + 0.045 * gD) * (1.0 - 0.85 * gT);
          float gLean = (0.08 + 0.32 * fract(aBlade.z * 7.13 + gh4 * 3.7)) * gH;
          float gPh = uTime * 1.6 + gWp.x * 0.33 + gWp.y * 0.21;
          float gWind = (sin(gPh) * 0.55 + sin(gPh * 2.3 + 1.7) * 0.25 + 0.35) * 0.09 * gH;
          vec2 gTp = gRp - uPlayer.xz; float gPd = length(gTp);
          float gPush = (1.0 - smoothstep(0.1, 0.85, gPd)) * uPlayer.w * (1.0 - smoothstep(0.6, 1.6, abs(uPlayer.y - gM.r)));
          vec2 gBend = gFd * gLean + vec2(0.82, 0.57) * gWind + (gTp / max(gPd, 0.05)) * gPush * 0.55 * gH;
          vec3 gPos = vec3(gRp.x, gM.r - 0.03, gRp.y) + vec3(gSd.x, 0.0, gSd.y) * aShape.x * gW + vec3(0.0, gT * gH * (1.0 - 0.35 * gPush), 0.0) + vec3(gBend.x, 0.0, gBend.y) * gT * gT;
          vec3 objectNormal = normalize(vec3(gFd.x * 0.45, 1.0, gFd.y * 0.45));
          // colour: dark at the root, light at the tip, a little different from clump to clump, yellowish in dry patches, and towards the ground's own colour far away
          float gDry = smoothstep(0.62, 0.9, gNoise(gWp * 0.035 + 31.0));
          vec3 gCol = mix(uBase * (0.8 + 0.4 * gh4), uTip * (0.8 + 0.4 * fract(gh4 * 13.7 + gh3)), pow(gT, 0.8));
          gCol = mix(gCol, gCol * vec3(1.55, 1.2, 0.45), gDry * 0.7);
          gCol = mix(gCol, uFar, smoothstep(0.35 * uR, uR, gD) * 0.6);
          vGC = gCol;`)
        .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGC;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vGC;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');          // both sides of a blade are lit like its front
    };
    return mat;
  },

  make(key) {
    const T = this.TIERS[key]; if (!T || !Terrain.mesh) return false;
    if (this.mesh && this.tier === key) return true;
    if (this.mesh) { G.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; }
    const maps = this.buildMaps(), N = Math.ceil(2 * T.R / T.cell);
    const mesh = new THREE.Mesh(this.clumpGeo(T, N), this.material(T, N, maps));
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.name = 'grass3d'; mesh.visible = false;
    G.scene.add(mesh); this.mesh = mesh; this.tier = key;
    return true;
  },

  update(dt) {
    const m = this.mesh;
    if (!this.want || G.arena || !G.camera || Terrain.uWinter.value > 0.4) { if (m) m.visible = false; return; }          // (under snow there is no grass)
    if (!m || this.tier !== this.want) { if (!this.make(this.want)) return; }
    const cam = G.camera.position, p = G.player, pl = this.uPlayer.value;
    this.uCam.value.copy(cam);
    if (p && p.alive !== false && p.phase === 'ground' && !p.riding) pl.set(p.pos.x, p.pos.y, p.pos.z, 1); else pl.w = 0;
    this.mesh.visible = cam.y - groundAt(cam.x, cam.z) < 24;                                                // up in the air the carpet below is only noise
    this.uR.value = this.TIERS[this.tier].R * this.k;
  },

  // the frame-rate watcher (Game.measure) trims the radius of the carpet before it gives up a whole quality level, and gives it back when there is room again
  shrink() { if (!this.mesh || !this.mesh.visible || this.k <= 0.45) return false; this.k = Math.max(0.45, this.k - 0.2); return true; },
  grow() { if (!this.mesh || !this.mesh.visible || this.k >= 1) return false; this.k = Math.min(1, this.k + 0.1); return true; }
};
