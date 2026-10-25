// HUD: bars, ammo, weapon slots, compass, minimap and full map, crosshair/reticles/scopes, hit and damage feedback, kill feed.
const POIS = [
  { n: '', x: 0, z: 0 }, { n: '', x: MOUNTAIN.x, z: MOUNTAIN.z }, { n: '', x: 48, z: 150 }, { n: '', x: 36, z: -168 },
  { n: '', x: LAKE.x, z: LAKE.z }, { n: '', x: -165, z: 8 }, { n: '', x: 158, z: -64 }, { n: '', x: 150, z: 105 },
  { n: '', x: 192, z: 24 }, { n: '', x: 178, z: -168 }
];
const hexCss = c => '#' + c.toString(16).padStart(6, '0');

const HUD = {
  el: {}, bannerT: null, vigT: null, hmT: null, mapImg: null, compassLabels: [], last: {}, bigOn: false,

  init() {
    for (const id of ['hud', 'aliveCount', 'killCount', 'zoneInfo', 'compassStrip', 'minimap', 'killfeed', 'crosshair', 'reticle', 'scope', 'hitmarker', 'vignette', 'lowhp', 'flash', 'dmgInd',
      'prompt', 'banner', 'useBar', 'useFill', 'useTxt', 'vehicleHud', 'speedTxt', 'fps', 'slots', 'ammoMag', 'ammoRes', 'ammoMeta', 'consum', 'shieldFill', 'shieldTxt', 'healthFill', 'healthTxt', 'tutBox', 'hidden', 'steerHint', 'under']) this.el[id] = document.getElementById(id);
    this.mctx = this.el.minimap.getContext('2d');
    this.buildItems();
    for (let i = 0; i < 5; i++) { const d = document.createElement('div'); d.className = 'slot'; this.el.slots.appendChild(d); }
    for (const [n, a] of [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]) {
      const s = document.createElement('span'); s.textContent = n; s.dataset.a = a; if (!n.includes('N') || n === 'N') s.className = n.length === 1 ? 'main' : ''; this.el.compassStrip.appendChild(s); this.compassLabels.push(s);
    }
    this.big = document.createElement('div'); this.big.id = 'bigmap'; this.big.className = 'hidden';
    this.big.innerHTML = '<canvas width="720" height="720"></canvas><div class="cap" data-i18n="hud.closeMap">Close map</div>'; document.body.appendChild(this.big); I18n.apply(this.big);
    this.bctx = this.big.querySelector('canvas').getContext('2d');
    document.addEventListener('keydown', e => { if (e.code === 'KeyM' && G.state === 'playing' && !e.repeat) this.toggleBig(); });
    this.buildMapImage();
  },

  // consumable bar: bandage / medkit / shield potions / grenades with their keys (also clickable when the mouse is free)
  buildItems() {
    const list = [['bandage', 'healS', () => Player.meds.small, 'item.heal.small'], ['medkit', 'healB', () => Player.meds.big, 'item.heal.big'], ['shieldS', 'shS', () => Player.shields.small, 'item.shield.small'], ['shieldB', 'shB', () => Player.shields.big, 'item.shield.big'],
      ['nade', 'frag', () => Player.nades.frag, 'throw.frag'], ['smoke', 'smoke', () => Player.nades.smoke, 'throw.smoke'], ['flash', 'flash', () => Player.nades.flash, 'throw.flash'], ['sticky', 'sticky', () => Player.nades.sticky, 'throw.sticky']];
    this.items = list.map(([act, ico, get, name]) => {
      const b = document.createElement('button'); b.className = 'it ' + ico; b.type = 'button'; b.innerHTML = '<i></i><b></b><kbd></kbd>';
      b.onclick = () => Input.press(act); this.el.consum.appendChild(b); return { act, get, name, b, n: -1, k: null };
    });
  },

  updateItems() {
    for (const it of this.items) {
      const n = it.get(), k = Input.device === 'kbm' ? Input.key(it.act === 'nade' ? 'nade' : it.act) : '';
      if (n !== it.n) { it.n = n; it.b.children[1].textContent = n; it.b.classList.toggle('empty', n <= 0); }
      if (k !== it.k) { it.k = k; it.b.children[2].textContent = k; it.b.title = I18n.t(it.name); }
    }
  },

  // small "+30 9mm rounds" notes above the ammo box
  pickup(name, color, sign) {
    const host = document.getElementById('pickups'); if (!host) return;
    const d = document.createElement('div'); d.className = 'pk'; d.style.borderColor = hexCss(color); d.textContent = (sign || '+') + ' ' + name;
    host.appendChild(d); while (host.children.length > 4) host.removeChild(host.firstChild);
    setTimeout(() => d.classList.add('out'), 1500); setTimeout(() => d.remove(), 1900);
  },

  mapColor(x, z, out) {
    const h = terrainHeight(x, z);
    if (waterDepth(x, z) > 0.04) { const k = clamp(waterDepth(x, z) / 3, 0, 1); out[0] = 70 - k * 30; out[1] = 130 - k * 40; out[2] = 170 - k * 30; return; }
    const shade = 0.88 + clamp(terrainHeight(x - 2, z - 2) - h, -3, 3) * 0.05;
    let c;
    if (distToRoad(x, z) < 2.2) c = [190, 168, 130];
    else if (Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) < MOUNTAIN.r * 0.95) c = h > 33 ? [236, 240, 245] : slopeAt(x, z) > 0.1 || h > 14 ? [138, 130, 120] : [100, 122, 80];
    else if (desertAmount(x, z) > 0.5) c = [222, 198, 146];
    else if (Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r + 4) c = [170, 160, 140];
    else c = [88 + (h * 2) % 14, 128 + (h * 2) % 10, 70];
    out[0] = c[0] * shade; out[1] = c[1] * shade; out[2] = c[2] * shade;
  },

  buildMapImage() {
    const N = 300, c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), o = [0, 0, 0];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      this.mapColor((i / N - 0.5) * MAP.half * 2, (j / N - 0.5) * MAP.half * 2, o);
      const k = (j * N + i) * 4; img.data[k] = o[0]; img.data[k + 1] = o[1]; img.data[k + 2] = o[2]; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapImg = c;
  },

  show(v) { this.el.hud.classList.toggle('hidden', !v); if (!v) { this.big.classList.add('hidden'); this.bigOn = false; } },
  toggleBig() { this.bigOn = !this.bigOn; this.big.classList.toggle('hidden', !this.bigOn); },

  banner(text, dur) {
    const b = this.el.banner; clearTimeout(this.bannerT);
    if (!text) { b.classList.remove('on'); return; }
    b.textContent = text; b.classList.add('on');
    if (dur) this.bannerT = setTimeout(() => b.classList.remove('on'), dur * 1000);
  },

  // achievement / mission / purchase notification (works in the lobby too)
  toast(title, sub, color) {
    const host = document.getElementById('toasts'); if (!host) return;
    const d = document.createElement('div'); d.className = 'toast'; if (color) d.style.borderLeftColor = hexCss(color);
    d.innerHTML = `<b></b><span></span>`; d.firstChild.textContent = title; d.lastChild.textContent = sub || '';
    host.appendChild(d); requestAnimationFrame(() => d.classList.add('on'));
    while (host.children.length > 4) host.removeChild(host.firstChild);
    setTimeout(() => { d.classList.remove('on'); setTimeout(() => d.remove(), 400); }, 4200);
  },

  prompt(text, color) {
    const p = this.el.prompt, key = text + color;
    if (this.last.prompt === key) return; this.last.prompt = key;
    if (!text) { p.style.display = 'none'; return; }
    p.style.display = 'block'; p.textContent = text; p.style.borderBottom = color ? `3px solid ${hexCss(color)}` : 'none';
  },

  hitMarker(kill, head) {
    const h = this.el.hitmarker; h.className = 'on' + (kill ? ' kill' : '') + (head ? ' head' : '');
    clearTimeout(this.hmT); this.hmT = setTimeout(() => { h.className = ''; }, kill ? 320 : 130);
    kill ? Sound.kill() : head ? Sound.headshot() : Sound.hit();
  },

  damageFlash(kind) {
    const v = this.el.vignette; v.classList.toggle('zone', kind === 'zone');
    v.style.opacity = kind === 'zone' ? 0.6 : 0.95;
    clearTimeout(this.vigT); this.vigT = setTimeout(() => { v.style.opacity = 0; }, 200);
  },

  damageDir(pos) {
    const dx = pos.x - Player.pos.x, dz = pos.z - Player.pos.z, rel = angDiff(Player.yaw, Math.atan2(-dx, -dz));
    const d = document.createElement('div'); d.className = 'dmg'; d.style.transform = `rotate(${-rel * 180 / Math.PI}deg)`;
    this.el.dmgInd.appendChild(d);
    setTimeout(() => { d.style.opacity = 0; }, 120); setTimeout(() => d.remove(), 1400);
  },

  feed(text, color) {
    const d = document.createElement('div'); d.textContent = text; if (color) d.style.borderRight = `3px solid ${hexCss(color)}`;
    const k = this.el.killfeed; k.appendChild(d);
    while (k.children.length > 5) k.removeChild(k.firstChild);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 6000);
  },

  useBar(p, label) {
    const b = this.el.useBar; if (p <= 0) { b.style.display = 'none'; return; }
    b.style.display = 'block'; this.el.useFill.style.width = (p * 100) + '%'; this.el.useTxt.textContent = label || '';
  },

  set(key, el, val) { if (this.last[key] !== val) { this.last[key] = val; el.textContent = val; } },

  update(dt) {
    const P = Player, e = this.el, w = P.weapon(), d = w ? WEAPONS[w.id] : null;
    this.set('alive', e.aliveCount, Game.aliveCount()); this.set('kills', e.killCount, P.kills);
    this.set('zone', e.zoneInfo, G.mode === 'duel' ? Duel.info() : G.mode === 'tutorial' ? I18n.t('tut.title') : Zone.info() + (P.alive && P.phase !== 'plane' && P.phase !== 'freefall' && P.phase !== 'glide' && Zone.isOutside(P) ? ' · ' + I18n.t('hud.out') : ''));
    const hid = P.alive && P.inGrass ? 1 : 0;
    if (this.last.hid !== hid) { this.last.hid = hid; const h = document.getElementById('hidden'); h.classList.toggle('on', !!hid); h.textContent = hid ? I18n.t('hud.hidden') : ''; }
    e.healthFill.style.width = P.health + '%'; this.set('hp', e.healthTxt, Math.ceil(P.health));
    e.shieldFill.style.width = P.shield + '%'; this.set('sh', e.shieldTxt, Math.ceil(P.shield));
    e.lowhp.style.opacity = P.alive && P.health < 30 ? (0.35 + 0.25 * Math.sin(G.time * 6)) : 0;
    if (P.alive && P.health < 25 && G.time - (this.lastBeat || 0) > 0.95) { this.lastBeat = G.time; Sound.heart(); }
    e.flash.style.opacity = clamp((P.flashed || 0) / 2, 0, 1) + clamp(FX.flashT || 0, 0, 1) * 0.6;
    const under = G.camera.position.y < WATER_Y && waterDepth(G.camera.position.x, G.camera.position.z) > 0.05 ? 1 : 0;
    if (this.last.under !== under) { this.last.under = under; document.getElementById('under').style.opacity = under; }

    // ammo
    if (w) {
      const st = Weapons.stat(w), rar = RARITY[w.rarity];
      this.set('mag', e.ammoMag, P.reloadT > 0 ? '···' : w.mag);
      this.set('res', e.ammoRes, '/ ' + P.ammo[d.ammo]);
      const meta = `${d.name} · ${d.mode} · ${SIGHTS[w.sight].name}`;
      if (this.last.meta !== meta + w.rarity) { this.last.meta = meta + w.rarity; e.ammoMeta.textContent = meta; e.ammoMeta.style.color = hexCss(rar.color); }
    } else { this.set('mag', e.ammoMag, '-'); this.set('res', e.ammoRes, ''); this.set('meta', e.ammoMeta, ''); }
    this.updateItems();

    // slots
    const key = P.slots.map(s => (s ? s.w.id + s.w.rarity : '-')).join() + P.cur;
    if (key !== this.last.slots) {
      this.last.slots = key;
      [...e.slots.children].forEach((el, i) => {
        const s = P.slots[i];
        el.className = 'slot' + (i === P.cur ? ' active' : '');
        el.innerHTML = `<i>${i + 1}</i><span class="nm">${s ? WEAPONS[s.w.id].name : ''}</span>`;
        el.style.borderColor = s ? hexCss(RARITY[s.w.rarity].color) : '';
        el.style.boxShadow = s && i === P.cur ? `0 0 12px ${hexCss(RARITY[s.w.rarity].color)}66` : '';
      });
    }

    // compass
    const bearing = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360;
    for (const s of this.compassLabels) {
      const diff = ((+s.dataset.a - bearing + 540) % 360) - 180;
      s.style.display = Math.abs(diff) > 40 ? 'none' : 'block'; s.style.left = (160 + diff * 4) + 'px';
    }

    // sights, crosshair, scope
    const sight = w ? SIGHTS[w.sight] : null, aimed = P.aimT > 0.7 && !P.tppNow;
    e.scope.style.display = P.scoped ? 'block' : 'none';
    if (P.scoped) { e.scope.className = (sight.thermal ? 'thermal ' : '') + 'r-' + sight.reticle; }
    e.reticle.style.display = aimed && !P.scoped && sight && sight.reticle ? 'block' : 'none';
    if (e.reticle.style.display === 'block') e.reticle.className = 'r-' + sight.reticle;
    const showCross = !P.scoped && (!aimed || !sight || !sight.reticle) && P.alive && P.phase !== 'plane' && P.phase !== 'freefall';
    e.crosshair.style.display = showCross ? 'block' : 'none';
    if (showCross && d) {
      const spread = P.computeSpread(d), pxPerRad = (innerHeight / 2) / Math.tan(P.fovV * Math.PI / 360);
      const gap = clamp(Math.atan(spread) * pxPerRad * 0.9, 3, 90) * (P.sprinting ? 1.3 : 1);
      e.crosshair.style.setProperty('--gap', gap.toFixed(1) + 'px');
    }
    this.set('veh', e.speedTxt, P.riding && P.bike ? Math.round(Math.abs(P.bike.speed) * 3.6) : '');
    e.vehicleHud.style.display = P.riding ? 'block' : 'none';
    if (Settings.get('showFps')) { e.fps.style.display = 'block'; this.set('fps', e.fps, `${G.fps || 0} FPS · ${G.drawScale ? Math.round(G.drawScale * 100) + '%' : ''}`); } else e.fps.style.display = 'none';
    this.drawMap();
    if (this.bigOn) this.drawBig();
  },

  poiLabels(ctx, toScreen, minR) {
    ctx.font = '11px Segoe UI, Arial'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
    for (const p of POIS) { const s = toScreen(p.x, p.z); if (!s) continue; ctx.strokeText(p.n, s[0], s[1]); ctx.fillText(p.n, s[0], s[1]); }
  },

  drawMap() {
    const ctx = this.mctx, S = 220, R = 110, scale = 1.6, P = Player;
    ctx.save(); ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#16202a'; ctx.fillRect(0, 0, S, S);
    ctx.translate(R, R); ctx.rotate(P.yaw); ctx.translate(-P.pos.x * scale, -P.pos.z * scale);
    if (G.arena) {                    // flat arena: draw its footprint instead of the open-world map
      const B = Arena.bounds || { x: 30, z: 30 };
      ctx.fillStyle = '#3a4350'; ctx.fillRect(-B.x * scale, -B.z * scale, B.x * 2 * scale, B.z * 2 * scale);
      ctx.strokeStyle = '#7e8a99'; ctx.lineWidth = 3; ctx.strokeRect(-B.x * scale, -B.z * scale, B.x * 2 * scale, B.z * 2 * scale);
    } else ctx.drawImage(this.mapImg, -MAP.half * scale, -MAP.half * scale, MAP.half * 2 * scale, MAP.half * 2 * scale);
    ctx.lineWidth = 2;
    if (G.arena) { /* no storm in arenas */ } else if (Zone.to && Zone.state === 'wait') { ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(Zone.to.x * scale, Zone.to.z * scale, Zone.to.r * scale, 0, 6.2832); ctx.stroke(); }
    if (!G.arena) { ctx.strokeStyle = '#a56bff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(Zone.cx * scale, Zone.cz * scale, Zone.r * scale, 0, 6.2832); ctx.stroke(); }
    ctx.fillStyle = '#ff4d4d';
    for (const b of G.bots) { if (!b.alive || (G.time - b.lastFired > 3 && !G.arena) || b.state === 'drop') continue; ctx.beginPath(); ctx.arc(b.pos.x * scale, b.pos.z * scale, 3.2, 0, 6.2832); ctx.fill(); }
    ctx.fillStyle = '#ffd84a';
    for (const v of Vehicles.bikes) { if (v.rider) continue; ctx.fillRect(v.pos.x * scale - 2.5, v.pos.z * scale - 2.5, 5, 5); }
    ctx.fillStyle = '#ff8c1a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    for (const s of Supply.list) { ctx.beginPath(); ctx.moveTo(s.x * scale, s.z * scale - 7); ctx.lineTo(s.x * scale + 6, s.z * scale + 5); ctx.lineTo(s.x * scale - 6, s.z * scale + 5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.translate(R, R);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save();
    const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
    this.poiLabels(ctx, (x, z) => { const dx = (x - P.pos.x) * scale, dz = (z - P.pos.z) * scale, sx = dx * c - dz * s + R, sy = dx * s + dz * c + R; return Math.hypot(sx - R, sy - R) < R - 16 ? [sx, sy] : null; });
    ctx.restore();
  },

  drawBig() {
    const ctx = this.bctx, S = 720, sc = S / (MAP.half * 2), P = Player;
    ctx.clearRect(0, 0, S, S); ctx.drawImage(this.mapImg, 0, 0, S, S);
    const X = x => (x + MAP.half) * sc, Z = z => (z + MAP.half) * sc;
    if (Zone.to && Zone.state === 'wait') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(Zone.to.x), Z(Zone.to.z), Zone.to.r * sc, 0, 6.2832); ctx.stroke(); }
    ctx.strokeStyle = '#a56bff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(X(Zone.cx), Z(Zone.cz), Zone.r * sc, 0, 6.2832); ctx.stroke();
    ctx.fillStyle = '#ffd84a'; for (const v of Vehicles.bikes) { if (!v.rider) ctx.fillRect(X(v.pos.x) - 3, Z(v.pos.z) - 3, 6, 6); }
    ctx.fillStyle = '#ff8c1a'; for (const s of Supply.list) { ctx.beginPath(); ctx.arc(X(s.x), Z(s.z), 7, 0, 6.2832); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    this.poiLabels(ctx, (x, z) => [X(x), Z(z)]);
    ctx.save(); ctx.translate(X(P.pos.x), Z(P.pos.z)); ctx.rotate(-P.yaw);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
};
