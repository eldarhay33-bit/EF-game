// Portraits of the skins for the locker and shop cards. Each character is built once off-screen, lit like the lobby, drawn into a small render target and kept as a picture
// (a card asks for its portrait with Thumbs.attach; they are made one at a time in the background, so opening the shop never stalls, and the colour swatch shows until a portrait is ready).
const Thumbs = {
  cache: {}, waiting: {}, queue: [], busy: false, W: 240, H: 260,

  init() {
    if (this.scene) return;
    const s = this.scene = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xb8c4e0, 0x2a2e3a, 1.0));
    const key = new THREE.DirectionalLight(0xfff0dd, 2.6); key.position.set(2.5, 4, 4); s.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.9); fill.position.set(-3, 2, 4.5); s.add(fill);
    const rim = new THREE.DirectionalLight(0x6ab4ff, 2.2); rim.position.set(-3.5, 2.5, -3); s.add(rim);
    const rim2 = new THREE.DirectionalLight(0xffc27a, 1.4); rim2.position.set(3.5, 2, -3.5); s.add(rim2);
    this.cam = new THREE.PerspectiveCamera(24, this.W / this.H, 0.1, 30); this.cam.position.set(0.7, 1.6, 3.05); this.cam.lookAt(0, 1.48, 0);
    this.rt = new THREE.WebGLRenderTarget(this.W, this.H, { samples: 4 }); this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.px = new Uint8Array(this.W * this.H * 4); this.cv = document.createElement('canvas'); this.cv.width = this.W; this.cv.height = this.H; this.cx = this.cv.getContext('2d'); this.img = this.cx.createImageData(this.W, this.H);
  },

  attach(id, img) {
    if (!img) return;
    if (this.cache[id]) { img.src = this.cache[id]; return; }
    (this.waiting[id] || (this.waiting[id] = [])).push(img);
    if (!this.queue.includes(id)) this.queue.push(id);
    this.pump();
  },

  pump() {
    if (this.busy || !this.queue.length || !G.renderer || !Character.q || !Character.q.ready) return;
    this.busy = true;
    setTimeout(() => { const id = this.queue.shift(); try { this.draw(id); } catch (e) { console.warn('[thumbs]', id, e && e.message); delete this.waiting[id]; } this.busy = false; this.pump(); }, 80);
  },

  draw(id) {
    this.init();
    const r = G.renderer, rig = Character.build(id, 0, { preview: true, loadout: null });
    rig.setGun(GM.build(Menu.previewGun || 'ar', 3, 'holo'), 'rifle');
    rig.root.scale.setScalar(rig.previewScale || 1.2); rig.root.rotation.y = Math.PI - 0.5;                       // the characters look along -z: turn them to the camera, a little to the side
    this.scene.add(rig.root); this.scene.environment = SkySys.envTex || null;
    const st = { speed: 0, fwd: 1, crouch: false, raise: 0, sprint: false, pitch: 0, recoil: 0 };
    for (let i = 0; i < 24; i++) { rig.update(1 / 30, st); if (rig.tick) rig.tick(1 / 30); }                // let the idle pose settle
    const prevRt = r.getRenderTarget(), prevCol = r.getClearColor(new THREE.Color()), prevA = r.getClearAlpha();
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear(); r.render(this.scene, this.cam);
    r.readRenderTargetPixels(this.rt, 0, 0, this.W, this.H, this.px);
    r.setRenderTarget(prevRt); r.setClearColor(prevCol, prevA);
    // the picture comes out upside down and premultiplied: turn it over and give the soft edges their colour back
    const W = this.W, H = this.H, d = this.img.data, s = this.px;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = ((H - 1 - y) * W + x) * 4, o = (y * W + x) * 4, a = s[i + 3];
      if (a === 0) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; continue; }
      const k = 255 / a; d[o] = Math.min(255, s[i] * k); d[o + 1] = Math.min(255, s[i + 1] * k); d[o + 2] = Math.min(255, s[i + 2] * k); d[o + 3] = a;
    }
    this.cx.putImageData(this.img, 0, 0);
    const url = this.cache[id] = this.cv.toDataURL('image/png');
    for (const im of this.waiting[id] || []) im.src = url;
    delete this.waiting[id];
    this.scene.remove(rig.root); rig.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
};
