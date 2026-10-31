const Settings = {
  defaults: {
    skin: 'recruit', perspective: 'tpp', difficulty: 'normal', quality: 'auto', fov: 80, sens: 1.0, volume: 0.8,
    tod: 'day', special: 'real', showFps: false, name: 'Player', invertY: false, headbob: 1.0,
    lang: 'en', lookMode: 'auto', steerSpeed: 1.0, padSens: 1.0, autoSprint: true, touch: 'auto', touchSize: 1.0, vibration: true,
    mode: 'br', dbUrl: '', peerId: '', netName: '', uid: '', persMig: 0
  },
  data: {},
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('lss-settings') || '{}'); } catch (e) { saved = {}; }
    this.data = Object.assign({}, this.defaults, saved);
    if (!/^(en|he|ar|es|fr|de|ru|pt|tr)$/.test(this.data.lang)) this.data.lang = 'en';                       // English is the default language (no guessing from the browser): a new player starts in English, a saved choice is kept
    if (!saved.persMig) { this.data.persMig = 1; this.data.perspective = 'tpp'; this.save(); }                      // third person became the default camera: a first-person choice saved before that is reset once (the player can switch back in the lobby or with the camera key)
  },
  save() { try { localStorage.setItem('lss-settings', JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ } },
  get(k) { return this.data[k]; },
  set(k, v) { this.data[k] = v; this.save(); }
};
Settings.load();

// What the game runs on: a phone gets lighter graphics and a layout made for it (css/phone.css); ?phone=1 forces it (to try it on a computer), ?phone=0 forbids it
const Device = {
  phone: false, tablet: false, coarse: false, mem: 8, cores: 4,
  detect() {
    const q = new URLSearchParams(location.search), ua = navigator.userAgent || '';
    this.coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const touch = navigator.maxTouchPoints > 0, small = Math.min(screen.width, screen.height) <= 820;
    this.phone = q.has('phone') ? q.get('phone') !== '0' : /Android.+Mobile|iPhone|iPod|Windows Phone/i.test(ua) || (this.coarse && touch && small);
    this.tablet = !this.phone && this.coarse && touch;
    this.mem = navigator.deviceMemory || (this.phone ? 3 : 8); this.cores = navigator.hardwareConcurrency || 4;
    const h = document.documentElement; h.classList.toggle('phone', this.phone); h.classList.toggle('tablet', this.tablet);
    this.scale();
  },
  // the size of the phone layout: everything in css/phone.css and the touch buttons is drawn for a screen 820 x 390 and scaled by k (a short screen is limited by its height, a narrow one by its width)
  k: 1,
  scale() {
    this.k = Math.max(0.7, Math.min(1.25, Math.min(innerHeight / 390, innerWidth / 820)));
    document.documentElement.style.setProperty('--k', this.phone ? this.k.toFixed(3) : '1');
  }
};
Device.detect();
window.addEventListener('resize', () => Device.scale());

const DIFFICULTY = {
  easy:   { name: '',     react: [1.1, 2.0], err: 1.9, dmg: 0.2,  vision: 52,  speed: 0.85, hp: 0.9,  grenade: 0.0,  cover: 0.1, lead: 0,    hs: 0.02, strafe: 0.6, grace: [40, 70] },
  normal: { name: '',   react: [0.6, 1.2], err: 1.1, dmg: 0.3,  vision: 70,  speed: 1.0,  hp: 1.0,  grenade: 0.25, cover: 0.5, lead: 0.3,  hs: 0.06, strafe: 1.0, grace: [24, 50] },
  hard:   { name: '',    react: [0.35, 0.7], err: 0.65, dmg: 0.42, vision: 95, speed: 1.08, hp: 1.1,  grenade: 0.55, cover: 0.8, lead: 0.7,  hs: 0.12, strafe: 1.3, grace: [14, 32] },
  insane: { name: '',  react: [0.18, 0.4], err: 0.35, dmg: 0.6,  vision: 125, speed: 1.15, hp: 1.25, grenade: 0.85, cover: 1.0, lead: 1.0,  hs: 0.22, strafe: 1.6, grace: [6, 16] }
};

const TODS = {
  day:      { name: '',   sunEl: 46, sunAz: 40,  sun: [1.0, 0.94, 0.82], sunI: 3.5, zenith: [0.05, 0.28, 0.8], horizon: [0.64, 0.82, 1.0], fog: 0.0016, cloud: 0.55, hemi: 0.8, exposure: 1.0 },
  golden:   { name: '',      sunEl: 12, sunAz: 235, sun: [1.0, 0.6, 0.28], sunI: 3.3, zenith: [0.1, 0.22, 0.62],   horizon: [1.0, 0.58, 0.3], fog: 0.0024, cloud: 0.6, hemi: 0.62, exposure: 0.95 },
  overcast: { name: '',      sunEl: 40, sunAz: 60,  sun: [0.85, 0.88, 0.95], sunI: 1.3, zenith: [0.3, 0.36, 0.45],  horizon: [0.55, 0.6, 0.66], fog: 0.0035, cloud: 0.95, hemi: 0.9, exposure: 1.0 },
  night:    { name: '',      sunEl: 24, sunAz: 150, sun: [0.42, 0.52, 0.82], sunI: 0.85, zenith: [0.012, 0.02, 0.07], horizon: [0.05, 0.08, 0.17], fog: 0.0028, cloud: 0.3, hemi: 0.62, exposure: 1.25, stars: 1 }
};
