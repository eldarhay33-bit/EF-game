// Cheap sky light for matte surfaces. A MeshStandardMaterial looks the sky up in the cube-UV environment map (a dozen texture reads per pixel for the diffuse and the specular part) and runs the full
// GGX model; on the terrain, the foliage, the walls and the props (rough, not metal) that was about a third of the frame time of a weak GPU. Those surfaces get Lambert shading instead and take their
// diffuse sky light from nine spherical-harmonics coefficients worked out from the photographic sky whenever it changes (no texture reads at all). Metals, glass, guns, characters and water keep
// the full model. The look stays within a few percent of the old one (docs/HANDOFF.md, "v4.4.0 changes"). ?fastenv=0 switches it off, for comparing.
const FastEnv = {
  on: !/[?&]fastenv=0/.test(location.search),
  uSH: { value: Array.from({ length: 9 }, () => new THREE.Vector3()) },
  uG: { value: 1.1 },                    // brightness of the SH light against the cube-UV light it replaces (measured: the matte world came out 5-8 % darker without it)
  gain: 1.04,                            // the faint specular lobe a Lambert surface lacks (sunlit matte surfaces came out about 5 % darker)
  map: new Map(),

  // three.js r158: the two places of lights_fragment_maps that read the environment map; everything added is behind #ifdef FAST_ENV, so no other material changes
  install() {
    const C = THREE.ShaderChunk, src = C.lights_fragment_maps;
    const diffuse = '#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )\n\t\tiblIrradiance += getIBLIrradiance( geometryNormal );\n\t#endif', spec = '#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )';
    if (THREE.REVISION !== '158' || !src.includes(diffuse) || !src.includes(spec)) { this.on = false; return; }               // another three.js: keep the standard lighting
    C.lights_pars_begin += `
#ifdef FAST_ENV
uniform vec3 uSH[9]; uniform float uEnvK, uEnvG;
vec3 fastEnvE( const in vec3 n ) {
  float x = n.x, y = n.y, z = n.z;
  vec3 r = uSH[0] * 0.886227;
  r += uSH[1] * 1.023328 * y; r += uSH[2] * 1.023328 * z; r += uSH[3] * 1.023328 * x;
  r += uSH[4] * 0.858086 * x * y; r += uSH[5] * 0.858086 * y * z; r += uSH[6] * ( 0.743125 * z * z - 0.247708 ); r += uSH[7] * 0.858086 * x * z; r += uSH[8] * 0.429043 * ( x * x - y * y );
  return max( r, vec3( 0.0 ) );
}
#endif
`;
    C.lights_fragment_maps = src.replace(diffuse, '#ifdef FAST_ENV\n\t\t#ifdef STANDARD\n\t\t\tiblIrradiance += fastEnvE( inverseTransformDirection( geometryNormal, viewMatrix ) ) * uEnvK * uEnvG;\n\t\t#else\n\t\t\tirradiance += fastEnvE( inverseTransformDirection( geometryNormal, viewMatrix ) ) * uEnvK * uEnvG;\n\t\t#endif\n\t#elif defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )\n\t\tiblIrradiance += getIBLIrradiance( geometryNormal );\n\t#endif')
      .replace(spec, spec + ' && !defined( FAST_ENV )');
  },

  // the sky as the environment sees it (SKY_HDR_FRAG: the photo turned by yaw, clamped, exposure, gain, the ground below the horizon) integrated over the sphere into SH coefficients (radiance)
  update() {
    if (!this.on) return;
    const S = SkySys, h = S.hdr[S.key], photo = !!(h && h.ok), hu = S.hdrMat.uniforms, half = THREE.DataUtils.fromHalfFloat;
    const gain = SKY_ENV[S.key] || 1, expo = SKY_EXPO[S.key] || 1, clampV = 6, NX = 128, NY = 64;
    const sh = Array.from({ length: 9 }, () => new THREE.Vector3()), basis = new Array(9).fill(0), d = new THREE.Vector3();
    const hor = hu.horizon.value, gr = S.u.groundCol.value, zen = S.u.zenith.value, yaw = hu.yaw.value, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const img = photo ? h.tex.image : null, W = img ? img.width : 0, H = img ? img.height : 0, dat = img ? img.data : null;
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };          // GLSL smoothstep (the edges may be reversed)
    let tw = 0;
    for (let j = 0; j < NY; j++) {
      const el = (0.5 - (j + 0.5) / NY) * Math.PI, ce = Math.cos(el), se = Math.sin(el);
      for (let i = 0; i < NX; i++) {
        const az = ((i + 0.5) / NX - 0.5) * 6.283185307; d.set(ce * Math.cos(az), se, ce * Math.sin(az));
        let r, g, b;
        if (photo) {
          const rx = cy * d.x + sy * d.z, rz = -sy * d.x + cy * d.z, u = Math.atan2(rz, rx) * 0.15915494 + 0.5, v = Math.asin(Math.max(-1, Math.min(1, d.y))) * 0.31830989 + 0.5;
          const x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(H - 1, Math.floor((1 - v) * H)), k = (y * W + x) * 4;
          r = Math.min(half(dat[k]), clampV) * expo * gain; g = Math.min(half(dat[k + 1]), clampV) * expo * gain; b = Math.min(half(dat[k + 2]), clampV) * expo * gain;
        } else { const t = Math.sqrt(Math.max(0, d.y)); r = hor.r + (zen.r - hor.r) * t; g = hor.g + (zen.g - hor.g) * t; b = hor.b + (zen.b - hor.b) * t; }          // (the generated sky, until the photo has arrived)
        const below = ss(0.012, -0.035, d.y), gm = ss(0, -0.3, d.y);
        r += (hor.r + (gr.r - hor.r) * gm - r) * below; g += (hor.g + (gr.g - hor.g) * gm - g) * below; b += (hor.b + (gr.b - hor.b) * gm - b) * below;
        THREE.SphericalHarmonics3.getBasisAt(d, basis); tw += ce;
        for (let q = 0; q < 9; q++) { sh[q].x += basis[q] * r * ce; sh[q].y += basis[q] * g * ce; sh[q].z += basis[q] * b * ce; }
      }
    }
    const norm = 4 * Math.PI / tw;
    for (let q = 0; q < 9; q++) this.uSH.value[q].copy(sh[q]).multiplyScalar(norm);
  },

  // whether a Standard material (or the options for one) is matte enough for Lambert shading
  eligible(o) { return (o.metalness || 0) < 0.25 && (o.roughness === undefined ? 1 : o.roughness) >= 0.5 && !o.clearcoat && !o.transmission && !o.transparent && !o.metalnessMap; },

  // gives a Lambert material the SH light. onBeforeCompile is intercepted so that a material may still get its own (wind, terrain blending, grass blades) assigned afterwards
  hook(m, k) {
    let inner = m.onBeforeCompile; const me = this, kU = { value: k };
    const wrap = function (sh, r) { if (inner) inner.call(this, sh, r); sh.uniforms.uSH = me.uSH; sh.uniforms.uEnvG = me.uG; sh.uniforms.uEnvK = kU; };
    Object.defineProperty(m, 'onBeforeCompile', { get: () => wrap, set: f => { inner = f; }, configurable: true });
    m.customProgramCacheKey = () => (inner ? inner.toString() : '') + '|fastenv';
    m.defines = Object.assign({}, m.defines, { FAST_ENV: '' });
    m._fe = true;
    return m;
  },

  // same options as MeshStandardMaterial: Lambert + SH for a matte surface, the full model for the rest
  make(o) {
    if (!this.on || !this.eligible(o)) return new THREE.MeshStandardMaterial(o);
    const { roughness, metalness, envMapIntensity, ...rest } = o, m = new THREE.MeshLambertMaterial(rest);
    m.color.multiplyScalar(this.gain);
    return this.hook(m, envMapIntensity === undefined ? 1 : envMapIntensity);
  },

  // a Lambert copy of an existing Standard material (props out of GLB files)
  lambertFrom(m) {
    const L = new THREE.MeshLambertMaterial({
      color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, normalMap: m.normalMap, normalScale: m.normalScale, alphaMap: m.alphaMap, alphaTest: m.alphaTest,
      aoMap: m.aoMap, aoMapIntensity: m.aoMapIntensity, side: m.side, transparent: m.transparent, opacity: m.opacity, vertexColors: m.vertexColors, fog: m.fog, flatShading: m.flatShading, depthWrite: m.depthWrite, alphaToCoverage: m.alphaToCoverage
    });
    L.name = m.name; L.userData = m.userData; L.onBeforeCompile = m.onBeforeCompile; L.color.multiplyScalar(this.gain);
    return this.hook(L, m.envMapIntensity === undefined ? 1 : m.envMapIntensity);
  },

  // the meshes under root: every matte Standard material is swapped for its Lambert copy (one copy per material)
  convertTree(root) {
    if (!this.on) return 0;
    let n = 0;
    const conv = m => {
      if (!m || m._fe || (m.type !== 'MeshStandardMaterial' && m.type !== 'MeshPhysicalMaterial') || !this.eligible(m)) return m;
      let k = this.map.get(m); if (!k) { k = this.lambertFrom(m); this.map.set(m, k); }
      return k;
    };
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      const nm = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
      if (nm !== o.material) { o.material = nm; n++; }
    });
    return n;
  }
};
FastEnv.install();
