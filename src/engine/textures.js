// Procedural, tileable textures drawn on canvases at load time (no image files needed).
const Tex = {
  t: {}, aniso: 4, camoCache: {},

  field(size, period, oct, seed) {
    const out = new Float32Array(size * size), rng = mulberry32(seed);
    let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const p = period << o, lat = new Float32Array(p * p);
      for (let i = 0; i < lat.length; i++) lat[i] = rng();
      const step = p / size;
      for (let y = 0; y < size; y++) {
        const fy = y * step, yi = Math.floor(fy), yf = fy - yi, v = yf * yf * (3 - 2 * yf), y0 = (yi % p) * p, y1 = ((yi + 1) % p) * p;
        for (let x = 0; x < size; x++) {
          const fx = x * step, xi = Math.floor(fx), xf = fx - xi, u = xf * xf * (3 - 2 * xf), x0 = xi % p, x1 = (xi + 1) % p;
          const a = lat[y0 + x0], b = lat[y0 + x1], c = lat[y1 + x0], d = lat[y1 + x1];
          out[y * size + x] += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
        }
      }
      tot += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] = clamp((out[i] / tot - 0.5) * 1.9 + 0.5, 0, 1);
    return out;
  },

  paint(size, fn) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data, o = [0, 0, 0, 255];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      o[3] = 255; fn(y * size + x, x, y, o);
      const k = (y * size + x) * 4; d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = o[3];
    }
    ctx.putImageData(img, 0, 0);
    return c;
  },

  normalFrom(h, size, s) {
    return this.paint(size, (i, x, y, o) => {
      const l = h[y * size + (x - 1 + size) % size], r = h[y * size + (x + 1) % size], u = h[((y - 1 + size) % size) * size + x], dn = h[((y + 1) % size) * size + x];
      let nx = (l - r) * s, ny = (dn - u) * s, nz = 1; const m = Math.hypot(nx, ny, nz);
      o[0] = (nx / m * 0.5 + 0.5) * 255; o[1] = (ny / m * 0.5 + 0.5) * 255; o[2] = (nz / m * 0.5 + 0.5) * 255;
    });
  },

  toTex(canvas, srgb = true, repeat = true) {
    const t = new THREE.CanvasTexture(canvas);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.aniso;
    return t;
  },

  mix(a, b, t, o) { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; },

  // On High and Ultra the world gets photographs (Poly Haven, CC0, assets/tex). They arrive after the game has started, one slice at a time, and every one is tone-matched to the painted texture it
  // joins (same average colour, so the tints of the buildings and the look of the world stay) with its contrast eased, so nothing speckles.
  // Ground: the photo becomes the close-up "detail" layer of the terrain shader (Terrain.uDetail); the painted textures stay in place for the wide colour drift, the cloud shadows and the rocks.
  // Buildings, roofs, planks, metal and bark: the picture (and its normal map) of the painted texture is replaced in place, the materials keep pointing at the same texture objects.
  async loadPhotos() {
    const T = this.t, D = typeof Terrain !== 'undefined' && Terrain.uDetail;                           // (a top-level const is not a property of window)
    if (!D) return;
    const v = '?v=' + (window.ASSET_VER || 0), S = 1024, wait = () => new Promise(r => setTimeout(r, 60));
    const mean = (img) => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; return [r / n, g / n, b / n]; };
    const load = async (file) => {
      const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error(file + ' not found')); img.src = 'assets/tex/' + file + '.jpg' + v; });          // (decode() never settles while the page is hidden)
      const c = document.createElement('canvas'); c.width = c.height = S; c.getContext('2d').drawImage(img, 0, 0, S, S); return c;
    };
    // the average colour of `old`, the contrast scaled by `ease` around it, and `desat` of the photo's own colour variation taken away (tinted materials multiply their colour into the texture)
    const tone = (c, old, ease, desat) => {
      const x = c.getContext('2d'), cur = mean(c), sc = old.map((o, i) => clamp(o / Math.max(1, cur[i]), 0.4, 2.2)), id = x.getImageData(0, 0, S, S), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = old[0] + (d[i] * sc[0] - old[0]) * ease, g = old[1] + (d[i + 1] * sc[1] - old[1]) * ease, b = old[2] + (d[i + 2] * sc[2] - old[2]) * ease, l = 0.299 * r + 0.587 * g + 0.114 * b;
        d[i] = r + (l - r) * desat; d[i + 1] = g + (l - g) * desat; d[i + 2] = b + (l - b) * desat;
      }
      x.putImageData(id, 0, 0); return c;
    };
    const ground = { grass: ['leafy_grass_d', 0.7], sand: ['sand_01_d', 0.8], rock: ['rock_boulder_dry_d', 0.85], road: ['rocky_trail_d', 0.8] };
    for (const k in ground) {
      try {
        const t = new THREE.CanvasTexture(tone(await load(ground[k][0]), mean(T[k].image), ground[k][1], 0)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.max(this.aniso, 8);
        D[k].value = t;
      } catch (err) { console.warn('[tex] photo of', k, 'not used', err && err.message); }
      await wait();
    }
    Terrain.uBumpK.value = 0.12;                                                                          // the photographs carry their own grain, the bump from the albedo only needs to hint at it
    let nOk = 0;                                                                                          // their normal maps (a close-up relief the sun can rake across); the terrain shader uses them within about 70 m
    for (const k in ground) {
      try {
        const t = new THREE.CanvasTexture(await load(ground[k][0].replace(/_d$/, '_n'))); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
        Terrain.uDetailN[k].value = t; nOk++;
      } catch (err) { console.warn('[tex] normal map of', k, 'not used', err && err.message); }
      await wait();
    }
    if (nOk === 4) { Terrain.uNorm.value = 1; Terrain.uBumpK.value = 0.06; }
    // texture: [file, contrast, desaturation, metres one photo covers (0 = leave the scale), metres one painted tile covers in structures.js (SM.tile of its most common material)]
    const walls = { brick: ['red_brick', 0.9, 0, 1.5, 2.5], plaster: ['painted_plaster_wall', 1, 0, 2, 2.5], concrete: ['concrete_layers_02', 0.9, 0, 1.8, 3], roof: ['clay_roof_tiles_02', 0.8, 0.6, 1.7, 2.2],
      metal: ['corrugated_iron', 1, 0, 1.2, 2], wood: ['weathered_brown_planks', 0.9, 0, 1.4, 2.2], bark: ['pine_bark', 0.9, 0.25, 0, 1] };
    const swap = (t, c) => { t.dispose(); t.image = c; t.needsUpdate = true; };                          // dispose first: the new picture needs new storage on the GPU
    for (const k in walls) {
      const [file, ease, desat, real, tile] = walls[k];
      try {
        const col = tone(await load(file + '_d'), mean(T[k].image), ease, desat), nor = await load(file + '_n');
        swap(T[k], col); swap(T[k + 'N'], nor);
        if (real) { const r = tile / real; T[k].repeat.set(r, r); T[k + 'N'].repeat.set(r, r); }          // real-world size: a brick is a brick
      } catch (err) { console.warn('[tex] photo of', k, 'not used', err && err.message); }
      await wait();
    }
  },

  async build(progress) {
    const T = this.t, step = async (n) => { if (progress) progress(n); await new Promise(r => setTimeout(r, 0)); };
    const S = 512;

    // grass
    let f1 = this.field(S, 4, 5, 11), f2 = this.field(S, 12, 3, 12);
    T.grass = this.toTex(this.paint(S, (i, x, y, o) => {
      this.mix([52, 82, 34], [104, 132, 58], f1[i], o);
      if (f2[i] > 0.62) this.mix([o[0], o[1], o[2]], [142, 134, 70], (f2[i] - 0.62) * 2.2, o);
      const g = 0.85 + Math.random() * 0.3; o[0] *= g; o[1] *= g; o[2] *= g;
    }));
    await step('grass');

    // sand with wind ripples
    f1 = this.field(S, 3, 4, 21); f2 = this.field(S, 24, 2, 22);
    T.sand = this.toTex(this.paint(S, (i, x, y, o) => {
      const rip = Math.sin(Math.PI * 2 * (7 * (y / S) + f1[i] * 1.4)) * 0.5 + 0.5;
      this.mix([196, 166, 116], [226, 200, 150], rip * 0.7 + f2[i] * 0.3, o);
      const g = 0.93 + Math.random() * 0.14; o[0] *= g; o[1] *= g; o[2] *= g;
    }));
    await step('sand');

    // ---- 1024 px PBR sets: close-up sharpness for rocks, walls, roofs, planks and metal ----
    const B = 1024, hs = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
    const f3 = this.field(B, 24, 3, 33);

    // rock + normal
    f1 = this.field(B, 5, 5, 31); f2 = this.field(B, 9, 4, 32);
    const rh = new Float32Array(B * B);
    T.rock = this.toTex(this.paint(B, (i, x, y, o) => {
      const strata = Math.sin(Math.PI * 2 * (5 * (y / B) + f1[i] * 1.2)) * 0.5 + 0.5;
      const ridge = 1 - Math.abs(f2[i] * 2 - 1), crack = ridge > 0.93 ? (ridge - 0.93) * 12 : 0;
      rh[i] = f1[i] * 0.6 + strata * 0.2 - crack * 0.6 + f2[i] * 0.2 + f3[i] * 0.12;
      this.mix([78, 72, 66], [138, 128, 116], f1[i] * 0.6 + strata * 0.4, o);
      const k = (1 - crack * 0.6) * (0.9 + f3[i] * 0.22) * (0.96 + Math.random() * 0.08); o[0] *= k; o[1] *= k; o[2] *= k;
    }));
    T.rockN = this.toTex(this.normalFrom(rh, B, 7), false);
    await step('rock');

    // gravel / dirt road
    f1 = this.field(S, 6, 4, 41);
    const gc = this.paint(S, (i, x, y, o) => { this.mix([102, 90, 76], [140, 126, 108], f1[i], o); const g = 0.88 + Math.random() * 0.24; o[0] *= g; o[1] *= g; o[2] *= g; });
    const gx = gc.getContext('2d');
    for (let i = 0; i < 2600; i++) {
      const v = 90 + Math.random() * 90; gx.fillStyle = `rgb(${v},${v * 0.93},${v * 0.85})`;
      gx.beginPath(); gx.ellipse(Math.random() * S, Math.random() * S, 1 + Math.random() * 3.4, 1 + Math.random() * 2.4, Math.random() * 3, 0, 6.3); gx.fill();
    }
    T.road = this.toTex(gc);
    await step('road');

    // concrete panels with expansion joints, pores and stains + normal
    f1 = this.field(B, 3, 5, 51); f2 = this.field(B, 14, 3, 52);
    const ch = new Float32Array(B * B);
    T.concrete = this.toTex(this.paint(B, (i, x, y, o) => {
      const stain = Math.max(0, f2[i] - 0.6) * 0.6, joint = (x % 512 < 3 || y % 512 < 3) ? 1 : 0, pore = f3[i] > 0.78 ? (f3[i] - 0.78) * 4 : 0;
      const v = 150 + (f1[i] - 0.5) * 70 + (Math.random() - 0.5) * 14 - stain * 80 - joint * 38 - pore * 40;
      const ridge = 1 - Math.abs(f2[i] * 2 - 1), crack = ridge > 0.955 ? 40 : 0;
      ch[i] = f1[i] * 0.3 + Math.random() * 0.1 + f3[i] * 0.14 - (crack ? 0.3 : 0) - joint * 0.6 - pore * 0.3;
      o[0] = v - crack; o[1] = v - crack - 1; o[2] = v - crack - 4;
    }));
    T.concreteN = this.toTex(this.normalFrom(ch, B, 3.2), false);
    await step('concrete');

    // stucco plaster with fine grain, trowel marks and a soft stain gradient + normal
    f1 = this.field(B, 4, 4, 61); f2 = this.field(B, 90, 2, 62);
    const ph = new Float32Array(B * B);
    T.plaster = this.toTex(this.paint(B, (i, x, y, o) => {
      const trowel = Math.sin((x * 0.9 + y * 0.35) * 0.06 + f1[i] * 9) * 0.5 + 0.5;
      ph[i] = f2[i] * 0.5 + trowel * 0.25 + Math.random() * 0.12;
      const v = 205 + (f1[i] - 0.5) * 46 + (f2[i] - 0.5) * 22 + trowel * 8 + (Math.random() - 0.5) * 8;
      o[0] = v; o[1] = v - 3; o[2] = v - 10;
    }));
    T.plasterN = this.toTex(this.normalFrom(ph, B, 2.4), false);
    await step('plaster');

    // wood planks with knots, grain, nail heads and seams + normal
    f1 = this.field(B, 2, 4, 71); f2 = this.field(B, 8, 3, 72);
    const wh = new Float32Array(B * B), knots = [];
    for (let k = 0; k < 34; k++) knots.push([Math.random() * B, Math.random() * B, 6 + Math.random() * 10]);
    T.wood = this.toTex(this.paint(B, (i, x, y, o) => {
      const pl = Math.floor(y / 128), py = y % 128, edge = py < 4 || py > 123 ? 0.3 : 1;
      const xs = (x + pl * 211) % B, seam = xs < 3 || (xs > 508 && xs < 513) ? 0.5 : 1;
      let grain = Math.sin(Math.PI * 2 * (x / B * 4 + f2[i] * 2.4 + pl * 0.37)) * 0.5 + 0.5, kn = 0;
      for (const [kx, ky, kr] of knots) { const d = Math.hypot(x - kx, (y - ky) * 0.7); if (d < kr * 2.2) { kn = Math.max(kn, 1 - d / (kr * 2.2)); grain = grain * (1 - kn) + Math.sin(d * 0.9) * 0.5 * kn + 0.4 * kn; } }
      const nail = (px => Math.hypot(((x + 40) % 256) - 128, py - 64) < 3.2 && px)(true) ? 0.55 : 1;
      const base = 0.62 + ((pl * 37) % 10) / 40 + f1[i] * 0.2;
      wh[i] = grain * 0.2 * edge * seam + (edge < 1 ? -0.5 : 0) + (seam < 1 ? -0.4 : 0) - kn * 0.15 - (nail < 1 ? 0.3 : 0);
      const k = (base + grain * 0.2 - kn * 0.18) * edge * seam * nail * (0.95 + Math.random() * 0.1);
      o[0] = 150 * k; o[1] = 112 * k; o[2] = 74 * k;
    }));
    T.woodN = this.toTex(this.normalFrom(wh, B, 3.4), false);
    await step('wood');

    // corrugated sheet metal: ribs, bolt lines, scratches, chipped paint and rust + normal
    f1 = this.field(B, 5, 4, 81); f2 = this.field(B, 14, 3, 82);
    const mh = new Float32Array(B * B);
    T.metal = this.toTex(this.paint(B, (i, x, y, o) => {
      const rib = Math.sin(Math.PI * 2 * x / B * 24) * 0.5 + 0.5, bolt = (Math.abs(((x / B * 24) % 1) - 0.5) < 0.07 && (y % 256 < 5)) ? 1 : 0;
      mh[i] = rib - bolt * 0.4 + f3[i] * 0.04;
      let v = 150 + rib * 58 + (f1[i] - 0.5) * 30 + (f3[i] - 0.5) * 12 - bolt * 45;
      o[0] = v; o[1] = v; o[2] = v + 3;
      const wear = f2[i] * 0.6 + f1[i] * 0.5, rust = smoothstep(0.55, 0.8, wear) * (0.6 + 0.4 * f3[i]);
      if (rust > 0) this.mix([o[0], o[1], o[2]], [150, 80, 40], rust * 0.78, o);
      if (wear > 0.7 && f3[i] > 0.6) { o[0] *= 0.78; o[1] *= 0.78; o[2] *= 0.78; }
    }));
    T.metalN = this.toTex(this.normalFrom(mh, B, 4), false);
    await step('metal');

    // bark: deep furrows with ridges + normal
    f1 = this.field(512, 3, 4, 91);
    const bh = new Float32Array(512 * 512);
    T.bark = this.toTex(this.paint(512, (i, x, y, o) => {
      const s = Math.sin(Math.PI * 2 * (x / 512 * 10 + f1[i] * 1.6)) * 0.5 + 0.5, s2 = Math.sin(Math.PI * 2 * (x / 512 * 23 + f1[i] * 3.1 + y / 512 * 0.6)) * 0.5 + 0.5, v = 48 + s * 50 + f1[i] * 25 + s2 * 12;
      bh[i] = s * 0.7 + s2 * 0.2 + f1[i] * 0.2;
      o[0] = v * 1.1; o[1] = v * 0.82; o[2] = v * 0.6;
    }));
    T.barkN = this.toTex(this.normalFrom(bh, 512, 4), false);
    await step('bark');

    // foliage
    f1 = this.field(256, 8, 4, 101);
    T.needles = this.toTex(this.paint(256, (i, x, y, o) => { const v = f1[i]; o[0] = 22 + v * 28; o[1] = 52 + v * 50; o[2] = 24 + v * 22; if (Math.random() < 0.08) { o[0] *= 0.6; o[1] *= 0.6; o[2] *= 0.6; } }));
    T.leaf = this.toTex(this.paint(256, (i, x, y, o) => { const v = f1[i]; o[0] = 46 + v * 40; o[1] = 82 + v * 62; o[2] = 28 + v * 24; if (Math.random() < 0.1) { o[0] *= 1.3; o[1] *= 1.1; } }));
    await step('foliage');

    // clay roof tiles: curved profile, overlapping rows, per-tile colour, moss and dirt + normal
    f1 = this.field(B, 6, 3, 111);
    const rf = new Float32Array(B * B), TW = 128, TH = 170;
    T.roof = this.toTex(this.paint(B, (i, x, y, o) => {
      const row = Math.floor(y / TH), ty = (y % TH) / TH, xx = (x + (row % 2) * (TW / 2)) % TW, tx = xx / TW, tile = Math.floor((x + (row % 2) * (TW / 2)) / TW);
      const curve = Math.sin(tx * Math.PI), lip = smoothstep(0.78, 1.0, ty) * 0.9 + (ty < 0.05 ? -0.3 : 0), edge = (tx < 0.04 || tx > 0.96) ? -0.35 : 0;
      rf[i] = curve * 0.5 + ty * 0.45 - lip * 0.2 + edge + f3[i] * 0.05;
      const tone = 0.82 + hs(tile + row * 31, row) * 0.34, shade = 0.62 + 0.38 * smoothstep(0.0, 0.9, ty) - (ty > 0.9 ? 0.25 : 0) + curve * 0.12 + edge * 0.5;
      const moss = smoothstep(0.62, 0.85, f1[i] * 0.7 + f3[i] * 0.4) * 0.35, v = tone * shade * (0.9 + f1[i] * 0.25);
      o[0] = 170 * v; o[1] = 146 * v; o[2] = 134 * v;
      if (moss > 0) this.mix([o[0], o[1], o[2]], [74, 100, 52], moss, o);
    }));
    T.roofN = this.toTex(this.normalFrom(rf, B, 5), false);
    await step('roof');

    // brick wall with mortar, per-brick colour and chips + normal
    const bk = new Float32Array(B * B), BH = 32, BW = 96;
    T.brick = this.toTex(this.paint(B, (i, x, y, o) => {
      const row = Math.floor(y / BH), xs = (x + (row % 2) * (BW / 2)) % BW, ys = y % BH, bi = Math.floor((x + (row % 2) * (BW / 2)) / BW);
      const mortar = xs < 4 || ys < 4, r = hs(bi + row * 17, row * 3 + 5), chip = f3[i] > 0.82 ? 0.82 : 1;
      bk[i] = mortar ? 0 : 0.55 + r * 0.2 + f3[i] * 0.2;
      if (mortar) { const m = 168 + (f1[i] - 0.5) * 30 + Math.random() * 10; o[0] = m; o[1] = m - 4; o[2] = m - 12; return; }
      const v = (0.78 + r * 0.4) * chip * (0.9 + f1[i] * 0.2) * (0.96 + Math.random() * 0.08);
      o[0] = 170 * v; o[1] = 82 * v; o[2] = 62 * v;
    }));
    T.brickN = this.toTex(this.normalFrom(bk, B, 5.5), false);
    await step('brick');
    // water normal
    f1 = this.field(512, 3, 4, 121);
    T.waterN = this.toTex(this.normalFrom(f1, 512, 3.2), false);
    f2 = this.field(256, 6, 3, 133); T.foam = this.toTex(this.paint(256, (i, x, y, o) => { const v = f2[i] * 255; o[0] = o[1] = o[2] = v; }), false);

    // asphalt-like dark detail for vehicles / tires
    T.noiseGray = this.toTex(this.paint(128, (i, x, y, o) => { const v = 200 + Math.random() * 55; o[0] = o[1] = o[2] = v; }));

    // grass blade tuft (alpha cutout)
    const bc = document.createElement('canvas'); bc.width = 128; bc.height = 128;
    const bx = bc.getContext('2d');
    for (let b = 0; b < 11; b++) {
      const x0 = 14 + Math.random() * 100, h = 60 + Math.random() * 62, lean = (Math.random() - 0.5) * 38, w = 3 + Math.random() * 4;
      const g = bx.createLinearGradient(0, 128, 0, 128 - h);
      g.addColorStop(0, `rgb(${70 + Math.random() * 14},${104 + Math.random() * 16},${40})`);
      g.addColorStop(1, `rgb(${150 + Math.random() * 30},${190 + Math.random() * 30},${84})`);
      bx.fillStyle = g; bx.beginPath(); bx.moveTo(x0 - w, 128);
      bx.quadraticCurveTo(x0 - w * 0.4 + lean * 0.2, 128 - h * 0.55, x0 + lean, 128 - h);
      bx.quadraticCurveTo(x0 + w * 0.4 + lean * 0.2, 128 - h * 0.55, x0 + w, 128); bx.closePath(); bx.fill();
    }
    T.blade = this.toTex(bc, true, false);
    await step('blade');

    // tall meadow grass: long slender blades, dense at the bottom
    const tc = document.createElement('canvas'); tc.width = 128; tc.height = 256;
    const tx = tc.getContext('2d');
    for (let b = 0; b < 30; b++) {
      const x0 = 8 + Math.random() * 112, h = 130 + Math.random() * 120, lean = (Math.random() - 0.5) * 60, w = 2.2 + Math.random() * 3.2, seed = Math.random();
      const g = tx.createLinearGradient(0, 256, 0, 256 - h);
      g.addColorStop(0, `rgb(${58 + seed * 18},${86 + seed * 20},${34})`);
      g.addColorStop(0.6, `rgb(${112 + seed * 40},${142 + seed * 30},${60})`);
      g.addColorStop(1, seed > 0.7 ? `rgb(${196 + seed * 30},${176 + seed * 20},${96})` : `rgb(${160 + seed * 30},${186 + seed * 24},${88})`);
      tx.fillStyle = g; tx.beginPath(); tx.moveTo(x0 - w, 256);
      tx.quadraticCurveTo(x0 - w * 0.5 + lean * 0.25, 256 - h * 0.6, x0 + lean, 256 - h);
      tx.quadraticCurveTo(x0 + w * 0.5 + lean * 0.25, 256 - h * 0.6, x0 + w, 256); tx.closePath(); tx.fill();
    }
    T.bladeTall = this.toTex(tc, true, false);

    // canopy leaf cluster (oak / bush) with veins
    const lc = document.createElement('canvas'); lc.width = lc.height = 256;
    const lx = lc.getContext('2d');
    const leaf = (x, y, a, s, tone) => {
      lx.save(); lx.translate(x, y); lx.rotate(a);
      const g = lx.createLinearGradient(0, 0, 0, -s);
      g.addColorStop(0, `rgb(${34 + tone * 26},${70 + tone * 44},${22})`); g.addColorStop(1, `rgb(${76 + tone * 54},${128 + tone * 62},${38})`);
      lx.fillStyle = g; lx.beginPath(); lx.moveTo(0, 0);
      lx.bezierCurveTo(s * 0.56, -s * 0.22, s * 0.42, -s * 0.8, 0, -s); lx.bezierCurveTo(-s * 0.42, -s * 0.8, -s * 0.56, -s * 0.22, 0, 0); lx.fill();
      lx.strokeStyle = 'rgba(18,46,10,0.55)'; lx.lineWidth = 1.3; lx.beginPath(); lx.moveTo(0, 0); lx.lineTo(0, -s * 0.94); lx.stroke();
      lx.lineWidth = 0.9; lx.beginPath();
      for (let k = 1; k < 5; k++) { lx.moveTo(0, -s * k * 0.17); lx.lineTo(s * 0.3, -s * (k * 0.17 + 0.11)); lx.moveTo(0, -s * k * 0.17); lx.lineTo(-s * 0.3, -s * (k * 0.17 + 0.11)); }
      lx.stroke(); lx.restore();
    };
    for (let i = 0; i < 46; i++) leaf(128 + (Math.random() - 0.5) * 200, 150 + (Math.random() - 0.3) * 190, Math.random() * 6.28, 32 + Math.random() * 28, Math.random());
    T.leafCard = this.toTex(lc, true, false);

    // pine needle spray
    const nc = document.createElement('canvas'); nc.width = nc.height = 256;
    const nx = nc.getContext('2d');
    for (let br = 0; br < 5; br++) {
      const ang = -Math.PI / 2 + (br - 2) * 0.36, len = 100 + Math.random() * 40;
      nx.save(); nx.translate(128, 246); nx.rotate(ang + Math.PI / 2);
      nx.strokeStyle = '#3a2a18'; nx.lineWidth = 2.4; nx.beginPath(); nx.moveTo(0, 0); nx.lineTo(0, -len); nx.stroke();
      for (let k = 0; k < 34; k++) {
        const t = k / 34, y = -t * len, side = k % 2 ? 1 : -1, l = (1 - t * 0.55) * (26 + Math.random() * 10), tone = Math.random();
        nx.strokeStyle = `rgb(${24 + tone * 20},${58 + tone * 46},${28 + tone * 14})`; nx.lineWidth = 1.7;
        nx.beginPath(); nx.moveTo(0, y); nx.lineTo(side * l, y - l * 0.55); nx.stroke();
      }
      nx.restore();
    }
    T.needleCard = this.toTex(nc, true, false);

    // wild flowers
    const fc = document.createElement('canvas'); fc.width = fc.height = 128;
    const fx = fc.getContext('2d'), petals = ['#f6f2e8', '#f4d23a', '#c46ae6', '#f06a8c', '#7aa6f2'];
    for (let i = 0; i < 6; i++) {
      const x = 12 + Math.random() * 104, h = 42 + Math.random() * 62, col = petals[i % petals.length];
      fx.strokeStyle = '#4f7f2e'; fx.lineWidth = 2.2; fx.beginPath(); fx.moveTo(x, 128); fx.quadraticCurveTo(x + (Math.random() - 0.5) * 14, 128 - h * 0.5, x, 128 - h); fx.stroke();
      fx.fillStyle = col; for (let p = 0; p < 6; p++) { const a = p / 6 * 6.283; fx.beginPath(); fx.ellipse(x + Math.cos(a) * 5.5, 128 - h + Math.sin(a) * 5.5, 4.2, 2.6, a, 0, 6.3); fx.fill(); }
      fx.fillStyle = '#e2a615'; fx.beginPath(); fx.arc(x, 128 - h, 2.6, 0, 6.3); fx.fill();
    }
    T.flowers = this.toTex(fc, true, false);
    await step('canopy');

    // sprites: bullet hole, scorch, muzzle flash, smoke puff
    const mk = (size, fn) => { const c = document.createElement('canvas'); c.width = c.height = size; fn(c.getContext('2d'), size); return c; };
    T.hole = this.toTex(mk(64, (x, s) => {
      const g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(10,8,6,0.95)'); g.addColorStop(0.35, 'rgba(20,16,12,0.8)'); g.addColorStop(1, 'rgba(30,24,18,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      x.strokeStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; x.beginPath(); x.moveTo(32, 32); x.lineTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22); x.stroke(); }
    }), true, false);
    T.scorch = this.toTex(mk(128, (x, s) => {
      const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(0.5, 'rgba(10,8,6,0.55)'); g.addColorStop(1, 'rgba(10,8,6,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    }), true, false);
    T.flash = this.toTex(mk(128, (x, s) => {
      const g = x.createRadialGradient(64, 64, 2, 64, 64, 60); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.2, 'rgba(255,210,120,0.9)'); g.addColorStop(1, 'rgba(255,120,30,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      x.fillStyle = 'rgba(255,220,150,0.85)';
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + Math.random() * 0.4; x.save(); x.translate(64, 64); x.rotate(a); x.beginPath(); x.moveTo(0, -4); x.lineTo(58 + Math.random() * 6, 0); x.lineTo(0, 4); x.fill(); x.restore(); }
    }), true, false);
    await step('sprites');
  },

  // camouflage pattern for skins, cached per palette
  camo(colors, seed = 1, period = 5) {
    const key = colors.join(',') + seed + period;
    if (this.camoCache[key]) return this.camoCache[key];
    const S = 256, f = this.field(S, period, 3, 200 + seed), f2 = this.field(S, period * 2, 2, 300 + seed);
    const cols = colors.map(h => [(h >> 16) & 255, (h >> 8) & 255, h & 255]);
    const c = this.paint(S, (i, x, y, o) => {
      const v = clamp(f[i] * 0.75 + f2[i] * 0.25, 0, 0.999), c = cols[Math.floor(v * cols.length)];
      const g = 0.92 + Math.random() * 0.16; o[0] = c[0] * g; o[1] = c[1] * g; o[2] = c[2] * g;
    });
    return (this.camoCache[key] = this.toTex(c));
  }
};
