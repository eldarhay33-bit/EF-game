// Unified input: keyboard + mouse (pointer lock with cursor-steering fallback), touch (Fortnite-mobile style) and gamepads (Xbox / PlayStation).
const keys = {};

const KEY_LABELS = {
  kbm:   { fire: 'LMB', aim: 'RMB', jump: 'Space', crouch: 'Ctrl', sprint: 'Shift', reload: 'R', interact: 'E', nade: 'G', heal: 'H', shield: 'Q', map: 'M', pause: 'Esc', view: 'V', drop: 'Z', items: '6 7 8 9', bandage: '6', medkit: '7', shieldS: '8', shieldB: '9', smoke: 'F', flash: 'X', sticky: 'B', frag: 'G' },
  xbox:  { fire: 'RT', aim: 'LT', jump: 'A', crouch: 'B', sprint: 'L3', reload: 'X', interact: 'Y', nade: 'D-Pad ↑', heal: 'D-Pad ↓', shield: 'D-Pad ←', map: 'View', pause: 'Menu', view: 'R3', drop: 'Hold X', items: 'D-Pad', frag: 'D-Pad ↑', sticky: 'D-Pad →' },
  ps:    { fire: 'R2', aim: 'L2', jump: '✕', crouch: '○', sprint: 'L3', reload: '□', interact: '△', nade: 'D-Pad ↑', heal: 'D-Pad ↓', shield: 'D-Pad ←', map: 'Touchpad', pause: 'Options', view: 'R3', drop: 'Hold □', items: 'D-Pad', frag: 'D-Pad ↑', sticky: 'D-Pad →' },
  touch: { fire: '●', aim: '⌖', jump: '⤒', crouch: '⌄', sprint: '≫', reload: '⟳', interact: '✋', nade: '▤', heal: '▤', shield: '▤', map: '☰ ▦', pause: '☰ II', view: '☰ 👁', drop: '☰ 🗑', items: '▤' }
};

const Input = {
  device: 'kbm', padType: 'xbox', padIndex: -1, padPrev: [], mouse: { x: 0.5, y: 0.5, moved: false }, locked: false, hadLock: false, lockFailed: false, steerOn: false,
  axisMove: { x: 0, y: 0 }, act: { sprint: false, jump: false, crouchHeld: false, breath: false, fireHeld: false },
  touchOn: false, touch: { joyId: null, lookId: null, joyOrigin: null, lookLast: null, buttons: {} }, sprintLatch: false, aimToggle: false,
  pad: { lt: 0, rt: 0, ls: { x: 0, y: 0 }, rs: { x: 0, y: 0 }, navT: 0, navDir: null }, canvas: null, hintShown: false,

  key(a) { return (KEY_LABELS[this.device] || KEY_LABELS.kbm)[a] || KEY_LABELS.kbm[a] || ''; },

  init(canvas) {
    this.canvas = canvas;
    this.touchOn = this.touchWanted();
    document.addEventListener('keydown', e => this.onKey(e, true));
    document.addEventListener('keyup', e => this.onKey(e, false));
    // document level so clicks reach the game even when HUD layers sit on top of the canvas
    document.addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('button, a, input, select, .screen:not(#loading), #menu, #tutBox, .tb')) return; this.onMouseDown(e); });
    document.addEventListener('mouseup', e => { if (e.button === 0) this.release('fire'); if (e.button === 2 && !this.aimToggle) this.release('aim'); });
    document.addEventListener('mousemove', e => this.onMouseMove(e));
    document.addEventListener('contextmenu', e => { if (G.state === 'playing') e.preventDefault(); });
    document.addEventListener('wheel', e => { if (G.state === 'playing' && Player.alive && this.mouseActive()) this.cycle(e.deltaY > 0 ? 1 : -1); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked; this.locked = document.pointerLockElement === canvas;
      if (this.locked) { this.hadLock = true; this.lockFailed = false; this.steerOn = false; }
      if (was && !this.locked && G.state === 'playing' && Player.alive) { this.hadLock = false; Game.pause(); }
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; this.enableSteer(); });
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('gamepadconnected', e => { this.padIndex = e.gamepad.index; this.detectPad(e.gamepad); });
    window.addEventListener('gamepaddisconnected', () => { this.padIndex = -1; if (this.device === 'pad') this.device = 'kbm'; });
    if (this.touchOn) { this.device = 'touch'; this.buildTouch(); }
    window.addEventListener('touchstart', () => { if (!this.touchOn && Settings.get('touch') !== 'off') { this.touchOn = true; this.device = 'touch'; this.buildTouch(); } }, { once: true, passive: true });
    I18n.onChange(() => { if (this.touchOn) this.buildTouch(); });
  },

  touchWanted() {
    const s = Settings.get('touch');
    if (s === 'on') return true; if (s === 'off') return false;
    return (window.matchMedia && matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
  },

  mouseActive() { return this.device === 'kbm'; },
  clear() { for (const k in keys) keys[k] = false; this.act.sprint = this.act.jump = this.act.crouchHeld = this.act.breath = false; this.release('fire'); if (!this.aimToggle) this.release('aim'); },

  // ---------- mouse look ----------
  tryLock() {
    if (this.touchOn || this.locked) return;
    const mode = Settings.get('lookMode');
    if (mode === 'steer') { this.enableSteer(); return; }
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { this.lockFailed = true; this.enableSteer(); }); } catch (e) { this.lockFailed = true; this.enableSteer(); }
    setTimeout(() => { if (!this.locked && G.state === 'playing' && !this.touchOn) this.enableSteer(); }, 450);
  },

  enableSteer() {
    if (this.touchOn) return;
    if (!this.steerOn) { this.steerOn = true; if (typeof HUD !== 'undefined' && G.state === 'playing') HUD.banner(I18n.t('hint.steer'), 5); }
  },

  onMouseMove(e) {
    this.mouse.x = e.clientX / innerWidth; this.mouse.y = e.clientY / innerHeight; this.mouse.moved = true;
    if (this.device !== 'kbm' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 2)) this.device = 'kbm';
    if (this.locked && G.state === 'playing' && Player.alive) {
      const k = this.lookScale() * 0.0022;
      Player.yaw -= e.movementX * k; Player.pitch = clamp(Player.pitch - e.movementY * k * (Settings.get('invertY') ? -1 : 1), -1.5, 1.5); Player.lastLookT = G.time;
    }
  },

  // sensitivity depends on the current zoom so scopes feel consistent
  lookScale() { return Settings.get('sens') * Math.tan(Player.fovV * Math.PI / 360) / Math.tan(35 * Math.PI / 180); },

  onMouseDown(e) {
    this.device = 'kbm';
    if (G.state !== 'playing') return;
    if (!this.locked && !this.steerOn) this.tryLock();
    else if (!this.locked && this.steerOn && Settings.get('lookMode') === 'auto' && !this.lockFailed) this.tryLock();
    if (e.button === 0) this.press('fire');
    if (e.button === 2) { if (this.aimToggle && Player.aiming) this.release('aim', true); else this.press('aim'); }
  },

  // ---------- keyboard ----------
  onKey(e, down) {
    if (down && e.code === 'Escape' && G.state === 'playing' && !this.locked) { Game.pause(); return; }
    if (G.state !== 'playing') { if (!down) keys[e.code] = false; return; }
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyV'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = down; this.device = 'kbm';
    const P = Player; if (!P.alive) return;
    const map = { KeyR: 'reload', KeyE: 'interact', KeyH: 'heal', KeyQ: 'shield', KeyG: 'nade', KeyF: 'smoke', KeyX: 'flash', KeyB: 'sticky', KeyV: 'view', KeyZ: 'drop', KeyM: 'map', Tab: 'map', Space: 'jump', ShiftLeft: 'sprint', ControlLeft: 'crouch', KeyC: 'crouch' };
    const a = map[e.code];
    if (a) down ? this.press(a) : this.release(a);
    if (down && e.code.startsWith('Digit')) { const n = parseInt(e.code.slice(5)); if (n >= 1 && n <= 5) this.press('slot' + n); else if (n >= 6 && n <= 9) this.press(['bandage', 'medkit', 'shieldS', 'shieldB'][n - 6]); }
    this.act.breath = !!keys.ShiftLeft;
  },

  axis() {
    if (Player.frozen) return { f: 0, r: 0, raw: 0 };
    let f = 0, r = 0;
    if (keys.KeyW) f += 1; if (keys.KeyS) f -= 1; if (keys.KeyD) r += 1; if (keys.KeyA) r -= 1;
    const l = Math.hypot(f, r);
    if (l > 1) { f /= l; r /= l; }
    f += this.axisMove.y; r += this.axisMove.x;
    const m = Math.hypot(f, r); if (m > 1) { f /= m; r /= m; }
    return { f, r, raw: Math.hypot(f, r) };
  },

  // throttle / steering for bikes
  drive() {
    const a = this.axis();
    return { thr: a.f > 0.1 ? Math.min(1, a.f) : 0, brake: a.f < -0.1 ? Math.min(1, -a.f) : 0, steer: a.r, hand: !!keys.Space || this.act.jump, boost: !!keys.ShiftLeft || this.act.sprint };
  },

  // ---------- actions shared by every device ----------
  press(a) {
    const P = Player;
    if (a === 'pause') { if (G.state === 'playing') Game.pause(); return; }
    if (G.state !== 'playing' || !P.alive || (P.frozen && a !== 'view' && a !== 'map')) return;
    switch (a) {
      case 'fire': P.firing = true; P.triggerHeld = false; P.fireQueueT = 0.2; this.act.fireHeld = true; break;
      case 'aim': P.aiming = true; break;
      case 'reload': P.startReload(); break;
      case 'interact': P.interact(); break;
      case 'jump': this.act.jump = true; if (P.phase === 'plane') P.jumpFromPlane(); else if (P.phase === 'freefall') P.openGlider(); break;
      case 'sprint': this.act.sprint = true; break;
      case 'crouch': this.act.crouchHeld = true; if (P.phase === 'ground') P.tryCrouchOrSlide(); break;
      case 'heal': P.useMed(); break; case 'shield': P.useShield(); break;
      case 'bandage': P.useMed('small'); break; case 'medkit': P.useMed('big'); break; case 'shieldS': P.useShield('small'); break; case 'shieldB': P.useShield('big'); break; case 'drop': P.dropWeapon(); break;
      case 'nade': P.throwNade('frag'); break; case 'smoke': P.throwNade('smoke'); break; case 'flash': P.throwNade('flash'); break; case 'sticky': P.throwNade('sticky'); break;
      case 'view': Settings.set('perspective', Settings.get('perspective') === 'fpp' ? 'tpp' : 'fpp'); HUD.banner(I18n.t(Settings.get('perspective') === 'fpp' ? 'hud.fpp' : 'hud.tpp'), 1); if (typeof Tutorial !== 'undefined') Tutorial.onView(); break;
      case 'map': HUD.toggleBig(); break;
      case 'next': this.cycle(1); break; case 'prev': this.cycle(-1); break;
      default: if (a.startsWith('slot')) P.equip(parseInt(a.slice(4)) - 1);
    }
  },

  release(a, force) {
    const P = Player;
    switch (a) {
      case 'fire': P.firing = false; P.triggerHeld = false; this.act.fireHeld = false; break;
      case 'aim': if (!this.aimToggle || force) P.aiming = false; break;
      case 'jump': this.act.jump = false; break;
      case 'sprint': this.act.sprint = false; break;
      case 'crouch': this.act.crouchHeld = false; break;
    }
  },

  cycle(dir) {
    const P = Player; let n = P.cur;
    for (let i = 0; i < 5; i++) { n = (n + dir + 5) % 5; if (P.slots[n]) break; }
    if (P.slots[n]) P.equip(n);
  },

  // ---------- per-frame update ----------
  update(dt) {
    this.pollPad(dt);
    if (G.state === 'playing' && Player.alive) {
      let lx = 0, ly = 0;
      // keyboard arrows always turn the view (handy when the mouse cannot be captured)
      const kx = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0), ky = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
      lx += kx * 1.9; ly += ky * 1.5;
      // cursor steering fallback
      if (this.steerOn && !this.locked && this.device === 'kbm' && this.mouse.moved) {
        const dz = 0.07, curve = v => { const a = Math.max(0, Math.abs(v) - dz) / (1 - dz); return Math.sign(v) * a * (0.6 + a * 1.9); };
        const dx = curve((this.mouse.x - 0.5) * 2), dy = curve((this.mouse.y - 0.5) * 2), sp = 1.5 * Settings.get('steerSpeed') * Settings.get('sens') * Math.tan(Player.fovV * Math.PI / 360) / Math.tan(35 * Math.PI / 180);
        lx -= dx * sp; ly -= dy * sp;
      }
      // gamepad right stick
      if (this.device === 'pad') {
        const s = this.pad.rs, sp = 3.0 * Settings.get('padSens') * Math.tan(Player.fovV * Math.PI / 360) / Math.tan(35 * Math.PI / 180);
        lx -= s.x * sp; ly -= s.y * sp * 0.85;
      }
      if (lx || ly) { Player.yaw += lx * dt; Player.pitch = clamp(Player.pitch + ly * dt * (Settings.get('invertY') ? -1 : 1), -1.5, 1.5); Player.lastLookT = G.time; }
      // sprint helpers: latched sprint on touch / pad
      if (this.device === 'pad' && Settings.get('autoSprint')) this.act.sprint = this.axisMove.y > 0.9 || this.sprintLatch;
      if (this.device === 'touch') this.act.sprint = this.touch.sprint || this.sprintLatch;
      if (this.device === 'pad' || this.device === 'touch') this.act.breath = this.act.sprint;
    }
  },

  // ---------- touch ----------
  buildTouch() {
    const root = document.getElementById('touch'); if (!root) return;
    root.innerHTML = ''; root.classList.toggle('hidden', typeof G === 'undefined' || G.state !== 'playing'); document.body.classList.add('touch');          // (the buttons belong to a running match: the lobby must not show them)
    const T = this.touch; T.buttons = {};
    const k = Device.phone ? Device.k : clamp(innerHeight / 430, 0.62, 1.15); root.style.setProperty('--k', k);          // short screens (phones sideways) get smaller buttons placed closer to the edges (the same factor as the HUD, see Device.scale)
    const scaled = (x) => { const o = {}; for (const key in x) { const v = x[key]; o[key] = typeof v === 'string' && v.endsWith('px') ? Math.round(parseFloat(v) * k) + 'px' : v; } return o; };
    if (!T.resizeBound) { T.resizeBound = true; let rt = null; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (this.touchOn && !document.getElementById('touch').classList.contains('hidden')) this.buildTouch(); }, 250); }); }
    const mk = (cls, txt, x) => { const d = document.createElement('div'); d.className = 'tb ' + cls; d.textContent = txt; if (x) Object.assign(d.style, scaled(x)); root.appendChild(d); return d; };
    const bind = (el, act, o = {}) => {
      el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); el.classList.add('on'); this.device = 'touch'; if (o.toggle && act === 'aim') { this.aimToggle = true; if (Player.aiming) { this.release('aim', true); el.classList.remove('on'); return; } } this.press(act); });
      const up = e => { if (o.toggle && act === 'aim' && Player.aiming) return; el.classList.remove('on'); this.release(act); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      T.buttons[act] = el;
    };
    // joystick + look zone
    const joy = mk('joy', ''), knob = document.createElement('div'); knob.className = 'knob'; joy.appendChild(knob); T.joy = joy; T.knob = knob;
    const zoneL = mk('zone zl', ''), zoneR = mk('zone zr', '');
    zoneL.addEventListener('pointerdown', e => { e.preventDefault(); if (T.joyId !== null) return; T.joyId = e.pointerId; zoneL.setPointerCapture(e.pointerId); T.joyOrigin = { x: e.clientX, y: e.clientY }; joy.style.display = 'block'; joy.style.left = e.clientX - 60 + 'px'; joy.style.top = e.clientY - 60 + 'px'; this.device = 'touch'; });
    zoneL.addEventListener('pointermove', e => {
      if (e.pointerId !== T.joyId) return;
      let dx = e.clientX - T.joyOrigin.x, dy = e.clientY - T.joyOrigin.y; const l = Math.hypot(dx, dy), R = 56;
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.axisMove.x = dx / R; this.axisMove.y = -dy / R; T.sprint = Math.hypot(dx, dy) > R * 0.93 && -dy / R > 0.7;
    });
    const endJoy = e => { if (e.pointerId !== T.joyId) return; T.joyId = null; this.axisMove.x = this.axisMove.y = 0; T.sprint = false; joy.style.display = 'none'; knob.style.transform = ''; };
    zoneL.addEventListener('pointerup', endJoy); zoneL.addEventListener('pointercancel', endJoy);
    zoneR.addEventListener('pointerdown', e => { e.preventDefault(); if (T.lookId !== null) return; T.lookId = e.pointerId; zoneR.setPointerCapture(e.pointerId); T.lookLast = { x: e.clientX, y: e.clientY }; this.device = 'touch'; });
    zoneR.addEventListener('pointermove', e => {
      if (e.pointerId !== T.lookId || G.state !== 'playing' || !Player.alive) return;
      const dx = e.clientX - T.lookLast.x, dy = e.clientY - T.lookLast.y; T.lookLast = { x: e.clientX, y: e.clientY };
      const k = this.lookScale() * 0.0042;
      Player.yaw -= dx * k; Player.pitch = clamp(Player.pitch - dy * k * (Settings.get('invertY') ? -1 : 1), -1.5, 1.5); Player.lastLookT = G.time;
    });
    const endLook = e => { if (e.pointerId === T.lookId) T.lookId = null; };
    zoneR.addEventListener('pointerup', endLook); zoneR.addEventListener('pointercancel', endLook);
    const S = Settings.get('touchSize') || 1;
    const B = (act, txt, cls, pos, o) => { const el = mk('btn ' + cls, txt, pos); el.style.setProperty('--s', S); bind(el, act, o); return el; };
    // the layout is drawn for a 820 x 390 screen and scaled by k: the right thumb has FIRE in the corner with jump, aim and crouch around it and reload / interact one ring further out;
    // the left thumb steers (the stick appears wherever it touches the left half) and has a second fire button above that spot; the one other button is the menu (☰) in the top left corner:
    // it opens a tray with pause, camera, map and drop. Weapons and items (bandage, medkit, shield, grenades) are the tappable boxes of the HUD (hud.js); the minimap opens the big map.
    // (the touch layer lies BELOW the HUD in css/v3.css, otherwise its two big zones would swallow the taps on those boxes)
    B('fire', '●', 'fire', { right: '20px', bottom: '16px' }, {});
    B('jump', '⤒', 'jump', { right: '112px', bottom: '12px' }, {});
    B('aim', '⌖', 'aim', { right: '104px', bottom: '82px' }, { toggle: true });
    B('crouch', '⌄', 'crouch', { right: '24px', bottom: '106px' }, {});
    B('reload', '⟳', 'small reload', { right: '176px', bottom: '62px' }, {});
    const inter = B('interact', '✋', 'interact', { right: '170px', bottom: '124px' }, {}); T.interactBtn = inter; inter.style.display = 'none';
    B('fire', '●', 'fire2', { left: '22px', bottom: '150px' }, {});
    const tray = [['pause', 'II', 46], ['view', '👁', 90], ['map', '▦', 134], ['drop', '🗑', 178]].map(([act, txt, x]) => { const el = B(act, txt, 'mini tray t-' + act, { left: x + 'px', top: '8px' }, {}); el.style.display = 'none'; return el; });
    const menu = mk('btn mini menu', '☰', { left: '8px', top: '8px' }); let trayT = null;
    const showTray = on => { for (const t of tray) t.style.display = on ? 'flex' : 'none'; menu.classList.toggle('on', on); clearTimeout(trayT); if (on) trayT = setTimeout(() => showTray(false), 6000); };
    menu.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.device = 'touch'; showTray(tray[0].style.display === 'none'); });
    for (const t of tray) t.addEventListener('pointerup', () => setTimeout(() => showTray(false), 80));
    document.documentElement.style.touchAction = 'none';
    const fs = document.documentElement.requestFullscreen;
    window.__tryFullscreen = () => { try { if (fs && !document.fullscreenElement) document.documentElement.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch (e) { /* ignore */ } };
  },

  showTouch(on) { const r = document.getElementById('touch'); if (r && this.touchOn) r.classList.toggle('hidden', !on); },

  // contextual interact button follows the HUD prompt
  setInteract(on) { const b = this.touch.interactBtn; if (b) b.style.display = on ? 'flex' : 'none'; },

  // ---------- gamepad ----------
  detectPad(g) { this.padType = /054c|dualshock|dualsense|playstation|wireless controller/i.test(g.id) ? 'ps' : 'xbox'; },

  rumble(strong = 0.3, weak = 0.3, ms = 80) {
    if (this.device !== 'pad' || !Settings.get('vibration')) return;
    const g = navigator.getGamepads && navigator.getGamepads()[this.padIndex];
    try { if (g && g.vibrationActuator) g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* unsupported */ }
  },

  pollPad(dt) {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads(); let g = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { g = p; break; }
    if (!g) for (const p of pads) if (p && p.connected) { g = p; break; }
    if (!g) { this.padIndex = -1; return; }
    if (this.padIndex !== g.index) { this.padIndex = g.index; this.detectPad(g); }
    const b = i => (g.buttons[i] ? g.buttons[i].value : 0), pr = i => (g.buttons[i] && g.buttons[i].pressed), was = i => !!this.padPrev[i];
    const dz = 0.17, stick = (x, y) => { const m = Math.hypot(x, y); if (m < dz) return { x: 0, y: 0 }; const k = Math.pow((m - dz) / (1 - dz), 1.5) / m; return { x: x * k, y: y * k }; };
    const ls = stick(g.axes[0] || 0, g.axes[1] || 0), rs = stick(g.axes[2] || 0, g.axes[3] || 0);
    const any = Math.abs(ls.x) + Math.abs(ls.y) + Math.abs(rs.x) + Math.abs(rs.y) > 0.3 || g.buttons.some(x => x.pressed);
    if (any && this.device !== 'pad') { this.device = 'pad'; if (this.touchOn) document.body.classList.remove('touch'); }
    if (this.device !== 'pad') { this.padPrev = g.buttons.map(x => x.pressed); return; }
    this.pad.ls = ls; this.pad.rs = rs;
    const edge = i => pr(i) && !was(i), up = i => !pr(i) && was(i);
    if (G.state === 'playing' && Player.alive) {
      this.axisMove.x = ls.x; this.axisMove.y = -ls.y;
      const rt = b(7) > 0.35, lt = b(6) > 0.35;
      if (rt && !this.pad.rt) this.press('fire'); if (!rt && this.pad.rt) this.release('fire'); this.pad.rt = rt;
      if (lt && !this.pad.lt) this.press('aim'); if (!lt && this.pad.lt) this.release('aim'); this.pad.lt = lt;
      if (edge(0)) this.press('jump'); if (up(0)) this.release('jump');
      if (edge(1)) this.press('crouch'); if (up(1)) this.release('crouch');
      if (edge(2)) { this.press('reload'); this.padDropT = 0; } if (pr(2)) { this.padDropT = (this.padDropT || 0) + dt; if (this.padDropT > 0.7) { this.padDropT = -99; this.press('drop'); } } if (edge(3)) this.press('interact');
      if (edge(4)) this.cycle(-1); if (edge(5)) this.cycle(1);
      if (edge(12)) this.press('nade'); if (edge(13)) this.press('heal'); if (edge(14)) this.press('shield'); if (edge(15)) this.press('sticky');
      if (edge(10)) this.sprintLatch = !this.sprintLatch;
      if (edge(11)) this.press('view'); if (edge(8)) this.press('map'); if (edge(9)) this.press('pause');
      if (this.axisMove.y < 0.2) this.sprintLatch = this.sprintLatch && this.axisMove.y > -0.1;
    } else { this.axisMove.x = this.axisMove.y = 0; this.menuNav(g, edge, dt, ls); }
    this.padPrev = g.buttons.map(x => x.pressed);
  },

  // ---------- gamepad navigation of the menus ----------
  menuNav(g, edge, dt, ls) {
    const cand = [...document.querySelectorAll('.menu:not(.hidden) button, .menu:not(.hidden) .skin, .menu:not(.hidden) select, .menu:not(.hidden) input, .menu:not(.hidden) .shopItem, .menu:not(.hidden) .seg button, .screen:not(.hidden) button')].filter(e => e.offsetParent !== null && !e.disabled);
    if (!cand.length) return;
    let cur = document.querySelector('.padfocus');
    if (!cur || !cand.includes(cur)) { cur = cand.find(e => e.classList.contains('play')) || cand[0]; cand.forEach(e => e.classList.remove('padfocus')); cur.classList.add('padfocus'); }
    const dir = edge(12) ? 'up' : edge(13) ? 'down' : edge(14) ? 'left' : edge(15) ? 'right' : null;
    let d = dir;
    this.pad.navT -= dt;
    if (!d && this.pad.navT <= 0) { if (ls.y < -0.6) d = 'up'; else if (ls.y > 0.6) d = 'down'; else if (ls.x < -0.6) d = 'left'; else if (ls.x > 0.6) d = 'right'; if (d) this.pad.navT = 0.22; } else if (dir) this.pad.navT = 0.22;
    if (d) {
      const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2; let best = null, bs = 1e9;
      for (const e of cand) {
        if (e === cur) continue; const r = e.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
        const ok = d === 'up' ? y < -4 && Math.abs(y) >= Math.abs(x) * 0.5 : d === 'down' ? y > 4 && Math.abs(y) >= Math.abs(x) * 0.5 : d === 'left' ? x < -4 && Math.abs(x) >= Math.abs(y) * 0.5 : x > 4 && Math.abs(x) >= Math.abs(y) * 0.5;
        if (!ok) continue; const s = Math.hypot(x, y) + (d === 'up' || d === 'down' ? Math.abs(x) * 1.5 : Math.abs(y) * 1.5);
        if (s < bs) { bs = s; best = e; }
      }
      if (best) { cur.classList.remove('padfocus'); best.classList.add('padfocus'); best.scrollIntoView({ block: 'nearest' }); Sound.ui(); cur = best; }
    }
    if (edge(0)) {
      if (cur.tagName === 'SELECT') { const i = cur.selectedIndex; cur.selectedIndex = (i + 1) % cur.options.length; cur.dispatchEvent(new Event('change')); }
      else if (cur.type === 'range') { /* adjusted with left/right below */ } else cur.click();
    }
    if (cur.type === 'range' && (d === 'left' || d === 'right')) { const st = parseFloat(cur.step) || 1; cur.value = clamp(parseFloat(cur.value) + (d === 'right' ? st : -st) * 2, parseFloat(cur.min), parseFloat(cur.max)); cur.dispatchEvent(new Event('input')); }
    if (edge(1) && typeof Menu !== 'undefined') Menu.back();
    if (edge(4) && typeof Menu !== 'undefined') Menu.tabStep(-1); if (edge(5) && typeof Menu !== 'undefined') Menu.tabStep(1);
    if (edge(9) && G.state === 'paused') Game.resume();
  }
};
