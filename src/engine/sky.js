// Sky dome (gradient, sun, animated clouds), sun/ambient lighting, fog and an image-based-lighting environment map.
const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const SKY_FRAG = `
precision highp float;
uniform vec3 sunDir, zenith, horizon, sunCol, groundCol;
uniform float time, cloudCover, stars;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.3; a *= 0.5; } return s; }
float fbm3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.07 + 5.1; a *= 0.5; } return s; }
// domain-warped cumulus: puffy, billowing shapes instead of flat noise
float cloudDensity(vec2 uv, float cover) {
  vec2 w = vec2(fbm3(uv * 1.3 + 3.1), fbm3(uv * 1.3 + 9.7));
  float c = fbm(uv * 2.0 + w * 0.7);
  return smoothstep(0.66 - cover * 0.36, 0.92 - cover * 0.2, c);
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y, up = clamp(h, 0.0, 1.0);
  float sd = max(dot(d, sunDir), 0.0);
  // atmosphere: deep blue overhead, bright warm haze at the horizon, glow around the sun
  vec3 col = mix(horizon, zenith, pow(up, 0.42));
  col = mix(col, horizon * 1.1, pow(1.0 - up, 6.0) * 0.5);
  col += sunCol * (pow(sd, 1600.0) * 14.0 + pow(sd, 90.0) * 0.5 + pow(sd, 8.0) * 0.2);
  col += sunCol * 0.24 * pow(sd, 2.0) * pow(1.0 - up, 3.0);
  if (stars > 0.01 && h > 0.0) {
    vec3 sp = floor(d * 240.0); float s = hash(sp.xy + sp.z * 17.31);
    float tw = step(0.9962, s) * (0.45 + 0.55 * hash(sp.yz + 3.1));
    col += vec3(0.85, 0.92, 1.0) * tw * stars * smoothstep(0.02, 0.18, h) * 1.4;
  }
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 0.55 + vec2(time * 0.0045, time * 0.0028);
    float dens = cloudDensity(uv, cloudCover);
    // self shadowing: look a little towards the sun, thicker cloud there darkens this spot
    float dens2 = cloudDensity(uv + normalize(sunDir.xz + 1e-4) * 0.07, cloudCover);
    float shade = clamp(1.0 - (dens2 - dens) * 2.4 - dens * 0.22, 0.0, 1.0);
    vec3 lit = mix(horizon, vec3(1.0), 0.9) * (0.66 + 0.5 * shade);
    vec3 dark = mix(zenith, horizon, 0.55) * 0.8 + 0.1;
    vec3 cc = mix(dark, lit, shade);
    cc += sunCol * (0.4 * pow(sd, 4.0) * (1.0 - dens * 0.6));              // glow through the cloud near the sun
    cc += sunCol * dens * (1.0 - dens) * pow(sd, 3.0) * 1.6;                // silver lining on the edges
    col = mix(col, cc, dens * smoothstep(0.0, 0.18, h) * 0.96);
    vec2 cu = vec2(uv.x * 0.9 + 4.0, uv.y * 3.4) + time * 0.002;             // thin high cirrus
    float ci = smoothstep(0.55, 0.88, fbm3(cu * 2.4)) * 0.32 * smoothstep(0.05, 0.3, h);
    col = mix(col, vec3(0.92 + 0.3 * pow(sd, 2.0)), ci);
  }
  col = mix(col, mix(horizon * 0.9, groundCol, smoothstep(0.0, -0.3, h)), smoothstep(0.015, -0.03, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Photographic sky: one Poly Haven HDRI (CC0, 2K) per time of day, drawn on the same dome. The picture is turned around the vertical axis so that the sun in
// it stands where the time of day wants it, and the same picture is baked into the image-based lighting of everything that is shiny.
const SKY_HDR_FRAG = `
precision highp float;
uniform sampler2D tSky;
uniform float yaw, expo, gain, clampV;
uniform vec3 groundCol, horizon;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float c = cos(yaw), s = sin(yaw);
  vec3 r = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
  vec2 uv = vec2(atan(r.z, r.x) * 0.15915494 + 0.5, asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  vec3 col = min(texture2D(tSky, uv).rgb, vec3(clampV)) * expo * gain;
  float h = d.y;
  col = mix(col, mix(horizon, groundCol, smoothstep(0.0, -0.3, h)), smoothstep(0.012, -0.035, h));      // below the horizon the terrain and the sea cover it anyway
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const SKY_FILES = {                                                             // time of day -> photo
  day: 'kloofendal_48d_partly_cloudy_puresky_2k', golden: 'belfast_sunset_puresky_2k', overcast: 'overcast_soil_puresky_2k', night: 'kloppenheim_02_puresky_2k'
};
const _lx = new THREE.Vector3(), _ly = new THREE.Vector3();
const SKY_CLAMP = 16;                                                          // the sun is a hundred thousand times brighter than the sky: cap it so that the bloom does not whiten the screen
const SKY_EXPO = { day: 1.0, golden: 0.55, overcast: 0.65, night: 0.7 };       // brightness of the picture per time of day
const SKY_ENV = { day: 1.0, golden: 1.0, overcast: 1.2, night: 2.2 };          // brightness of the image-based light baked from it

const SkySys = {
  mesh: null, u: null, sun: null, hemi: null, envTex: null, pmrem: null, key: 'day', tod: null, sunDir: new THREE.Vector3(0, 1, 0), hdr: {}, loading: {}, hdrMat: null, procMat: null,

  // phones and weak machines load the 1024 px pictures (a quarter of the size) and only the one in use
  lite() { return (typeof Device !== 'undefined' && Device.phone) || (typeof Game !== 'undefined' && Game.qualityKey === 'low'); },

  // loads and analyses the photo of a time of day (once); resolves true when it can be used, false (never throws) when the file is missing
  loadHdr(key) {
    if (this.hdr[key]) return Promise.resolve(this.hdr[key].ok);
    if (this.loading[key]) return this.loading[key];
    const file = SKY_FILES[key]; if (!file) return Promise.resolve(false);
    return (this.loading[key] = (async () => {
      try {
        const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
        const tex = await new RGBELoader().loadAsync('assets/sky/' + (this.lite() ? 'lite/' : '') + file + '.hdr?v=' + (window.ASSET_VER || 0));
        tex.mapping = THREE.EquirectangularReflectionMapping; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
        this.hdr[key] = Object.assign({ tex, ok: true }, this.analyse(tex));
        return true;
      } catch (e) { this.hdr[key] = { ok: false }; console.warn('[sky] photo of "' + key + '" unavailable, the generated sky is used', e && e.message); return false; }
      finally { delete this.loading[key]; }
    })());
  },

  // finds the sun (or moon) in the picture and the colour of the air just above the horizon (used for the fog)
  analyse(tex) {
    const { data, width: W, height: H } = tex.image, half = THREE.DataUtils.fromHalfFloat, n = W * H;
    let best = 0, bi = 0;
    for (let i = 0; i < n; i++) { const v = data[i * 4 + 1]; if (v > best) { best = v; bi = i; } }                // positive half floats order like integers
    const peak = half(best), bx = bi % W, by = (bi / W) | 0;
    // the first row of the data is the zenith (the loader flips the picture on upload)
    const dir = (x, y) => { const a = ((x + 0.5) / W - 0.5) * 6.283185307, e = (0.5 - (y + 0.5) / H) * Math.PI, ce = Math.cos(e); return [ce * Math.cos(a), Math.sin(e), ce * Math.sin(a)]; };
    let sx = 0, sy = 0, sz = 0, sw = 0;
    for (let dy = -22; dy <= 22; dy++) for (let dx = -22; dx <= 22; dx++) {
      const x = (bx + dx + W) % W, y = by + dy; if (y < 0 || y >= H) continue;
      const v = half(data[(y * W + x) * 4 + 1]) - peak * 0.2; if (v <= 0) continue;
      const d = dir(x, y); sx += d[0] * v; sy += d[1] * v; sz += d[2] * v; sw += v;
    }
    const l = Math.hypot(sx, sy, sz) || 1; sx /= l; sy /= l; sz /= l;
    const hasSun = peak > 12;
    // fog colour: the mean of a ring 3-9 degrees above the horizon, left out around the sun
    let r = 0, g = 0, b = 0, cnt = 0;
    for (const eld of [3, 6, 9]) for (let ad = 0; ad < 360; ad += 6) {
      const a = ad * Math.PI / 180, e = eld * Math.PI / 180, dx = Math.cos(e) * Math.cos(a), dy = Math.sin(e), dz = Math.cos(e) * Math.sin(a);
      if (peak > 3 && dx * sx + dy * sy + dz * sz > 0.64) continue;
      const x = Math.min(W - 1, Math.floor((a / 6.283185307 + 0.5) % 1 * W)), y = Math.min(H - 1, Math.floor((0.5 - e / Math.PI) * H)), k = (y * W + x) * 4;
      r += half(data[k]); g += half(data[k + 1]); b += half(data[k + 2]); cnt++;
    }
    return { hasSun, peak, sun: [sx, sy, sz], az: Math.atan2(sz, sx), el: Math.asin(clamp(sy, -1, 1)), fog: [r / cnt, g / cnt, b / cnt] };
  },

  build(scene, renderer) {
    this.u = {
      sunDir: { value: this.sunDir }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunCol: { value: new THREE.Color() }, groundCol: { value: new THREE.Color(0.07, 0.07, 0.05) },
      time: { value: 0 }, cloudCover: { value: 0.5 }, stars: { value: 0 }
    };
    const mat = this.procMat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
    this.hdrMat = new THREE.ShaderMaterial({
      uniforms: { tSky: { value: null }, yaw: { value: 0 }, expo: { value: 1 }, gain: { value: 1 }, clampV: { value: SKY_CLAMP }, groundCol: this.u.groundCol, horizon: { value: new THREE.Color() } },
      vertexShader: SKY_VERT, fragmentShader: SKY_HDR_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 32), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6b5a40, 0.5);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.FogExp2(0xb0c8e0, 0.002);
    this.scene = scene; this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
  },

  setShadows(size, extent) {
    const s = this.sun;
    s.shadow.mapSize.set(size, size);
    if (s.shadow.map) { s.shadow.map.dispose(); s.shadow.map = null; }
    const c = s.shadow.camera;
    c.left = -extent; c.right = extent; c.top = extent; c.bottom = -extent; c.near = 1; c.far = 420; c.updateProjectionMatrix();
    s.shadow.bias = -0.0004; s.shadow.normalBias = 0.05;
    this.extent = extent; this.shadowSize = size;
  },

  apply(key) {
    const t = TODS[key] || TODS.day; this.key = key; this.tod = t;
    const h = this.hdr[key], photo = !!(h && h.ok);
    let el = t.sunEl * Math.PI / 180; const az = t.sunAz * Math.PI / 180;
    if (photo && h.hasSun) el = Math.max(h.el, 0.14);                       // the light comes from where the sun (moon) is in the picture (not lower than 8 degrees: long shadows hide too much)
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    this.u.zenith.value.setRGB(...t.zenith); this.u.horizon.value.setRGB(...t.horizon); this.u.sunCol.value.setRGB(...t.sun);
    this.u.cloudCover.value = t.cloud; this.u.stars.value = t.stars || 0;
    this.sun.color.setRGB(...t.sun); this.sun.intensity = t.sunI;
    this.hemi.intensity = t.hemi;
    let fog = [t.horizon[0] * 0.95, t.horizon[1] * 0.95, t.horizon[2] * 0.95];
    if (photo) {
      const ex = SKY_EXPO[key] || 1, hu = this.hdrMat.uniforms;
      fog = h.fog.map(v => v * ex * 0.95);                                  // the fog is the colour of the air at the horizon of the picture, so land fades into the sky
      hu.tSky.value = h.tex; hu.expo.value = ex; hu.yaw.value = h.hasSun ? (Math.PI / 2 - az) - h.az : 0; hu.horizon.value.setRGB(fog[0], fog[1], fog[2]);
      this.mesh.material = this.hdrMat;
    } else {
      this.mesh.material = this.procMat;
      if (!h) this.loadHdr(key).then(ok => { if (ok && this.key === key) { this.apply(key); if (typeof Game !== 'undefined' && Game.syncEnv) Game.syncEnv(); } });   // swap to the photo as soon as it has arrived
    }
    this.hemi.color.setRGB(fog[0] * 0.9 + 0.1, fog[1] * 0.9 + 0.1, fog[2] * 0.95 + 0.15);
    this.scene.fog.color.setRGB(fog[0], fog[1], fog[2]);
    this.scene.fog.density = t.fog;
    this.renderer.toneMappingExposure = t.exposure;
    this.makeEnv();
  },

  // the other times of day are fetched quietly in the background so that a duel arena or a theme change finds them ready
  preloadRest() {
    const keys = Object.keys(SKY_FILES).filter(k => !this.hdr[k]); let i = 0;
    const next = () => { if (i < keys.length) this.loadHdr(keys[i++]).then(() => setTimeout(next, 1500)); };
    setTimeout(next, 4000);
  },

  makeEnv() {
    const tmp = new THREE.Scene(), m = this.mesh.clone(), hu = this.hdrMat.uniforms;
    tmp.add(m);
    if (this.envTex) this.envTex.dispose();
    hu.gain.value = SKY_ENV[this.key] || 1; hu.clampV.value = 6;             // the sun disc must not flood the ambient light
    this.envTex = this.pmrem.fromScene(tmp, 0, 0.1, 100).texture;
    hu.gain.value = 1; hu.clampV.value = SKY_CLAMP;
    this.scene.environment = this.envTex;
    FastEnv.update();                                                         // the matte surfaces take the same sky as nine SH coefficients (engine/fastenv.js)
    if (G.vmScene) G.vmScene.environment = this.envTex;
    if (typeof Menu !== 'undefined' && Menu.scene) Menu.scene.environment = this.envTex;
  },

  update(dt, cam) {
    this.u.time.value += dt;
    this.mesh.position.copy(cam.position);
    // the shadow map follows the camera in whole texels of the LIGHT's own grid (not of the world's): shadow edges then keep their place on the ground while the player moves, instead of shimmering
    const ex = this.extent || 80, step = (ex * 2) / (this.shadowSize || 2048), z = this.sunDir, x = _lx.set(0, 1, 0).cross(z).normalize(), y = _ly.copy(z).cross(x);
    const cx = cam.position.dot(x), cy = cam.position.dot(y), dx = Math.round(cx / step) * step - cx, dy = Math.round(cy / step) * step - cy;
    const tx = cam.position.x + x.x * dx + y.x * dy, ty = cam.position.y + x.y * dx + y.y * dy, tz = cam.position.z + x.z * dx + y.z * dy;
    this.sun.target.position.set(tx, ty, tz);
    this.sun.position.set(tx + z.x * 200, ty + z.y * 200, tz + z.z * 200);
    this.sun.target.updateMatrixWorld();
  }
};
