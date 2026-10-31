// What a skin looks like: a coloured, patterned bodysuit and the gear on it.
//  - the suit is a shader on the base body (qrig.js): colours and patterns (camo, stripes, bands, gradient) per body part, light lines, fabric or metal, all computed from the body's own coordinates
//    so nothing is painted and every skin costs a handful of numbers
//  - the gear (helmets, goggles, visors, vests, packs, pads, belts, boots...) is built here from rounded shapes, fixed to the bones and merged into a few meshes per skin
// Everything is in the model space of the base character: +Y up, it looks along +Z, its left hand side is +X (the pose is the T-pose of the files).
(function () {
  const V = THREE.Vector3, PI = Math.PI;

  // ---------- the suit shader ----------
  const GLSL_FRAG = `
    varying vec4 vPA; varying vec4 vPB; varying vec3 vOP; varying vec3 vON;
    uniform vec3 uC[8];       // 0 torso, 1 sleeves, 2 legs, 3 gloves, 4 boots, 5 light lines, 6 pattern colour 2, 7 pattern colour 3
    uniform vec4 uP;          // x pattern (1 camo, 2 stripe, 3 bands, 4 gradient), y pattern size, z long sleeves, w height where trousers end (0 = long)
    uniform vec4 uQ;          // x light lines, y metal, z roughness of the cloth, w light line style (1 sides, 2 circuit, 3 both)
    uniform vec4 uR;          // x y z: pattern on torso / sleeves / legs, w gloves on
    float gCloth = 0.0; vec3 gGlow = vec3(0.0); vec2 gN = vec2(0.0);
    float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y), mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm3(vec3 p) { return vn(p) * 0.55 + vn(p * 2.1) * 0.3 + vn(p * 4.3) * 0.15; }
    vec3 patt(vec3 b, float on, float part) {
      if (on < 0.5 || uP.x < 0.5) return b;
      if (uP.x < 1.5) { vec3 c = mix(b, uC[6], step(0.50, gN.x)); return mix(c, uC[7], step(0.60, gN.y) * step(gN.x, 0.52)); }
      float side = part < 1.5 ? (part < 0.5 ? smoothstep(0.82, 0.88, abs(vON.x)) : smoothstep(0.85, 0.9, vON.y)) : smoothstep(0.85, 0.9, abs(vON.x));
      if (uP.x < 2.5) return mix(b, uC[6], side);
      float along = part < 0.5 ? vOP.y * 7.0 : (part < 1.5 ? abs(vOP.x) * 9.0 : vOP.y * 6.0);
      if (uP.x < 3.5) return mix(b, uC[6], step(0.72, fract(along)));
      float g = part < 0.5 ? smoothstep(0.9, 1.5, vOP.y) : (part < 1.5 ? smoothstep(0.25, 0.8, abs(vOP.x)) : smoothstep(0.95, 0.15, vOP.y));
      return mix(b, uC[6], g);
    }
    float glowLines(float mT, float mS, float mL) {
      if (uQ.x < 0.01) return 0.0;
      float side = smoothstep(0.96, 0.985, abs(vON.x)), top = smoothstep(0.96, 0.985, vON.y);
      float zip = smoothstep(0.016, 0.006, abs(vOP.x)) * step(0.0, vON.z) * step(1.0, vOP.y);
      float bar = smoothstep(0.014, 0.005, abs(vOP.y - 1.36)) * step(0.0, vON.z) * step(abs(vOP.x), 0.2);
      float bar2 = smoothstep(0.014, 0.005, abs(vOP.y - 1.2)) * step(0.0, vON.z) * step(abs(vOP.x), 0.16);
      float arm = smoothstep(0.014, 0.005, abs(abs(vOP.x) - 0.5)) + smoothstep(0.014, 0.005, abs(abs(vOP.x) - 0.36));
      float leg = smoothstep(0.014, 0.005, abs(vOP.y - 0.72)) + smoothstep(0.014, 0.005, abs(vOP.y - 0.35));
      float sides = mT * side + mL * side + mS * top, circuit = mT * (zip + bar + bar2) + mS * arm + mL * leg;
      return clamp(uQ.w < 1.5 ? sides : uQ.w < 2.5 ? circuit : sides + circuit, 0.0, 1.0);
    }`;
  const SUIT_COLOR = `
    {
      vec4 wA = pow(vPA, vec4(4.0)), wB = pow(vPB, vec4(4.0));
      float tot = dot(wA, vec4(1.0)) + wB.x + wB.y + wB.z + 1e-5;
      if (uP.x > 0.5 && uP.x < 1.5) { vec3 p = vOP * uP.y * 6.0; gN = vec2(fbm3(p), fbm3(p + 11.7)); }                // the camouflage noise, once per pixel
      float mTorso = wA.y / tot, mSleeve = (wA.z + wA.w * uP.z) / tot, mLeg = wB.x / tot * step(uP.w, vOP.y), mFoot = wB.y / tot, mGlove = wB.z / tot * uR.w;
      vec3 col = patt(uC[0], uR.x, 0.0) * mTorso + patt(uC[1], uR.y, 1.0) * mSleeve + patt(uC[2], uR.z, 2.0) * mLeg + uC[3] * mGlove + uC[4] * mFoot;
      float cloth = clamp(mTorso + mSleeve + mLeg + mFoot + mGlove, 0.0, 1.0);
      float aa = clamp(1.0 - length(fwidth(vOP)) * 90.0, 0.0, 1.0);                                   // fine speckle only where a pixel is smaller than it (no crawling noise at a distance)
      col *= 1.0 + (vn(vOP * 90.0) - 0.5) * 0.3 * aa;
      diffuseColor.rgb = mix(diffuseColor.rgb, col / max(cloth, 1e-3), cloth);
      gCloth = cloth; gGlow = uC[5] * glowLines(mTorso, mSleeve + mGlove * 0.0, mLeg) * uQ.x;
    }`;

  // colours as [r, g, b] in linear space from 0xRRGGBB
  const lin = (hex) => { const c = new THREE.Color(hex); return new V(c.r, c.g, c.b); };

  Character.suitShader = function (m, S) {
    const cols = (S.c || []).concat([0x808080, 0x808080, 0x808080, 0x808080, 0x808080, 0x808080, 0x808080, 0x808080]).slice(0, 8).map(lin);
    const patIds = { solid: 0, camo: 1, stripe: 2, bands: 3, gradient: 4 }, on = S.on || [1, 1, 1];
    const U = { uC: { value: cols }, uP: { value: new THREE.Vector4(patIds[S.pat] || 0, S.size || 1, S.sleeve === 0 ? 0 : 1, S.pants || 0) },
      uQ: { value: new THREE.Vector4(S.glow || 0, S.metal || 0, S.rough === undefined ? 0.85 : S.rough, S.lines || 1) }, uR: { value: new THREE.Vector4(on[0], on[1], on[2], S.gloves === 0 ? 0 : 1) } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 partA; attribute vec4 partB; varying vec4 vPA; varying vec4 vPB; varying vec3 vOP; varying vec3 vON;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vPA = partA; vPB = partB; vOP = position; vON = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', GLSL_FRAG + '\nvoid main() {')
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + SUIT_COLOR)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, uQ.z, gCloth);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, uQ.y, gCloth);')
        .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (1.0 - gCloth * 0.9);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += gGlow;');
    };
    m.customProgramCacheKey = () => 'suit1';
    m.userData.suit = U;
  };

  // a soft, blurred noise for the cloth: folds and unevenness instead of a visible weave (a fine pattern would crawl when the character moves)
  Character.fabricBump = function () {
    if (this._fabric) return this._fabric;
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), d = x.createImageData(N, N), r = mulberry32(7), base = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) base[i] = r();
    const val = (i, j) => base[((j + N) % N) * N + ((i + N) % N)];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0, w = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const k = 1 / (1 + a * a + b * b); s += val(i + a, j + b) * k; w += k; }
      const v = Math.round(255 * (0.25 + 0.6 * (s / w))), o = (j * N + i) * 4; d.data[o] = d.data[o + 1] = d.data[o + 2] = v; d.data[o + 3] = 255;
    }
    x.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.anisotropy = 4; return (this._fabric = t);
  };

  // camouflage for the cloth of the gear (same noise, in the gear's own coordinates)
  Character.camoShader = function (m, S) {
    const U = { uK: { value: [lin(S.c[0]), lin(S.c[6]), lin(S.c[7])] }, uS: { value: S.size || 1 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP2;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP2 = position;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', `varying vec3 vOP2; uniform vec3 uK[3]; uniform float uS;
        float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y), mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
        float fbm3(vec3 p) { return vn(p) * 0.55 + vn(p * 2.1) * 0.3 + vn(p * 4.3) * 0.15; }
        void main() {`).replace('#include <map_fragment>', `#include <map_fragment>
        { vec3 p = vOP2 * uS * 6.0; float n = fbm3(p), n2 = fbm3(p + 11.7); vec3 c = mix(uK[0], uK[1], step(0.5, n)); diffuseColor.rgb = mix(c, uK[2], step(0.6, n2) * step(n, 0.52)); }`);
    };
    m.customProgramCacheKey = () => 'camo1';
  };

  // ---------- the gear ----------
  const dome = (frac, ws = 28, hs = 16) => new THREE.SphereGeometry(1, ws, hs, 0, PI * 2, 0, PI * frac);
  const ball = (ws = 22, hs = 14) => new THREE.SphereGeometry(1, ws, hs);
  const tube = (r1, r2, h, open = true, seg = 28) => new THREE.CylinderGeometry(r1, r2, h, seg, 1, open);
  const ring = (R, r, seg = 28) => new THREE.TorusGeometry(R, r, 10, seg).rotateX(PI / 2);

  // builds the gear of a skin: [{ geo, kind }] with skin weights (every piece is carried by one bone). rest: bone name -> rest position, names: bone names in skeleton order
  // T (optional): the equipment worn from the shop (gear.js): it takes the place of the skin's own helmet, vest, pack, boots, and its pieces are built after the skin's
  Character.buildGear = function (skin, rest, names, T) {
    const S = skin.q, list = (S.gear || []).filter(g => !(T && Character.equipReplaces(g.split(':')[0], T))), k = rest.Head.y / 1.6, out = [];
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), eu = new THREE.Euler(), pp = new V(), sc = new V();
    const add = (kind, geo, bone, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      geo.applyMatrix4(m4.compose(pp.set(x * k, y * k, z * k), qt.setFromEuler(eu.set(rx, ry, rz)), sc.set(sx * k, sy * k, sz * k)));
      const n = geo.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), bi = Math.max(0, names.indexOf(bone));
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); out.push({ geo, kind });
    };
    const rb = roundBox, both = (fn) => { fn(1, 'l'); fn(-1, 'r'); };
    const HC = [0, 1.69, -0.01];                                                              // the middle of the head

    const GEAR = {
      // ----- head -----
      helmet(v) {
        if (v === 'full') {                                                                  // closed racing / pilot helmet with a dark visor
          add('plate', dome(0.8), 'Head', HC[0], 1.69, HC[2], 0, 0, 0, 0.138, 0.152, 0.162);
          add('glass', new THREE.SphereGeometry(1, 28, 12, PI / 2 - 0.95, 1.9, PI * 0.36, PI * 0.26), 'Head', 0, 1.69, HC[2], 0, 0, 0, 0.142, 0.156, 0.166);
          add('trim', rb(0.16, 0.012, 0.01, 0.004), 'Head', 0, 1.745, 0.162);
          return;
        }
        add(v === 'cover' ? 'fabric' : 'plate', dome(0.54), 'Head', 0, 1.69, -0.005, -0.3, 0, 0, 0.128, 0.142, 0.152);          // tactical helmet
        add('metal', rb(0.05, 0.035, 0.04, 0.012), 'Head', 0, 1.79, 0.132, -0.2);
        both((s) => { add('metal', rb(0.014, 0.034, 0.12, 0.005), 'Head', s * 0.132, 1.725, 0.0); add('rubber', rb(0.008, 0.07, 0.016, 0.003), 'Head', s * 0.095, 1.63, 0.03); });
      },
      cap() {
        add('fabric', dome(0.52), 'Head', 0, 1.71, -0.01, -0.05, 0, 0, 0.125, 0.105, 0.14);
        add('fabric', rb(0.19, 0.012, 0.11, 0.005), 'Head', 0, 1.752, 0.15, 0.18);
        add('trim', ball(8, 6), 'Head', 0, 1.815, -0.01, 0, 0, 0, 0.012, 0.012, 0.012);
      },
      beanie() {
        add('fabric', dome(0.58), 'Head', 0, 1.7, -0.01, -0.12, 0, 0, 0.127, 0.125, 0.145);
        add('trim', ring(0.118, 0.016), 'Head', 0, 1.735, -0.01, 0, 0, 0, 1.0, 1.0, 1.18);
      },
      hood() {                                                                                // hooded top: a soft shell around the head, open at the front, and the drape on the shoulders
        add('fabric', new THREE.SphereGeometry(1, 28, 16, PI / 2 + 0.75, PI * 2 - 1.5, 0, PI * 0.72), 'Head', 0, 1.68, -0.035, 0, 0, 0, 0.145, 0.17, 0.175);
        add('fabric', tube(0.12, 0.2, 0.13), 'Head', 0, 1.52, -0.03);
      },
      goggles(v) {
        add('rubber', ring(0.101, 0.011), 'Head', 0, 1.70, -0.012, 0, 0, 0, 1.0, 1.0, 1.15);
        both((s) => { add(v === 'neon' ? 'trim' : 'glass', rb(0.062, 0.05, 0.03, 0.016), 'Head', s * 0.043, 1.70, 0.1); add('rubber', rb(0.074, 0.06, 0.02, 0.02), 'Head', s * 0.043, 1.70, 0.093); });
        add('rubber', rb(0.03, 0.028, 0.03, 0.01), 'Head', 0, 1.70, 0.105);
      },
      visor() {                                                                               // wrap-around light visor
        add('rubber', new THREE.CylinderGeometry(0.112, 0.112, 0.075, 28, 1, true, -1.25, 2.5), 'Head', 0, 1.7, -0.012, 0, 0, 0, 1.0, 1.0, 1.1);
        add('trim', new THREE.CylinderGeometry(0.118, 0.118, 0.045, 28, 1, true, -1.2, 2.4), 'Head', 0, 1.7, -0.012, 0, 0, 0, 1.0, 1.0, 1.1);
      },
      bubble() {                                                                              // astronaut helmet
        add('clear', ball(28, 18), 'Head', 0, 1.69, -0.01, 0, 0, 0, 0.17, 0.18, 0.18);
        add('metal', ring(0.12, 0.03), 'Head', 0, 1.53, -0.03, 0, 0, 0, 1.0, 1.0, 1.1);
      },
      mask(v) {
        if (v === 'gas') {
          add('rubber', rb(0.15, 0.12, 0.09, 0.04), 'Head', 0, 1.625, 0.07);
          both((s) => { add('metal', tube(0.032, 0.032, 0.07, false, 14).rotateX(PI / 2), 'Head', s * 0.05, 1.6, 0.13); add('rubber', rb(0.07, 0.05, 0.03, 0.02), 'Head', s * 0.044, 1.7, 0.1); });
          add('glass', rb(0.15, 0.055, 0.02, 0.02), 'Head', 0, 1.7, 0.108);
          return;
        }
        add('fabric', rb(0.158, 0.1, 0.1, 0.045), 'Head', 0, 1.627, 0.062);                   // balaclava / bandana over the nose and mouth
        add('fabric', tube(0.075, 0.09, 0.08), 'Head', 0, 1.55, -0.035);
      },
      headset() {
        both((s) => add('plate', tube(0.04, 0.04, 0.03, false, 16).rotateZ(PI / 2), 'Head', s * 0.1, 1.675, -0.01));
        add('plate', new THREE.TorusGeometry(0.108, 0.008, 8, 24, PI), 'Head', 0, 1.69, -0.01, 0, PI / 2, 0, 1.0, 1.0, 1.2);
        add('rubber', new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6).rotateX(PI / 2), 'Head', 0.085, 1.64, 0.06);
      },
      collar() { add('collar', tube(0.072, 0.092, 0.07, true, 24), 'neck_01', 0, 1.545, -0.04, -0.12); },

      // ----- chest and back -----
      vest(v) {
        if (v === 'armor') {                                                                  // sci-fi chest armour
          add('plate', rb(0.34, 0.3, 0.08, 0.04), 'spine_03', 0, 1.33, 0.155, -0.08); add('plate', rb(0.3, 0.2, 0.07, 0.035), 'spine_02', 0, 1.1, 0.14);
          add('plate', rb(0.34, 0.34, 0.08, 0.04), 'spine_03', 0, 1.3, -0.205);
          both((s) => { add('plate', ball(20, 12), 'spine_03', s * 0.2, 1.5, -0.01, 0, 0, s * 0.3, 0.13, 0.07, 0.15); add('trim', rb(0.012, 0.22, 0.012, 0.004), 'spine_03', s * 0.07, 1.33, 0.2); });
          return;
        }
        add('fabric', rb(0.31, 0.34, 0.075, 0.035), 'spine_03', 0, 1.31, 0.15, -0.06); add('plate', rb(0.25, 0.27, 0.045, 0.03), 'spine_03', 0, 1.33, 0.185, -0.06);
        add('fabric', rb(0.32, 0.34, 0.075, 0.035), 'spine_03', 0, 1.3, -0.2); add('plate', rb(0.25, 0.27, 0.045, 0.03), 'spine_03', 0, 1.32, -0.228);
        both((s) => add('fabric', rb(0.075, 0.03, 0.38, 0.012), 'spine_03', s * 0.1, 1.535, -0.02));
        add('fabric', tube(0.205, 0.21, 0.13, true, 28), 'spine_01', 0, 1.1, -0.02, 0, 0, 0, 1.0, 1.0, 0.82);
        for (const x of [-0.09, 0, 0.09]) add('fabric', rb(0.07, 0.105, 0.05, 0.015), 'spine_02', x, 1.12, 0.185);
        both((s) => add('metal', rb(0.02, 0.05, 0.03, 0.008), 'spine_03', s * 0.12, 1.5, 0.17));
      },
      pack(v) {
        if (v === 'jet') {
          both((s) => { add('metal', tube(0.058, 0.058, 0.42, false, 18), 'spine_03', s * 0.1, 1.3, -0.27); add('plate', tube(0.05, 0.075, 0.07, false, 18), 'spine_03', s * 0.1, 1.07, -0.27); add('trim', tube(0.045, 0.012, 0.09, false, 14), 'spine_03', s * 0.1, 1.005, -0.27); add('metal', ball(12, 8), 'spine_03', s * 0.1, 1.52, -0.27, 0, 0, 0, 0.058, 0.04, 0.058); });
          add('plate', rb(0.26, 0.16, 0.08, 0.03), 'spine_03', 0, 1.35, -0.3);
          return;
        }
        add('fabric', rb(0.3, 0.4, 0.17, 0.05), 'spine_03', 0, 1.27, -0.285); add('plate', rb(0.28, 0.07, 0.19, 0.03), 'spine_03', 0, 1.49, -0.285);
        both((s) => add('fabric', rb(0.075, 0.2, 0.12, 0.03), 'spine_03', s * 0.19, 1.17, -0.27));
        add('rubber', tube(0.045, 0.045, 0.31, false, 14).rotateZ(PI / 2), 'spine_03', 0, 1.0, -0.28);
        add('trim', rb(0.12, 0.012, 0.012, 0.004), 'spine_03', 0, 1.47, -0.375);
      },
      pads(v) {
        both((s, b) => {
          if (v === 'spike') { add('plate', dome(0.5), 'upperarm_' + b, s * 0.265, 1.5, -0.06, 0, 0, -s * 0.5, 0.115, 0.08, 0.115); for (let i = 0; i < 3; i++) add('metal', new THREE.ConeGeometry(0.02, 0.1, 8), 'upperarm_' + b, s * (0.255 + i * 0.03), 1.58 + i * 0.012, -0.06 + (i - 1) * 0.045, 0, 0, -s * (0.25 + i * 0.35)); return; }
          add('plate', dome(0.5), 'upperarm_' + b, s * 0.26, 1.505, -0.06, 0, 0, -s * 0.45, 0.115, 0.075, 0.12); add('trim', ring(0.1, 0.007).rotateZ(-s * 0.45), 'upperarm_' + b, s * 0.265, 1.49, -0.06, 0, 0, 0, 1.0, 1.0, 1.0);
        });
      },
      elbows() { both((s, b) => add('plate', rb(0.07, 0.115, 0.11, 0.035), 'lowerarm_' + b, s * 0.47, 1.455, -0.075)); },
      bracers(v) { both((s, b) => { add(v === 'plate' ? 'plate' : 'rubber', tube(0.062, 0.058, 0.16, false, 20).rotateZ(PI / 2), 'lowerarm_' + b, s * 0.585, 1.455, -0.075); add('trim', tube(0.064, 0.064, 0.012, false, 20).rotateZ(PI / 2), 'lowerarm_' + b, s * 0.52, 1.455, -0.075); }); },
      cuffs() { both((s, b) => add('cuff', tube(0.056, 0.06, 0.05, true, 18).rotateZ(PI / 2), 'lowerarm_' + b, s * 0.655, 1.455, -0.07)); },

      // ----- waist and legs -----
      belt() {
        add('rubber', tube(0.2, 0.2, 0.065, true, 28), 'pelvis', 0, 1.02, -0.025, 0, 0, 0, 1.0, 1.0, 0.82); add('metal', rb(0.06, 0.05, 0.022, 0.008), 'pelvis', 0, 1.02, 0.145);
        add('fabric', rb(0.07, 0.11, 0.06, 0.02), 'pelvis', 0.19, 0.95, -0.03, 0, 0, -0.12); add('fabric', rb(0.07, 0.11, 0.06, 0.02), 'pelvis', -0.19, 0.95, -0.03, 0, 0, 0.12);
      },
      holster() { add('rubber', rb(0.055, 0.2, 0.085, 0.02), 'thigh_r', -0.2, 0.84, -0.015, 0, 0, 0.08); add('metal', rb(0.05, 0.05, 0.05, 0.01), 'thigh_r', -0.2, 0.95, -0.015); },
      knees(v) { both((s, b) => add(v === 'soft' ? 'fabric' : 'plate', rb(0.115, 0.14, 0.06, 0.03), 'calf_' + b, s * 0.115, 0.575, 0.075, -0.1)); },
      shins() { both((s, b) => add('plate', rb(0.1, 0.3, 0.05, 0.025), 'calf_' + b, s * 0.115, 0.34, 0.085, -0.04)); },
      boots(v) {
        both((s, b) => {
          if (v === 'sneaker') {
            add('fabric', rb(0.118, 0.09, 0.29, 0.04), 'foot_' + b, s * 0.114, 0.075, 0.0, 0.05); add('plate', rb(0.124, 0.03, 0.3, 0.014), 'foot_' + b, s * 0.114, 0.018, 0.0);
            add('trim', rb(0.122, 0.014, 0.2, 0.006), 'foot_' + b, s * 0.114, 0.05, -0.01); add('fabric', tube(0.062, 0.058, 0.05, false, 16), 'calf_' + b, s * 0.114, 0.14, -0.045);
            return;
          }
          add('fabric', rb(0.125, 0.15, 0.31, 0.05), 'foot_' + b, s * 0.114, 0.085, 0.0, 0.04); add('rubber', rb(0.132, 0.036, 0.325, 0.016), 'foot_' + b, s * 0.114, 0.018, 0.0);
          add('fabric', tube(0.074, 0.08, 0.17, false, 20), 'calf_' + b, s * 0.114, 0.2, -0.045); add('metal', rb(0.14, 0.02, 0.03, 0.006), 'foot_' + b, s * 0.114, 0.19, 0.0);
          if (v === 'sci') add('trim', rb(0.134, 0.012, 0.2, 0.005), 'foot_' + b, s * 0.114, 0.045, 0.0);
        });
      }
    };
    for (const g of list) { const [n, v] = g.split(':'); if (GEAR[n]) GEAR[n](v); else console.warn('[gear] unknown', g); }
    // the edges of the clothes: a collar at the neck, cuffs where bare hands come out of long sleeves, a hem where shorts end
    const U = S.suit || {}, have = list.map(g => g.split(':')[0]);
    if (!have.includes('collar') && !have.includes('hood') && !have.includes('bubble')) GEAR.collar();
    if (U.sleeve !== 0 && U.gloves === 0 && !have.includes('cuffs')) GEAR.cuffs();
    if (U.pants > 0) both((s, b) => add('hem', tube(0.1, 0.104, 0.03, true, 22), 'thigh_' + b, s * 0.114, U.pants, -0.035));
    if (T) Character.equipParts({ add, rb, both, dome, ball, tube, ring, rest, k }, T);
    return out;
  };
})();
