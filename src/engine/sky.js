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
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.45));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(sd, 1400.0) * 10.0 + pow(sd, 70.0) * 0.35 + pow(sd, 6.0) * 0.14);
  if (stars > 0.01 && h > 0.0) {
    vec3 sp = floor(d * 240.0); float s = hash(sp.xy + sp.z * 17.31);
    float tw = step(0.9962, s) * (0.45 + 0.55 * hash(sp.yz + 3.1));
    col += vec3(0.85, 0.92, 1.0) * tw * stars * smoothstep(0.02, 0.18, h) * 1.4;
  }
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.14) * 0.6 + vec2(time * 0.004, time * 0.0025);
    float c = fbm(uv * 2.2) * 0.8 + 0.2 * fbm(uv * 7.0);
    c = smoothstep(0.64 - cloudCover * 0.34, 0.84 - cloudCover * 0.2, c);
    float lit = 0.6 + 0.4 * clamp(dot(normalize(vec3(d.x, 0.6, d.z)), sunDir) * 0.5 + 0.5, 0.0, 1.0);
    vec3 cc = mix(horizon, vec3(1.0), 0.72) * lit + sunCol * 0.12 * pow(sd, 3.0);
    col = mix(col, cc, c * smoothstep(0.0, 0.2, h) * 0.92);
  }
  col = mix(col, mix(horizon * 0.9, groundCol, smoothstep(0.0, -0.3, h)), smoothstep(0.015, -0.03, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SkySys = {
  mesh: null, u: null, sun: null, hemi: null, envTex: null, pmrem: null, key: 'day', tod: null, sunDir: new THREE.Vector3(0, 1, 0),

  build(scene, renderer) {
    this.u = {
      sunDir: { value: this.sunDir }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunCol: { value: new THREE.Color() }, groundCol: { value: new THREE.Color(0.07, 0.07, 0.05) },
      time: { value: 0 }, cloudCover: { value: 0.5 }, stars: { value: 0 }
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 24), mat);
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
    const el = t.sunEl * Math.PI / 180, az = t.sunAz * Math.PI / 180;
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    this.u.zenith.value.setRGB(...t.zenith); this.u.horizon.value.setRGB(...t.horizon); this.u.sunCol.value.setRGB(...t.sun);
    this.u.cloudCover.value = t.cloud; this.u.stars.value = t.stars || 0;
    this.sun.color.setRGB(...t.sun); this.sun.intensity = t.sunI;
    this.hemi.intensity = t.hemi;
    this.hemi.color.setRGB(t.horizon[0] * 0.9 + 0.1, t.horizon[1] * 0.9 + 0.1, t.horizon[2] * 0.95 + 0.15);
    this.scene.fog.color.setRGB(t.horizon[0] * 0.95, t.horizon[1] * 0.95, t.horizon[2] * 0.95);
    this.scene.fog.density = t.fog;
    this.renderer.toneMappingExposure = t.exposure;
    this.makeEnv();
  },

  makeEnv() {
    const tmp = new THREE.Scene(), m = this.mesh.clone();
    tmp.add(m);
    if (this.envTex) this.envTex.dispose();
    this.envTex = this.pmrem.fromScene(tmp, 0, 0.1, 100).texture;
    this.scene.environment = this.envTex;
    if (G.vmScene) G.vmScene.environment = this.envTex;
    if (typeof Menu !== 'undefined' && Menu.scene) Menu.scene.environment = this.envTex;
  },

  update(dt, cam) {
    this.u.time.value += dt;
    this.mesh.position.copy(cam.position);
    const ex = this.extent || 80, step = (ex * 2) / (this.shadowSize || 2048);
    const tx = Math.round(cam.position.x / step) * step, tz = Math.round(cam.position.z / step) * step;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunDir.x * 200, this.sunDir.y * 200, tz + this.sunDir.z * 200);
    this.sun.target.updateMatrixWorld();
  }
};
