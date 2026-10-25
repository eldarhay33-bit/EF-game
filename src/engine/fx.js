// Visual effects: instanced billboard particles (smoke + additive glow), bullet decals, tracers, impacts, explosions, smoke clouds, screen shake.
const PARTICLE_VERT = `
attribute vec3 offset; attribute float psize; attribute vec4 pcolor;
varying vec4 vColor; varying vec2 vUv;
void main() {
  vColor = pcolor; vUv = position.xy * 2.0;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 p = offset + (right * position.x + up * position.y) * psize;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const PARTICLE_FRAG = `
precision highp float;
varying vec4 vColor; varying vec2 vUv;
uniform float soft;
void main() {
  float d = length(vUv);
  float a = smoothstep(1.0, mix(0.55, 0.0, soft), d);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class ParticlePool {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry(); g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    this.off = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.off.setUsage(THREE.DynamicDrawUsage);
    this.sz = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.sz.setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.col.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('offset', this.off); g.setAttribute('psize', this.sz); g.setAttribute('pcolor', this.col);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG, uniforms: { soft: { value: additive ? 1 : 0.6 } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    const N = max;
    this.vx = new Float32Array(N); this.vy = new Float32Array(N); this.vz = new Float32Array(N);
    this.life = new Float32Array(N); this.maxLife = new Float32Array(N); this.s0 = new Float32Array(N); this.s1 = new Float32Array(N);
    this.c = new Float32Array(N * 6);     // r,g,b,a0,a1,gravity
    this.drag = new Float32Array(N);
    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a0, a1, grav = 0, drag = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.drag[i] = drag;
    const c = i * 6; this.c[c] = r; this.c[c + 1] = g; this.c[c + 2] = b; this.c[c + 3] = a0; this.c[c + 4] = a1; this.c[c + 5] = grav;
  }

  copy(dst, src) {
    this.px[dst] = this.px[src]; this.py[dst] = this.py[src]; this.pz[dst] = this.pz[src];
    this.vx[dst] = this.vx[src]; this.vy[dst] = this.vy[src]; this.vz[dst] = this.vz[src];
    this.life[dst] = this.life[src]; this.maxLife[dst] = this.maxLife[src]; this.s0[dst] = this.s0[src]; this.s1[dst] = this.s1[src]; this.drag[dst] = this.drag[src];
    for (let k = 0; k < 6; k++) this.c[dst * 6 + k] = this.c[src * 6 + k];
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.n--; if (i < this.n) this.copy(i, this.n); i--; continue; }
      const c = i * 6, t = 1 - this.life[i] / this.maxLife[i], dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= dr; this.vy[i] = this.vy[i] * dr - this.c[c + 5] * dt; this.vz[i] *= dr;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
    }
    const o = this.off.array, s = this.sz.array, col = this.col.array;
    for (let i = 0; i < this.n; i++) {
      const c = i * 6, t = 1 - this.life[i] / this.maxLife[i];
      o[i * 3] = this.px[i]; o[i * 3 + 1] = this.py[i]; o[i * 3 + 2] = this.pz[i];
      s[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      col[i * 4] = this.c[c]; col[i * 4 + 1] = this.c[c + 1]; col[i * 4 + 2] = this.c[c + 2]; col[i * 4 + 3] = this.c[c + 3] + (this.c[c + 4] - this.c[c + 3]) * t;
    }
    this.geo.instanceCount = this.n;
    this.off.needsUpdate = this.sz.needsUpdate = this.col.needsUpdate = true;
  }
}

const IMPACT_COL = {
  concrete: [0.62, 0.6, 0.57], rock: [0.5, 0.47, 0.43], wood: [0.45, 0.32, 0.2], metal: [0.6, 0.6, 0.62],
  grass: [0.3, 0.28, 0.18], sand: [0.78, 0.66, 0.45], gravel: [0.5, 0.45, 0.38], water: [0.8, 0.9, 1.0]
};

const FX = Object.assign(window.FX || {}, {
  smoke: null, glow: null, decals: [], decalI: 0, tracers: [], tracerPool: [], clouds: [], rings: [], shakeAmp: 0, shakeT: 0, flashT: 0,

  init(scene) {
    this.scene = scene;
    this.smoke = new ParticlePool(scene, 1400, false);
    this.glow = new ParticlePool(scene, 900, true);
    const dm = new THREE.MeshBasicMaterial({ map: Tex.t.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const geo = new THREE.PlaneGeometry(0.14, 0.14);
    for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(geo, dm); m.visible = false; scene.add(m); this.decals.push(m); }
    this.scorchMat = new THREE.MeshBasicMaterial({ map: Tex.t.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1).translate(0, 0, -0.5);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2);
  },

  reset() {
    this.smoke.n = 0; this.glow.n = 0; this.decals.forEach(d => d.visible = false);
    this.tracers.forEach(t => { t.visible = false; this.tracerPool.push(t); }); this.tracers.length = 0;
    this.clouds.length = 0; G.smokes.length = 0; this.rings.forEach(r => this.scene.remove(r.m)); this.rings.length = 0;
    this.shakeAmp = 0; this.flashT = 0;
  },

  decal(pos, n, mat, size, life = 40) {
    const d = this.decals[this.decalI++ % this.decals.length];
    d.material = mat; d.scale.setScalar(size / 0.14);
    d.position.copy(pos).addScaledVector(n, 0.012);
    d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    d.rotateZ(Math.random() * 6.28);
    d.visible = true; d.userData.t = life;
  },

  impact(pos, n, kind, wid) {
    const s = this.smoke, g = this.glow, c = IMPACT_COL[kind] || IMPACT_COL.concrete, big = wid === 'sniper' || wid === 'special' || wid === 'dmr' || wid === 'revolver';
    const cnt = kind === 'grass' || kind === 'sand' ? 3 : 4;
    for (let i = 0; i < cnt; i++) {
      const sp = 0.8 + Math.random() * 1.2;
      s.spawn(pos.x, pos.y, pos.z, n.x * sp + (Math.random() - 0.5) * 0.8, n.y * sp + 0.4 + Math.random() * 0.5, n.z * sp + (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.4, 0.05, big ? 0.5 : 0.32, c[0], c[1], c[2], 0.55, 0, 0, 2.2);
    }
    if (kind === 'metal' || kind === 'concrete' || kind === 'rock') {
      for (let i = 0; i < 5; i++) g.spawn(pos.x, pos.y, pos.z, n.x * 4 + (Math.random() - 0.5) * 5, n.y * 4 + Math.random() * 3, n.z * 4 + (Math.random() - 0.5) * 5, 0.2 + Math.random() * 0.2, 0.035, 0.01, 1, 0.75, 0.35, 1, 0, 9, 0);
    } else if (kind === 'wood') {
      for (let i = 0; i < 4; i++) s.spawn(pos.x, pos.y, pos.z, n.x * 3 + (Math.random() - 0.5) * 3, n.y * 3 + Math.random() * 2, n.z * 3 + (Math.random() - 0.5) * 3, 0.5, 0.04, 0.03, 0.5, 0.36, 0.2, 1, 0.6, 9, 0);
    } else if (kind === 'water') {
      for (let i = 0; i < 6; i++) s.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 2, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 2, 0.7, 0.08, 0.2, 0.9, 0.95, 1, 0.6, 0, 9, 0);
    }
    if (kind !== 'water' && kind !== 'grass' && kind !== 'sand' && kind !== 'gravel') this.decal(pos, n, this.decals[0].material, big ? 0.2 : 0.12);
    Sound.impact(kind === 'metal' ? 'metal' : kind === 'wood' ? 'wood' : 'rock', pos);
  },

  impactActor(pos, dir, head) {
    const s = this.smoke;
    for (let i = 0; i < (head ? 6 : 4); i++) s.spawn(pos.x, pos.y, pos.z, -dir.x * 1.5 + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.3, -dir.z * 1.5 + (Math.random() - 0.5) * 2, 0.45, 0.06, 0.22, 0.45, 0.04, 0.04, 0.8, 0, 7, 1.5);
    Sound.impact('flesh', pos);
  },

  tracer(from, to, wid, shooter) {
    const start = shooter && shooter.muzzleWorld ? shooter.muzzleWorld : from, len = start.distanceTo(to);
    if (len < 2.5) return;
    let t = this.tracerPool.pop();
    if (!t) { t = new THREE.Mesh(this.tracerGeo, this.tracerMat); t.frustumCulled = false; this.scene.add(t); }
    t.position.copy(start); t.lookAt(to); t.scale.set(wid === 'special' ? 6 : wid === 'sniper' ? 2.2 : 1.2, wid === 'special' ? 6 : wid === 'sniper' ? 2.2 : 1.2, Math.min(len, wid === 'special' ? len : 18));
    t.visible = true; t.userData.life = wid === 'special' ? 0.5 : 0.05; t.userData.end = to.clone(); t.userData.dir = to.clone().sub(start).normalize();
    t.userData.sp = wid === 'special' ? 0 : 260; t.userData.len = len; t.userData.o = start.clone();
    if (wid === 'special') { t.material = new THREE.MeshBasicMaterial({ color: 0x35f0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }); } else t.material = this.tracerMat;
    this.tracers.push(t);
  },

  shell(pos, dir) {
    this.smoke.spawn(pos.x, pos.y, pos.z, dir.x * 2 + (Math.random() - 0.5), 1.8 + Math.random(), dir.z * 2 + (Math.random() - 0.5), 0.8, 0.025, 0.02, 0.85, 0.65, 0.25, 1, 1, 14, 0);
  },

  muzzle(pos, dir, big) {
    const s = this.smoke;
    for (let i = 0; i < (big ? 4 : 2); i++) s.spawn(pos.x, pos.y, pos.z, dir.x * 1.5 + (Math.random() - 0.5) * 0.4, dir.y * 1.5 + 0.2, dir.z * 1.5 + (Math.random() - 0.5) * 0.4, 0.8, 0.06, big ? 0.7 : 0.4, 0.75, 0.75, 0.75, 0.22, 0, -0.3, 1);
  },

  dust(pos, vel, c, size = 0.5) {
    const col = c || [0.55, 0.5, 0.42];
    this.smoke.spawn(pos.x, pos.y + 0.1, pos.z, vel.x * 0.2 + (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.5, vel.z * 0.2 + (Math.random() - 0.5) * 0.6, 0.9, size * 0.4, size * 1.6, col[0], col[1], col[2], 0.4, 0, -0.2, 1.2);
  },

  explosion(pos, radius) {
    const s = this.smoke, g = this.glow, k = radius / 7;
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, e = Math.random() * 2.5; g.spawn(pos.x, pos.y + 0.5, pos.z, Math.cos(a) * e * k, 1 + Math.random() * 3 * k, Math.sin(a) * e * k, 0.35 + Math.random() * 0.35, 1.5 * k, 6 * k, 1, 0.55 + Math.random() * 0.3, 0.15, 0.95, 0, -2, 2.5); }
    for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, e = Math.random() * 4; s.spawn(pos.x, pos.y + 0.8, pos.z, Math.cos(a) * e * k, 1.5 + Math.random() * 4 * k, Math.sin(a) * e * k, 2.2 + Math.random() * 2, 1.2 * k, 7 * k, 0.16, 0.15, 0.14, 0.75, 0, -1.2, 0.8); }
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, e = 4 + Math.random() * 12; g.spawn(pos.x, pos.y + 0.4, pos.z, Math.cos(a) * e * k, 3 + Math.random() * 9 * k, Math.sin(a) * e * k, 0.7 + Math.random() * 0.7, 0.12, 0.02, 1, 0.65, 0.25, 1, 0, 16, 0.2); }
    for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28; s.spawn(pos.x + Math.cos(a) * 1.5, pos.y + 0.3, pos.z + Math.sin(a) * 1.5, Math.cos(a) * 9 * k, 0.4, Math.sin(a) * 9 * k, 1.1, 0.8 * k, 3.5 * k, 0.55, 0.5, 0.42, 0.55, 0, 0, 2.5); }
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.position.set(pos.x, pos.y + 0.3, pos.z); m.scale.setScalar(1); this.scene.add(m);
    this.rings.push({ m, t: 0, r: radius });
    const n = terrainNormal(pos.x, pos.z);
    const gy = terrainHeight(pos.x, pos.z);
    if (Math.abs(pos.y - gy) < 3) this.decal(new THREE.Vector3(pos.x, gy, pos.z), n, this.scorchMat, radius * 0.9, 90);
    const d = Math.hypot(G.camera.position.x - pos.x, G.camera.position.z - pos.z);
    this.shake(clamp(1 - d / 60, 0, 1) * 1.1 * k + 0.05, 0.7);
    if (d < 14) this.flashT = Math.max(this.flashT, clamp(1 - d / 14, 0, 1) * 0.5);
  },

  smokeCloud(pos, radius, dur) {
    const c = { x: pos.x, y: pos.y + 1.2, z: pos.z, r: 0.5, max: radius, t: 0, dur, emit: 0 };
    this.clouds.push(c); G.smokes.push(c);
  },

  shake(amp, dur) { if (amp > this.shakeAmp) { this.shakeAmp = amp; this.shakeT = dur; this.shakeDur = dur; } },

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i], u = t.userData; u.life -= dt;
      if (u.sp) { t.position.addScaledVector(u.dir, u.sp * dt); const rem = t.position.distanceTo(u.end); if (rem < 0.5 || u.life <= 0) { t.visible = false; this.tracerPool.push(t); this.tracers.splice(i, 1); } else t.scale.z = Math.min(t.scale.z, rem); }
      else {
        if (t.material !== this.tracerMat) t.material.opacity = Math.max(0, u.life * 2);
        if (u.life <= 0) { t.visible = false; if (t.material !== this.tracerMat) t.material.dispose(); this.tracerPool.push(t); this.tracers.splice(i, 1); }
      }
    }
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]; c.t += dt; c.r = Math.min(c.max, c.r + dt * 4.5);
      c.emit -= dt;
      if (c.emit <= 0 && c.t < c.dur - 4) {
        c.emit = 0.05;
        for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28, rr2 = Math.random() * c.r * 0.8; this.smoke.spawn(c.x + Math.cos(a) * rr2, c.y + (Math.random() - 0.3) * c.r * 0.7, c.z + Math.sin(a) * rr2, (Math.random() - 0.5) * 0.4, 0.1 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4, 5 + Math.random() * 2, c.max * 0.35, c.max * 0.55, 0.82, 0.84, 0.86, 0.75, 0, 0, 0); }
      }
      if (c.t >= c.dur) { this.clouds.splice(i, 1); const gi = G.smokes.indexOf(c); if (gi >= 0) G.smokes.splice(gi, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const k = r.t / 0.45;
      r.m.scale.setScalar(1 + k * r.r * 1.3); r.m.material.opacity = Math.max(0, 0.7 * (1 - k));
      if (k >= 1) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (const d of this.decals) if (d.visible) { d.userData.t -= dt; if (d.userData.t <= 0) d.visible = false; }
    this.smoke.update(dt); this.glow.update(dt);
    if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeAmp = 0; }
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt * 1.2);
  },

  shakeOffset(out) {
    if (this.shakeT <= 0) return out.set(0, 0, 0);
    const k = this.shakeAmp * (this.shakeT / (this.shakeDur || 1)) * 0.05;
    return out.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  },

  // floating dust motes and pollen near the camera for atmosphere
  ambient(dt, cam) {
    this.moteT = (this.moteT || 0) - dt;
    if (this.moteT > 0 || this.glow.n > 700) return;
    this.moteT = 0.09;
    const a = Math.random() * 6.28, r = 2 + Math.random() * 14;
    this.glow.spawn(cam.x + Math.cos(a) * r, cam.y + (Math.random() - 0.4) * 5, cam.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.3 + 0.25, 0.05, (Math.random() - 0.5) * 0.3, 6, 0.03, 0.03, 1, 0.92, 0.7, 0.0, 0.0);
    const last = this.glow.n - 1; this.glow.c[last * 6 + 3] = 0.28; this.glow.c[last * 6 + 4] = 0.02;
  },

  whiz(pos) { Sound.whiz(pos); }
});
