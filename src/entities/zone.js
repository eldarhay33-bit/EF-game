// Shrinking safe zone with an animated storm wall.
const ZONE_VERT = `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ZONE_FRAG = `
precision highp float;
varying vec3 vW; uniform float time; uniform vec3 cam;
void main() {
  float h = vW.y;
  float stripes = 0.5 + 0.5 * sin(h * 0.35 - time * 1.6) * sin((vW.x + vW.z) * 0.05 + time * 0.4);
  float ground = smoothstep(60.0, 0.0, h);
  float near = smoothstep(260.0, 25.0, distance(vW.xz, cam.xz));
  float a = (0.13 + stripes * 0.1 + ground * 0.22) * near;
  vec3 c = mix(vec3(0.42, 0.18, 0.9), vec3(0.75, 0.45, 1.0), stripes);
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const Zone = {
  cx: 0, cz: 0, r: 330, from: null, to: null, phase: -1, state: 'idle', timer: 0, total: 1, tick: 0, wall: null, dmg: 0, u: null,
  phases: [
    { wait: 45, shrink: 40, r: 190, dmg: 1 },
    { wait: 32, shrink: 32, r: 115, dmg: 2 },
    { wait: 26, shrink: 26, r: 62,  dmg: 4 },
    { wait: 20, shrink: 22, r: 28,  dmg: 7 },
    { wait: 15, shrink: 18, r: 6,   dmg: 12 }
  ],

  init(scene) {
    this.u = { time: { value: 0 }, cam: { value: new THREE.Vector3() } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: ZONE_VERT, fragmentShader: ZONE_FRAG, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
    this.wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 500, 72, 1, true), mat);
    this.wall.position.y = 200; this.wall.frustumCulled = false; this.wall.renderOrder = 4;
    scene.add(this.wall);
  },

  reset() {
    this.cx = 0; this.cz = 0; this.r = 330; this.phase = -1; this.state = 'idle'; this.timer = 0; this.tick = 0; this.to = null; this.from = null; this.dmg = 0; this.supplyAt = 0;
    this.wall.scale.set(this.r, 1, this.r);
  },

  begin() { this.phase = -1; this.nextPhase(); },

  // network: the host owns the zone, guests copy it (see Net)
  snapshot() { return { cx: r2(this.cx), cz: r2(this.cz), r: r2(this.r), ph: this.phase, st: this.state, tm: r2(this.timer), tt: r2(this.total), dm: this.dmg, f: this.from, to: this.to }; },
  apply(z) { this.cx = z.cx; this.cz = z.cz; this.r = z.r; this.phase = z.ph; this.state = z.st; this.timer = z.tm; this.total = z.tt || 1; this.dmg = z.dm; this.from = z.f; this.to = z.to; },

  nextPhase() {
    this.phase++;
    if (this.phase >= this.phases.length) { this.state = 'final'; return; }
    const p = this.phases[this.phase], maxOff = Math.max(0, this.r - p.r) * 0.8;
    this.from = { x: this.cx, z: this.cz, r: this.r };
    for (let i = 0; i < 40; i++) {            // never centre the safe zone in the sea
      const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * maxOff, x = this.cx + Math.cos(a) * d, z = this.cz + Math.sin(a) * d;
      this.to = { x, z, r: p.r };
      if (waterDepth(x, z) < 0.3 && seaAmount(x, z) < 0.05 && (p.r > 30 || (Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r + 8))) break;
    }
    this.state = 'wait'; this.timer = p.wait; this.total = p.wait; this.dmg = p.dmg;
    HUD.banner(I18n.t('zone.announce', { n: this.phase + 1, s: p.wait }), 4);
    this.supplyAt = this.phase >= 1 && this.phase <= 3 ? G.time + 6 : 0;
  },

  update(dt) {
    if (this.supplyAt && G.time >= this.supplyAt) { this.supplyAt = 0; Supply.dropForZone(); }
    if (this.state === 'wait') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'shrink'; this.timer = this.phases[this.phase].shrink; this.total = this.timer;
        this.from = { x: this.cx, z: this.cz, r: this.r };
        HUD.banner(I18n.t('zone.shrinking'), 3);
      }
    } else if (this.state === 'shrink') {
      this.timer -= dt;
      const k = 1 - clamp(this.timer / this.total, 0, 1);
      this.cx = lerp(this.from.x, this.to.x, k); this.cz = lerp(this.from.z, this.to.z, k); this.r = lerp(this.from.r, this.to.r, k);
      if (this.timer <= 0 && !this.remote) this.nextPhase();
    }
    this.wall.position.x = this.cx; this.wall.position.z = this.cz; this.wall.scale.set(this.r, 1, this.r);
    this.u.time.value += dt; this.u.cam.value.copy(G.camera.position);
    this.tick += dt;
    if (this.tick >= 1) {
      this.tick = 0;
      const dmg = this.dmg || 0.5, out = a => Math.hypot(a.pos.x - this.cx, a.pos.z - this.cz) > this.r;
      if (Player.alive && (Player.phase === 'ground' || Player.phase === 'riding') && out(Player)) Player.takeDamage(dmg, null, false, 'storm');
      for (const b of G.bots) if (b.alive && b.state !== 'drop' && b.state !== 'dropwait' && out(b)) b.takeDamage(dmg, null, false, 'storm');
    }
  },

  info() {
    if (this.state === 'final') return I18n.t('hud.final');
    if (this.phase < 0) return I18n.t('hud.pre');
    const t = Math.max(0, Math.ceil(this.timer)), mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    return I18n.t(this.state === 'wait' ? 'zone.wait' : 'zone.shrink', { n: this.phase + 1, t: mm + ':' + ss });
  },

  isOutside(a) { return Math.hypot(a.pos.x - this.cx, a.pos.z - this.cz) > this.r; }
};
