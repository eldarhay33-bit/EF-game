// Lobby shell: top navigation, wallet, rotating 3D character, play / controls / settings tabs. Other tabs live in shop.js, progress.js and social.js.
const Menu = {
  scene: null, cam: null, rig: null, rot: Math.PI + 0.55, drag: null, root: null, tab: 'play', built: false, t: 0, tabs: ['play', 'locker', 'shop', 'challenges', 'board', 'friends', 'controls', 'settings'], builders: {}, previewGun: 'ar',

  h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; },
  T(k, p) { return I18n.t(k, p); },

  build() {
    if (this.built) return;
    this.built = true;
    this.root = document.getElementById('menu'); this.root.className = 'menu';
    this.root.innerHTML = `
      <div class="topnav">
        <div class="logo"><img class="emb" src="${BRAND.emblem}" alt=""><span class="lt">${BRAND.wordmark.map((w, i) => i === 1 ? '<b>' + w + '</b>' : w).join('')}</span></div>
        <div class="tabs" id="navTabs"></div>
        <div class="wallet"><div class="chip coins" id="wCoins" title="Coins"></div><div class="chip pts" id="wPts" title="Points"></div><div class="chip lvl" id="wLvl"></div>
          <div class="profile"><span id="pName"></span><small id="pStats"></small></div>
          <button class="navbtn" id="fsBtn">&#9974;</button><button class="navbtn hidden" id="installBtn">&#11015;</button></div>
      </div>
      <div id="tabHost"></div>
      <div class="credit foot" id="menuCredit"></div>
      <div id="installBar" class="hidden"><span id="installTxt"></span><button id="installGo"></button><button id="installNo" class="ghost"></button></div>`;
    // full screen and "install as an app": the buttons show when the browser offers the installation (Chrome, Edge, Android) or on an iPhone / iPad, where the button explains how; an installed app shows neither
    document.getElementById('fsBtn').onclick = () => this.fullscreen(); document.getElementById('rotFs').onclick = () => this.fullscreen();
    document.getElementById('installBtn').onclick = () => this.install(); document.getElementById('installGo').onclick = () => this.install();
    document.getElementById('installNo').onclick = () => { try { localStorage.setItem('lss-inst-no', String(Date.now())); } catch (e) { /* no storage */ } document.getElementById('installBar').classList.add('hidden'); };
    window.addEventListener('lss-install', () => this.installChanged());
    this.installChanged();
    const nav = document.getElementById('navTabs');
    for (const t of this.tabs) { const b = this.h('button', t === 'play' ? 'on' : '', ''); b.dataset.tab = t; b.onclick = () => this.setTab(t); nav.appendChild(b); }
    const host = document.getElementById('tabHost');
    for (const t of this.tabs) { const s = this.h('section', 'tab' + (t === 'play' ? '' : ' hidden')); s.id = 'tab-' + t; host.appendChild(s); }
    this.buildPlay(); this.buildControls(); this.buildSettings();
    for (const t of ['locker', 'shop', 'challenges', 'board', 'friends']) if (this.builders[t]) this.builders[t](document.getElementById('tab-' + t));
    this.labels();
    I18n.onChange(() => { this.labels(); this.buildPlay(); this.buildControls(); this.buildSettings(); for (const t of ['locker', 'shop', 'challenges', 'board', 'friends']) if (this.builders[t]) this.builders[t](document.getElementById('tab-' + t)); this.refresh(); });
    const canvas = document.getElementById('game');
    canvas.addEventListener('mousedown', e => { if (G.state === 'menu') this.drag = e.clientX; });
    window.addEventListener('mouseup', () => { this.drag = null; });
    window.addEventListener('mousemove', e => { if (G.state === 'menu' && this.drag !== null) { this.rot += (e.clientX - this.drag) * 0.01; this.drag = e.clientX; } });
    this.buildScene();
    this.refresh();
  },

  fullscreen() {
    const el = document.documentElement;
    try { if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { /* not allowed here */ }); }).catch(() => { /* refused */ }); } catch (e) { /* no full screen on this device */ }
  },
  install() {
    const ev = window.__installEv;
    if (ev) { ev.prompt(); ev.userChoice.finally(() => { window.__installEv = null; this.installChanged(); }); } else alert(this.T('pwa.ios'));
  },
  // can the game be installed right now? (the browser's offer is waiting, or this is an iPhone / iPad that is not running as an app yet)
  canInstall() { return !Updater.installed() && (!!window.__installEv || (/iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone)); },
  installChanged() {
    const can = this.canInstall(), ib = document.getElementById('installBtn'), bar = document.getElementById('installBar'); if (!ib) return;
    ib.classList.toggle('hidden', !can);
    let no = 0; try { no = Number(localStorage.getItem('lss-inst-no') || 0); } catch (e) { /* no storage */ }
    if (bar) bar.classList.toggle('hidden', !(can && Date.now() - no > 14 * 864e5));                 // the banner comes back two weeks after "Not now"
    const ab = document.getElementById('aboutInstall'); if (ab) { ab.classList.toggle('hidden', !can); }
    const ai = document.getElementById('aboutInstalled'); if (ai) ai.classList.toggle('hidden', !Updater.installed());
  },

  labels() {
    const fb = document.getElementById('fsBtn'), ib = document.getElementById('installBtn'); if (fb) fb.title = this.T('ui.fullscreen'); if (ib) ib.title = this.T('pwa.install');
    const cr = document.getElementById('menuCredit'); if (cr) cr.textContent = this.T('ui.credit');
    const it = document.getElementById('installTxt'), ig = document.getElementById('installGo'), inn = document.getElementById('installNo'); if (it) { it.textContent = this.T('pwa.banner'); ig.textContent = this.T('about.install'); inn.textContent = this.T('pwa.later'); }
    document.querySelectorAll('#navTabs button').forEach(b => { b.textContent = this.T('tab.' + b.dataset.tab); });
    document.getElementById('wCoins').title = this.T('wallet.coins'); document.getElementById('wPts').title = this.T('wallet.points');
  },

  setTab(t, quiet) {
    this.tab = t; if (!quiet) Sound.ui();
    if (t !== 'shop' && this.tryOn) { this.tryOn = null; this.rebuildRig(); }                                    // leaving the shop: the character wears what it really wears again
    document.querySelectorAll('#navTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    for (const n of this.tabs) document.getElementById('tab-' + n).classList.toggle('hidden', n !== t);
    if (this.onTab && this.onTab[t]) this.onTab[t]();
    this.updatePreview();
  },
  tabStep(d) { const i = (this.tabs.indexOf(this.tab) + d + this.tabs.length) % this.tabs.length; this.setTab(this.tabs[i]); },
  back() { if (this.root.classList.contains('overlay')) this.closeOverlay(); else if (this.tab !== 'play') this.setTab('play'); },

  refresh() {
    const D = Profile.d; if (!D) return;
    document.getElementById('wCoins').innerHTML = `<i></i>${I18n.n(D.coins)}`;
    document.getElementById('wPts').innerHTML = `<i></i>${I18n.n(D.points)}`;
    document.getElementById('wLvl').innerHTML = `<b>${this.T('wallet.lvl')} ${Profile.level()}</b><s style="width:${Math.round(Profile.levelProgress() * 100)}%"></s>`;
    document.getElementById('pName').textContent = Settings.get('name');
    const s = D.stats; document.getElementById('pStats').textContent = this.T('profile.stats', { g: s.games, w: s.wins, k: s.kills });
  },

  // ---------- play tab ----------
  buildPlay() {
    const el = document.getElementById('tab-play'); el.innerHTML = '';
    const mode = Settings.get('mode');
    const left = this.h('div', 'side a'), right = this.h('div', 'side b');
    const modes = [['br', 'mode.br'], ['duel', 'mode.duel'], ['online', 'mode.online']];
    const mc = this.h('div', 'card'); mc.appendChild(this.h('h3', '', this.T('play.mode')));
    const seg = this.h('div', 'seg col');
    for (const [id, key] of modes) { const b = this.h('button', mode === id ? 'on' : '', `<b>${this.T(key)}</b><small>${this.T(key + '.d')}</small>`); b.onclick = () => { Settings.set('mode', id); Sound.ui(); this.buildPlay(); }; seg.appendChild(b); }
    mc.appendChild(seg); left.appendChild(mc);
    // online: what kind of match (a public battle royale or 1v1 found by the lobby server, or a party with friends)
    const kind = Settings.get('onlineKind') || 'br';
    if (mode === 'online') {
      const oc = this.h('div', 'card'); oc.appendChild(this.h('h3', '', this.T('online.title'))); const os = this.h('div', 'seg');
      for (const [k, key] of [['br', 'online.br'], ['duel', 'online.duel'], ['friends', 'online.friends']]) { const b = this.h('button', kind === k ? 'on' : '', this.T(key)); b.onclick = () => { Settings.set('onlineKind', k); Sound.ui(); this.buildPlay(); }; os.appendChild(b); }
      oc.appendChild(os); if (kind !== 'friends' && !Matchmaking.available()) oc.appendChild(this.h('p', 'small', this.T('mm.noserver'))); left.appendChild(oc);
    }
    // no difficulty picker: the opponents are matched to the level of the player (src/core/skill.js), this card only shows it
    const lv = Skill.rating(), dc = this.h('div', 'card lvl'); dc.appendChild(this.h('h3', '', this.T('skill.title')));
    dc.appendChild(this.h('div', 'lvlRow', `<b>${Skill.name(lv)}</b><i style="--p:${Math.round(lv)}%"></i>`)); dc.appendChild(this.h('p', 'small', this.T('skill.hint'))); left.appendChild(dc);
    const vc = this.h('div', 'card'); vc.appendChild(this.h('h3', '', this.T('play.view'))); const vs = this.h('div', 'seg');
    for (const [k, key] of [['tpp', 'view.tpp'], ['fpp', 'view.fpp']]) { const b = this.h('button', Settings.get('perspective') === k ? 'on' : '', this.T(key)); b.onclick = () => { Settings.set('perspective', k); Sound.ui(); this.buildPlay(); }; vs.appendChild(b); }
    vc.appendChild(vs); left.appendChild(vc);
    // map selection (owned maps only)
    const mp = this.h('div', 'card'); mp.appendChild(this.h('h3', '', this.T('play.map'))); const ms = this.h('div', 'seg');
    const type = mode === 'duel' ? 'duel' : 'br', key = type === 'duel' ? 'duelMap' : 'map';
    for (const m of CATALOG.maps.filter(m => m.type === type)) {
      const own = Profile.owns('map', m.id), b = this.h('button', (Profile.d.loadout[key] === m.id ? 'on ' : '') + (own ? '' : 'locked'), this.T('map.' + m.id) + (own ? '' : ' 🔒'));
      b.onclick = () => { if (!own) { this.setTab('shop'); return; } Profile.equip(key, m.id); Sound.ui(); this.buildPlay(); };
      ms.appendChild(b);
    }
    mp.appendChild(ms); left.appendChild(mp);
    const prev = this.h('div', 'card map'); prev.appendChild(this.h('h3', '', this.T('play.preview'))); const cv = this.h('canvas'); cv.id = 'lobbyMap'; cv.width = cv.height = 260; prev.appendChild(cv);
    prev.appendChild(this.h('p', 'small', this.T(type === 'duel' ? 'play.duelHint' : 'play.mapHint'))); right.appendChild(prev);
    const dm = Profile.d.missions.daily.list.map(m => `<div class="mrow ${m.done ? 'done' : ''}"><span>${this.T('mission.' + m.id, { n: m.goal })}</span><s style="--p:${Math.round(m.progress / m.goal * 100)}%"></s></div>`).join('');
    const mc2 = this.h('div', 'card'); mc2.appendChild(this.h('h3', '', this.T('play.daily'))); mc2.innerHTML += dm; right.appendChild(mc2);
    const row = this.h('div', 'btnrow');
    const play = this.h('button', 'play', this.T(mode === 'online' ? (kind === 'friends' ? 'play.online' : 'play.find') : 'play.start')); play.id = 'playBtn';
    play.onclick = () => { Sound.init(); Sound.ui(); if (mode === 'online') { if (kind === 'friends') this.setTab('friends'); else Matchmaking.find(kind); return; } Game.start({ mode }); };
    const tut = this.h('button', 'ghostbtn', this.T('play.tutorial')); tut.onclick = () => { Sound.init(); Game.start({ mode: 'tutorial' }); };
    row.appendChild(play); row.appendChild(tut); right.appendChild(row);
    el.appendChild(left); el.appendChild(right); el.appendChild(this.h('div', 'hint', this.T('play.hint')));
    this.drawMap();
  },

  drawMap() {
    const c = document.getElementById('lobbyMap'); if (!c) return; const ctx = c.getContext('2d'), s = c.width / (MAP.half * 2);
    ctx.drawImage(HUD.mapImg, 0, 0, c.width, c.height);
    ctx.font = '11px Segoe UI, Arial'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = '#fff';
    for (const p of POIS) { const x = (p.x + MAP.half) * s, y = (p.z + MAP.half) * s; ctx.strokeText(p.n, x, y); ctx.fillText(p.n, x, y); }
  },

  // ---------- controls tab ----------
  buildControls() {
    const el = document.getElementById('tab-controls'); el.innerHTML = '';
    const A = ['move', 'look', 'fire', 'aim', 'jump', 'crouch', 'sprint', 'reload', 'interact', 'slots', 'nade', 'heal', 'shield', 'items', 'drop', 'view', 'map', 'pause'];
    const col = (title, dev, extra) => {
      const c = this.h('div', 'card ctl'); c.appendChild(this.h('h3', '', title));
      const K = KEY_LABELS[dev];
      for (const a of A) {
        if (dev === 'touch' && (a === 'nade' || a === 'heal' || a === 'shield')) continue;                  // (on a touch screen the items are one bar: the "items" row says it)
        let k = K[a];
        if (a === 'move') k = dev === 'kbm' ? 'W A S D' : dev === 'touch' ? '◉' : 'L-Stick'; else if (a === 'look') k = dev === 'kbm' ? this.T('ctl.mouse') : dev === 'touch' ? this.T('ctl.drag') : 'R-Stick'; else if (a === 'slots') k = dev === 'kbm' ? '1-5 / ⚙' : dev === 'touch' ? '1 2 3 4 5' : 'LB / RB';
        c.appendChild(this.h('div', 'krow', `<b>${k}</b><span>${this.T('ctl.' + a)}</span>`));
      }
      if (extra) c.appendChild(this.h('p', 'small', extra)); return c;
    };
    const wrap = this.h('div', 'ctlwrap' + (Device.phone ? ' one' : ''));
    if (!Device.phone) { wrap.appendChild(col(this.T('ctl.kbm'), 'kbm', this.T('ctl.kbmNote'))); wrap.appendChild(col(this.T('ctl.xbox'), 'xbox', this.T('ctl.padNote'))); wrap.appendChild(col(this.T('ctl.ps'), 'ps', this.T('ctl.padNote'))); }          // (a phone shows its own column only)
    wrap.appendChild(col(this.T('ctl.touch'), 'touch', this.T('ctl.touchNote')));
    el.appendChild(wrap);
  },

  // ---------- settings tab ----------
  buildSettings() {
    const el = document.getElementById('tab-settings'); el.innerHTML = '';
    const card = this.h('div', 'card settings'); card.appendChild(this.h('h3', 'ttl', this.T('set.title')));
    const row = (label, ctl) => { const r = this.h('div', 'row'); r.appendChild(this.h('label', '', this.T(label))); const c = this.h('div', 'ctl'); c.appendChild(ctl); r.appendChild(c); card.appendChild(r); return c; };
    const sel = (key, opts, cb) => { const s = this.h('select'); for (const [v, label] of opts) { const o = this.h('option', '', label); o.value = v; s.appendChild(o); } s.value = Settings.get(key); s.onchange = () => { Settings.set(key, s.value); if (cb) cb(s.value); }; return s; };
    const rng = (key, min, max, step, cb) => { const w = this.h('span', 'rng'); const i = this.h('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = Settings.get(key); const o = this.h('em', '', String(i.value)); i.oninput = () => { Settings.set(key, parseFloat(i.value)); o.textContent = i.value; if (cb) cb(parseFloat(i.value)); }; w.appendChild(i); w.appendChild(o); return w; };
    const chk = (key) => { const i = this.h('input'); i.type = 'checkbox'; i.checked = !!Settings.get(key); i.onchange = () => Settings.set(key, i.checked); return i; };
    const name = this.h('input'); name.maxLength = 14; name.value = Settings.get('name'); name.oninput = () => { Settings.set('name', name.value || 'Player'); this.refresh(); };
    row('set.name', name);
    row('set.lang', sel('lang', I18n.langs, v => I18n.setLang(v)));
    row('set.quality', sel('quality', [['auto', this.T('set.auto')], ['low', this.T('set.low')], ['med', this.T('set.med')], ['high', this.T('set.high')], ['ultra', this.T('set.ultra')]], () => { Game.autoKey = null; Game.applyQuality(); }));
    row('set.fov', rng('fov', 60, 110, 1)); row('set.sens', rng('sens', 0.3, 2.5, 0.05)); row('set.volume', rng('volume', 0, 1, 0.05, v => Sound.setVolume(v)));
    row('set.bob', rng('headbob', 0, 1.5, 0.1));
    row('set.lookMode', sel('lookMode', [['auto', this.T('set.auto')], ['lock', this.T('set.lock')], ['steer', this.T('set.steer')]]));
    row('set.steerSpeed', rng('steerSpeed', 0.4, 2.5, 0.1)); row('set.invert', chk('invertY'));
    row('set.padSens', rng('padSens', 0.4, 2.5, 0.1)); row('set.vibration', chk('vibration')); row('set.autoSprint', chk('autoSprint'));
    row('set.touch', sel('touch', [['auto', this.T('set.auto')], ['on', this.T('set.on')], ['off', this.T('set.off')]], () => location.reload()));
    row('set.touchSize', rng('touchSize', 0.7, 1.5, 0.05, () => { if (Input.touchOn) Input.buildTouch(); }));
    row('set.fps', chk('showFps'));
    row('set.special', sel('special', [['real', this.T('set.specialReal')], ['test', this.T('set.specialTest')]]));
    const rs = this.h('button', 'danger', this.T('set.reset')); rs.onclick = () => { if (confirm(this.T('set.resetConfirm'))) { Profile.reset(); Settings.set('skin', DEFAULT_SKINS[0]); this.refresh(); this.setTab('play'); } };
    row('set.progress', rs);
    card.appendChild(this.h('p', 'small', this.T('set.note')));
    const side = this.h('div', 'side a wide'); side.appendChild(card);
    // about: the logo, the update check, the install button and the credit (no version number: players never see it)
    const ab = this.h('div', 'card about'); ab.appendChild(this.h('h3', 'ttl', this.T('about.title')));
    ab.appendChild(this.h('div', 'aboutLogo', `<img src="${BRAND.logo}" alt="${BRAND.name}">`));
    const st = this.h('div', 'aboutStatus'); st.id = 'aboutStatus';
    const chk2 = this.h('button', '', this.T('about.check')); chk2.onclick = async () => { st.textContent = '…'; const r = await Updater.manual(); st.textContent = this.T(r.key, { v: r.v || '' }); };
    const inst = this.h('button', 'hidden', this.T('about.install')); inst.id = 'aboutInstall'; inst.onclick = () => this.install();
    const done = this.h('div', 'aboutInstalled hidden', '✔ ' + this.T('about.installed')); done.id = 'aboutInstalled';
    const brow = this.h('div', 'aboutBtns'); brow.appendChild(chk2); brow.appendChild(inst); ab.appendChild(brow); ab.appendChild(st); ab.appendChild(done);
    ab.appendChild(this.h('div', 'credit big', this.T('ui.credit')));
    side.appendChild(ab); el.appendChild(side);
    this.installChanged();
  },

  // ---------- 3D preview ----------
  buildScene() {
    const s = this.scene = new THREE.Scene();
    {
      // sunset-gradient backdrop with soft stars instead of a black void
      const cv = document.createElement('canvas'); cv.width = 4; cv.height = 512; const cx = cv.getContext('2d'), gr = cx.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, '#0b1240'); gr.addColorStop(0.42, '#3a2a7a'); gr.addColorStop(0.68, '#b24a8a'); gr.addColorStop(0.86, '#ff8a5a'); gr.addColorStop(1, '#ffc27a'); cx.fillStyle = gr; cx.fillRect(0, 0, 4, 512);
      const bt = new THREE.CanvasTexture(cv); bt.colorSpace = THREE.SRGBColorSpace; s.background = bt; s.fog = new THREE.Fog(0x4a2a78, 9, 30);
    }
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.2, 48), new THREE.MeshStandardMaterial({ color: 0x1a222c, metalness: 0.85, roughness: 0.25, envMapIntensity: 0.8 }));
    floor.position.y = -0.1; floor.receiveShadow = true; s.add(floor);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.03, 8, 80).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf3c64a, emissive: 0xf3c64a, emissiveIntensity: 2.5 }));
    this.ring.position.y = 0.01; s.add(this.ring);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 1.0); fill.position.set(-2.5, 2.4, 5.5); s.add(fill);                            // a soft light from the front for the realistic characters
    const key = new THREE.DirectionalLight(0xfff0dd, 3.3); key.position.set(3, 5, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 3; key.shadow.camera.bottom = -3; key.shadow.bias = -0.0005; s.add(key);
    const rim = new THREE.DirectionalLight(0x4aa8ff, 3.0); rim.position.set(-4, 3, -3); s.add(rim); this.rimLight = rim;
    const rim2 = new THREE.DirectionalLight(0xf3c64a, 1.6); rim2.position.set(4, 2, -4); s.add(rim2);
    s.add(new THREE.HemisphereLight(0x9aaacc, 0x262c38, 0.9));
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2, h = 3 + Math.random() * 5;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.06), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x2a6fd6 : 0xf3c64a, transparent: true, opacity: 0.35 }));
      m.position.set(Math.cos(a) * 9, h / 2, Math.sin(a) * 9 - 2); s.add(m);
    }
    this.cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 60);
    this.cam.position.set(0, 1.5, 7.6); this.cam.lookAt(0, 1.15, 0);
    this.rebuildRig();
  },

  rebuildRig() {
    if (!this.scene) return;
    if (this.rig) this.scene.remove(this.rig.root);
    const id = this.previewId || Settings.get('skin');
    const worn = Profile.d ? (this.tryOn ? Object.assign({}, Profile.d.loadout, this.tryOn) : Profile.d.loadout) : null;          // tryOn: a piece of gear picked in the shop, shown before it is bought
    this.rig = Character.build(id, 0, { loadout: worn, showPoints: true, preview: true });
    this.rig.setGun(GM.build(this.previewGun, 3, 'holo'), 'rifle');
    this.rig.root.scale.setScalar(this.rig.previewScale || 1.2);
    this.rig.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(this.rig.root);
    const sk = Character.byId(id);
    if (this.ring) { const c = sk.rarity >= 6 ? 0xffd24a : sk.rarity >= 4 ? 0xffb833 : sk.rarity === 3 ? 0xb25cff : sk.rarity === 2 ? 0x3aa0ff : 0xf3c64a; this.ring.material.color.setHex(c); this.ring.material.emissive.setHex(c); }
  },

  updatePreview() { /* the locker overrides the pose through Menu.tab */ },

  show() {
    this.build(); this.root.classList.remove('hidden'); this.refresh();
    this.scene.environment = SkySys.envTex || null;
    this.rebuildRig(); this.buildPlay();
    if (Profile.notice) { const n = Profile.notice; Profile.notice = null; HUD.toast(this.T('skins.newTitle'), this.T('skins.refund', { n: I18n.n(n.refund) }), 0xffd24a); }          // the old skins were replaced: say what was paid back
    if (!Profile.d.tutorialDone && !Profile.d.tutOffered && !Profile.d.stats.games) this.offerTutorial();
  },

  // a player who has never played is offered the tutorial once (it teaches the controls of the device in hand and pays 300 coins the first time)
  offerTutorial() {
    let o = document.getElementById('tutOffer');
    if (!o) { o = this.h('div', 'hidden'); o.id = 'tutOffer'; document.body.appendChild(o); }
    const close = () => { Profile.d.tutOffered = true; Profile.save(); o.classList.add('hidden'); };
    o.innerHTML = ''; const box = this.h('div', 'box'); box.appendChild(this.h('h3', '', this.T('tutoffer.title'))); box.appendChild(this.h('p', '', this.T('tutoffer.text')));
    const row = this.h('div', 'acts'), go = this.h('button', 'go', this.T('tutoffer.go')), no = this.h('button', 'no', this.T('tutoffer.no'));
    go.onclick = () => { close(); Sound.init(); Game.start({ mode: 'tutorial' }); }; no.onclick = close;
    row.appendChild(go); row.appendChild(no); box.appendChild(row); o.appendChild(box); o.classList.remove('hidden');
  },
  hide() { if (this.root) this.root.classList.add('hidden'); },

  openOverlay() {
    this.build(); this.root.classList.remove('hidden'); this.root.classList.add('overlay'); this.setTab('settings', true);
    if (!document.getElementById('ovClose')) { const b = this.h('button', '', this.T('ui.close')); b.id = 'ovClose'; b.onclick = () => this.closeOverlay(); document.getElementById('tab-settings').appendChild(b); }
  },
  closeOverlay() { if (this.root && this.root.classList.contains('overlay')) { this.root.classList.remove('overlay'); if (G.state !== 'menu') this.root.classList.add('hidden'); this.setTab('play', true); } },

  update(dt) {
    if (!this.rig) return;
    this.t += dt;
    if (this.drag === null) this.rot += dt * 0.2;
    this.rig.root.rotation.y = this.rot;
    this.rig.update(dt, { speed: 0, fwd: 1, crouch: false, raise: this.tab === 'locker' || this.tab === 'shop' ? 0 : 1, sprint: false, pitch: Math.sin(this.t * 0.7) * 0.04, recoil: 0 });
    if (this.rig.tick) this.rig.tick(dt);
    this.rig.hips.position.y += Math.sin(this.t * 1.8) * 0.004;
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
  }
};
