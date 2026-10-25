// Fully synthesised audio: layered gunshots, surface footsteps, explosions, engine, ambience, 3D positioning.
const GUNSND = {
  pistol:      { crack: [2800, 0.9, 0.05, 0.7],  noise: [1500, 0.12, 0.5],  thump: [170, 0.09, 0.5],  tail: 0.5 },
  revolver:    { crack: [1800, 0.7, 0.09, 1.0],  noise: [900, 0.22, 0.75],  thump: [105, 0.2, 0.9],   tail: 0.9 },
  smg:         { crack: [3400, 1.0, 0.035, 0.5], noise: [2200, 0.07, 0.35], thump: [210, 0.06, 0.35], tail: 0.35 },
  ar:          { crack: [2500, 0.8, 0.06, 0.75], noise: [1400, 0.12, 0.55], thump: [140, 0.1, 0.6],   tail: 0.6 },
  ak:          { crack: [2100, 0.7, 0.07, 0.85], noise: [1100, 0.15, 0.65], thump: [105, 0.14, 0.85], tail: 0.75 },
  dmr:         { crack: [1900, 0.7, 0.08, 0.9],  noise: [900, 0.2, 0.7],    thump: [90, 0.18, 0.9],   tail: 0.9 },
  shotgun:     { crack: [1300, 0.6, 0.12, 1.0],  noise: [700, 0.3, 0.95],   thump: [68, 0.26, 1.0],   tail: 1.0 },
  autoshotgun: { crack: [1500, 0.6, 0.09, 0.85], noise: [800, 0.22, 0.8],   thump: [80, 0.2, 0.9],    tail: 0.8 },
  sniper:      { crack: [1600, 0.6, 0.14, 1.0],  noise: [600, 0.45, 1.0],   thump: [52, 0.4, 1.15],   tail: 1.7 },
  minigun:     { crack: [2900, 0.9, 0.03, 0.42], noise: [1900, 0.06, 0.3],  thump: [170, 0.05, 0.3],  tail: 0.25 },
  rpg:         { crack: [900, 0.5, 0.2, 0.6],    noise: [400, 0.5, 0.9],    thump: [60, 0.35, 0.9],   tail: 1.2 }
};

const Sound = {
  ctx: null, master: null, revSend: null, noiseBuf: null, vol: 0.8, eng: null, amb: null, ambTimer: null,
  lis: { x: 0, y: 0, z: 0 },

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const len = Math.floor(c.sampleRate * 1.8), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const a = ir.getChannelData(ch); for (let i = 0; i < len; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const rev = c.createConvolver(); rev.buffer = ir;
    this.revSend = c.createGain(); this.revSend.gain.value = 0.35;
    this.revSend.connect(rev); rev.connect(this.master);
  },

  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; },

  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener, p = cam.position, f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    this.lis.x = p.x; this.lis.y = p.y; this.lis.z = p.z;
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  },

  // returns a gain node that feeds master (+reverb), positioned in 3D when pos is given
  bus(pos, rev = 0.3) {
    const c = this.ctx, g = c.createGain();
    if (pos) {
      const dx = pos.x - this.lis.x, dy = pos.y - this.lis.y, dz = pos.z - this.lis.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 3) {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(14000 / (1 + d * 0.035), 700, 14000);
        const p = c.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 10; p.rolloffFactor = 1.15; p.maxDistance = 600;
        if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
        g.connect(lp); lp.connect(p); p.connect(this.master);
        const rs = c.createGain(); rs.gain.value = rev * Math.min(1.5, 0.4 + d / 80); g.connect(rs); rs.connect(this.revSend);
        return g;
      }
    }
    g.connect(this.master);
    if (rev > 0) { const rs = c.createGain(); rs.gain.value = rev; g.connect(rs); rs.connect(this.revSend); }
    return g;
  },

  nb(bus, o) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.value = o.f || 1000; f.Q.value = o.q || 0.7;
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), c.currentTime + o.dur);
    const g = c.createGain(), t = c.currentTime, a = o.attack || 0.002;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t + (o.delay || 0), Math.random() * 1.5, o.dur + 0.05);
  },

  tn(bus, o) {
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain(), t = c.currentTime + (o.delay || 0);
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.vol, t + (o.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(bus); osc.start(t); osc.stop(t + o.dur + 0.02);
  },

  gun(id, pos, vol = 1) {
    if (!this.ctx) return;
    if (id === 'special') return this.special(pos);
    const s = GUNSND[id] || GUNSND.ar, bus = this.bus(pos, s.tail * 0.45);
    bus.gain.value = vol;
    this.nb(bus, { type: 'bandpass', f: s.crack[0], q: s.crack[1] * 2, dur: s.crack[2], vol: s.crack[3] });
    this.nb(bus, { type: 'lowpass', f: s.noise[0], f2: s.noise[0] * 0.3, dur: s.noise[1], vol: s.noise[2] });
    this.tn(bus, { f: s.thump[0], f2: s.thump[0] * 0.35, dur: s.thump[1], vol: s.thump[2], type: 'sine' });
  },

  special(pos) {
    if (!this.ctx) return;
    const bus = this.bus(pos, 0.9);
    this.tn(bus, { f: 2400, f2: 90, dur: 0.5, vol: 0.5, type: 'sawtooth' });
    this.tn(bus, { f: 60, f2: 30, dur: 0.7, vol: 1, type: 'sine' });
    this.nb(bus, { type: 'bandpass', f: 4000, f2: 300, q: 1.2, dur: 0.6, vol: 0.7 });
    this.nb(bus, { type: 'lowpass', f: 600, dur: 1.2, vol: 0.8, delay: 0.02 });
  },

  charge(dur) {
    if (!this.ctx) return;
    const bus = this.bus(null, 0.1);
    this.tn(bus, { f: 200, f2: 2600, dur, vol: 0.25, type: 'sawtooth', attack: dur * 0.5 });
  },

  dry() { if (!this.ctx) return; this.nb(this.bus(null, 0), { type: 'bandpass', f: 2500, q: 3, dur: 0.04, vol: 0.4 }); },

  reload(kind = 'mag') {
    if (!this.ctx) return;
    const b = this.bus(null, 0.08), tick = (d, f, v) => this.nb(b, { type: 'bandpass', f, q: 4, dur: 0.05, vol: v, delay: d });
    if (kind === 'shell') { tick(0, 1800, 0.35); tick(0.3, 1500, 0.3); }
    else if (kind === 'rocket') { tick(0, 900, 0.5); tick(0.5, 1400, 0.4); tick(0.9, 700, 0.5); }
    else { tick(0, 1700, 0.3); tick(0.45, 2100, 0.4); tick(0.62, 1500, 0.45); tick(1.0, 2400, 0.35); }
  },

  pump() { if (!this.ctx) return; const b = this.bus(null, 0.1); this.nb(b, { type: 'bandpass', f: 1200, q: 3, dur: 0.06, vol: 0.5 }); this.nb(b, { type: 'bandpass', f: 1700, q: 3, dur: 0.06, vol: 0.5, delay: 0.14 }); },
  bolt() { if (!this.ctx) return; const b = this.bus(null, 0.1); this.nb(b, { type: 'bandpass', f: 1500, q: 3, dur: 0.07, vol: 0.5 }); this.nb(b, { type: 'bandpass', f: 2100, q: 3, dur: 0.07, vol: 0.5, delay: 0.25 }); },
  equip() { if (!this.ctx) return; this.nb(this.bus(null, 0), { type: 'bandpass', f: 1400, q: 2, dur: 0.07, vol: 0.3 }); },

  step(surface, pos, vol = 1) {
    if (!this.ctx) return;
    const b = this.bus(pos, 0.1); b.gain.value = vol;
    switch (surface) {
      case 'sand':   this.nb(b, { type: 'lowpass', f: 500, dur: 0.14, vol: 0.18 }); break;
      case 'gravel': this.nb(b, { type: 'bandpass', f: 2200, q: 0.8, dur: 0.1, vol: 0.2 }); this.nb(b, { type: 'lowpass', f: 600, dur: 0.1, vol: 0.12 }); break;
      case 'rock':   this.nb(b, { type: 'bandpass', f: 1600, q: 1.5, dur: 0.05, vol: 0.3 }); this.tn(b, { f: 130, f2: 70, dur: 0.07, vol: 0.2 }); break;
      case 'concrete': this.nb(b, { type: 'bandpass', f: 1300, q: 1.2, dur: 0.05, vol: 0.3 }); this.tn(b, { f: 110, f2: 60, dur: 0.08, vol: 0.18 }); break;
      case 'metal':  this.nb(b, { type: 'bandpass', f: 2500, q: 5, dur: 0.12, vol: 0.28 }); this.tn(b, { f: 420, f2: 380, dur: 0.14, vol: 0.1, type: 'triangle' }); break;
      case 'wood':   this.nb(b, { type: 'lowpass', f: 900, dur: 0.07, vol: 0.3 }); this.tn(b, { f: 160, f2: 90, dur: 0.1, vol: 0.2 }); break;
      case 'water':  this.nb(b, { type: 'bandpass', f: 900, q: 0.6, dur: 0.28, vol: 0.28, attack: 0.03 }); break;
      default:       this.nb(b, { type: 'lowpass', f: 700, dur: 0.09, vol: 0.2 }); this.nb(b, { type: 'highpass', f: 3500, dur: 0.05, vol: 0.05 });
    }
  },

  land(hard) { if (!this.ctx) return; const b = this.bus(null, 0.15); this.tn(b, { f: 90, f2: 40, dur: 0.18, vol: hard ? 0.7 : 0.35 }); this.nb(b, { type: 'lowpass', f: 700, dur: 0.15, vol: hard ? 0.5 : 0.25 }); },
  jump() { if (!this.ctx) return; this.nb(this.bus(null, 0.05), { type: 'lowpass', f: 600, dur: 0.1, vol: 0.12 }); },
  slide() { if (!this.ctx) return; this.nb(this.bus(null, 0.05), { type: 'bandpass', f: 900, f2: 300, q: 0.8, dur: 0.7, vol: 0.18, attack: 0.05 }); },

  explosion(pos, size = 1) {
    if (!this.ctx) return;
    const b = this.bus(pos, 0.9); b.gain.value = Math.min(1.6, 0.8 + size * 0.3);
    this.tn(b, { f: 95, f2: 28, dur: 0.9 * size, vol: 1, type: 'sine' });
    this.nb(b, { type: 'lowpass', f: 2400, f2: 120, dur: 1.3 * size, vol: 1 });
    this.nb(b, { type: 'bandpass', f: 3500, q: 0.6, dur: 0.12, vol: 0.7 });
    this.nb(b, { type: 'highpass', f: 2500, dur: 0.6, vol: 0.2, delay: 0.1 });
  },

  whoosh(pos) { if (!this.ctx) return; this.nb(this.bus(pos, 0.3), { type: 'bandpass', f: 600, f2: 1800, q: 0.7, dur: 0.5, vol: 0.4, attack: 0.15 }); },
  pin() { if (!this.ctx) return; const b = this.bus(null, 0.05); this.tn(b, { f: 2600, f2: 2400, dur: 0.05, vol: 0.2, type: 'triangle' }); this.nb(b, { type: 'bandpass', f: 1800, q: 4, dur: 0.04, vol: 0.3, delay: 0.06 }); },
  bounce(pos) { if (!this.ctx) return; this.nb(this.bus(pos, 0.1), { type: 'bandpass', f: 1800, q: 3, dur: 0.05, vol: 0.35 }); },
  hiss(pos) { if (!this.ctx) return; this.nb(this.bus(pos, 0.2), { type: 'highpass', f: 2500, dur: 1.6, vol: 0.25, attack: 0.05 }); },

  hit() { if (!this.ctx) return; this.tn(this.bus(null, 0), { f: 1200, f2: 900, dur: 0.06, vol: 0.2, type: 'triangle' }); },
  headshot() { if (!this.ctx) return; const b = this.bus(null, 0.1); this.tn(b, { f: 2200, dur: 0.18, vol: 0.3, type: 'sine' }); this.tn(b, { f: 3300, dur: 0.12, vol: 0.15, type: 'sine' }); },
  kill() { if (!this.ctx) return; const b = this.bus(null, 0.1); this.tn(b, { f: 700, dur: 0.12, vol: 0.28, type: 'triangle' }); this.tn(b, { f: 1050, dur: 0.2, vol: 0.28, type: 'triangle', delay: 0.1 }); },
  hurt() { if (!this.ctx) return; const b = this.bus(null, 0.15); this.tn(b, { f: 120, f2: 60, dur: 0.18, vol: 0.5, type: 'sawtooth' }); this.nb(b, { type: 'lowpass', f: 900, dur: 0.12, vol: 0.3 }); },
  pickup() { if (!this.ctx) return; this.tn(this.bus(null, 0), { f: 520, f2: 900, dur: 0.1, vol: 0.18 }); },
  heal() { if (!this.ctx) return; const b = this.bus(null, 0.1); this.tn(b, { f: 400, f2: 800, dur: 0.35, vol: 0.2 }); },
  ui() { if (!this.ctx) return; this.tn(this.bus(null, 0), { f: 700, f2: 500, dur: 0.05, vol: 0.12, type: 'triangle' }); },
  heart() { if (!this.ctx) return; const b = this.bus(null, 0); this.tn(b, { f: 60, f2: 40, dur: 0.12, vol: 0.5 }); this.tn(b, { f: 55, f2: 38, dur: 0.12, vol: 0.4, delay: 0.16 }); },
  whiz(pos) { if (!this.ctx) return; this.nb(this.bus(pos, 0), { type: 'bandpass', f: 3200, f2: 1400, q: 1.5, dur: 0.14, vol: 0.35 }); },
  impact(kind, pos) {
    if (!this.ctx) return;
    const b = this.bus(pos, 0.1);
    if (kind === 'metal') { this.nb(b, { type: 'bandpass', f: 3500, q: 6, dur: 0.18, vol: 0.4 }); }
    else if (kind === 'wood') this.nb(b, { type: 'lowpass', f: 700, dur: 0.07, vol: 0.4 });
    else if (kind === 'flesh') this.tn(b, { f: 160, f2: 80, dur: 0.07, vol: 0.4 });
    else this.nb(b, { type: 'bandpass', f: 1500, q: 1, dur: 0.07, vol: 0.35 });
  },

  // ----- engine -----
  engineStart() {
    if (!this.ctx || this.eng) return;
    const c = this.ctx, o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 600; g.gain.value = 0.0001;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master); o1.start(); o2.start();
    this.eng = { o1, o2, g, lp };
    g.gain.linearRampToValueAtTime(0.16, c.currentTime + 0.3);
  },
  engineSet(speed01, boost) {
    if (!this.eng) return;
    const f = 38 + speed01 * 110 + (boost ? 30 : 0), t = this.ctx.currentTime;
    this.eng.o1.frequency.setTargetAtTime(f, t, 0.08); this.eng.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.eng.lp.frequency.setTargetAtTime(380 + speed01 * 1500, t, 0.1);
    this.eng.g.gain.setTargetAtTime(0.1 + speed01 * 0.12, t, 0.1);
  },
  engineStop() {
    if (!this.eng) return;
    const e = this.eng; this.eng = null;
    e.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
    setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch (x) { /* already stopped */ } }, 500);
  },

  // ----- minigun spin -----
  spinStart() {
    if (!this.ctx || this.spin) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 40; lp.type = 'lowpass'; lp.frequency.value = 500; g.gain.value = 0.0001;
    o.connect(lp); lp.connect(g); g.connect(this.master); o.start(); this.spin = { o, g };
    g.gain.linearRampToValueAtTime(0.1, c.currentTime + 0.2);
  },
  spinSet(k) { if (this.spin) { this.spin.o.frequency.setTargetAtTime(40 + k * 150, this.ctx.currentTime, 0.05); } },
  spinStop() {
    if (!this.spin) return; const s = this.spin; this.spin = null;
    s.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.12);
    setTimeout(() => { try { s.o.stop(); } catch (x) { /* already stopped */ } }, 600);
  },

  // ----- ambience -----
  ambienceStart() {
    if (!this.ctx || this.amb) return;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.5;
    const g = c.createGain(); g.gain.value = 0.05;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.025; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    this.amb = { s, lfo };
    this.ambTimer = setInterval(() => {
      if (!this.ctx || G.state !== 'playing' || Math.random() > 0.5) return;
      const b = this.bus({ x: this.lis.x + mr(-60, 60), y: this.lis.y + 15, z: this.lis.z + mr(-60, 60) }, 0.3), f0 = mr(2200, 3600);
      for (let i = 0; i < 3; i++) this.tn(b, { f: f0, f2: f0 * 1.3, dur: 0.07, vol: 0.12, delay: i * 0.1, type: 'sine' });
    }, 4500);
  },
  ambienceStop() {
    clearInterval(this.ambTimer);
    if (!this.amb) return;
    try { this.amb.s.stop(); this.amb.lfo.stop(); } catch (x) { /* already stopped */ }
    this.amb = null;
  }
};
