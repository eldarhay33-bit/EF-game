// Interactive tutorial in the training ground: one short step at a time, device-aware prompts, practice targets and a final sparring bot.
const Tutorial = {
  active: false, step: 0, steps: null, st: {}, dummies: [], bot: null, spawnT: 0,

  def() {
    const K = a => Input.key(a);
    return [
      { id: 'look', hint: () => I18n.t('tut.look.' + Input.device), done: s => s.turn > 1.6 },
      { id: 'move', hint: () => I18n.t('tut.move.' + Input.device), done: s => s.dist > 10 },
      { id: 'sprint', hint: () => I18n.t('tut.sprint.' + Input.device, { k: K('sprint') }), done: s => s.sprint > 1.5 },
      { id: 'jump', hint: () => I18n.t('tut.jump', { k: K('jump') }), done: s => s.jumped },
      { id: 'crouch', hint: () => I18n.t('tut.crouch', { k: K('crouch') }), done: s => s.crouched > 0.6 },
      { id: 'pickup', hint: () => I18n.t('tut.pickup', { k: K('interact') }), done: () => Player.slots.some(s => s && s.w.id === 'ar'), setup: () => { const p = Player.pos, f = Player.forward(); Loot.spawn(p.x + f.x * 4, groundAt(p.x + f.x * 4, p.z + f.z * 4, 5), p.z + f.z * 4, { kind: 'weapon', w: Weapons.make('ar', 1) }); Loot.spawn(p.x + f.x * 5, groundAt(p.x + f.x * 5, p.z + f.z * 5, 5), p.z + f.z * 5 + 1, { kind: 'ammo', type: 'medium', amount: 90 }); } },
      { id: 'slots', hint: () => I18n.t('tut.slots.' + Input.device), done: s => s.slotSwitched },
      { id: 'aim', hint: () => I18n.t('tut.aim', { k: K('aim') }), done: s => s.aimed > 1.0 },
      { id: 'shoot', hint: () => I18n.t('tut.shoot', { k: K('fire'), n: Math.max(0, 3 - Tutorial.st.kills) }), done: s => s.kills >= 3, setup: () => Tutorial.spawnDummies() },
      { id: 'reload', hint: () => I18n.t('tut.reload', { k: K('reload') }), done: s => s.reloaded, setup: () => { const w = Player.weapon(); if (w) w.mag = Math.min(w.mag, 5); } },
      { id: 'heal', hint: () => I18n.t('tut.heal', { k: K('heal') }), done: s => s.healed, setup: () => { Player.health = 55; Player.meds.small = Math.max(2, Player.meds.small); } },
      { id: 'nade', hint: () => I18n.t('tut.nade', { k: K('nade') }), done: s => s.threw, setup: () => { Player.nades.frag = Math.max(2, Player.nades.frag); } },
      { id: 'grass', hint: () => I18n.t('tut.grass'), done: () => true, auto: 5 },
      { id: 'fight', hint: () => I18n.t('tut.fight'), done: s => s.botDown, setup: () => Tutorial.spawnSparring() }
    ];
  },

  begin() {
    Arena.enter('training');
    SkySys.apply('day'); Game.syncEnv(); Themes.setLamp(false);
    Zone.reset(); Zone.wall.visible = false;
    Player.reset(); Player.fair = true; Player.fx = Profile.noEffects();
    const sp = Arena.spawns[0];
    Player.phase = 'ground'; Player.onGround = true; Player.pos.set(sp[0], 0, sp[1]); Player.yaw = sp[2]; Player.pitch = 0; Player.tppNow = false;
    Duel.giveLoadout(Player); Player.slots = [{ w: Object.assign(Weapons.make('pistol', 0), { mag: 15 }) }, null, null, null, null]; Player.ammo = { light: 90, medium: 0, shells: 0, heavy: 0, rocket: 0 }; Player.meds = { small: 0, big: 0 }; Player.nades = { frag: 0, smoke: 0, flash: 0, sticky: 0 };
    this.active = true; this.steps = this.def(); this.step = -1; this.dummies = []; this.bot = null;
    this.st = {}; this.next(true);
    HUD.el.tutBox.classList.add('on'); HUD.el.tutBox.onclick = () => this.skip();
    document.addEventListener('keydown', this.keyHandler = e => { if (e.code === 'KeyN' && G.state === 'playing') this.skip(); });
  },

  leave() {
    if (!this.active) return;
    this.active = false; if (HUD.el.tutBox) HUD.el.tutBox.classList.remove('on');
    document.removeEventListener('keydown', this.keyHandler);
    Arena.leave(); Bots.reset();
  },

  next(first) {
    this.step++;
    if (this.step >= this.steps.length) { this.complete(); return; }
    const was = this.st;
    this.st = { turn: 0, dist: 0, sprint: 0, jumped: false, crouched: 0, aimed: 0, kills: 0, reloaded: false, healed: false, threw: false, botDown: false, lastYaw: Player.yaw, lastPos: Player.pos.clone(), t: 0, slotSwitched: false };
    if (!first) Sound.pickup();
    const s = this.steps[this.step]; if (s.setup) s.setup();
    void was; this.render();
  },

  skip() { if (this.active && G.state === 'playing') this.next(); },

  render() {
    const s = this.steps[this.step], box = HUD.el.tutBox;
    box.innerHTML = `<small>${I18n.t('tut.step', { n: this.step + 1, m: this.steps.length })}</small><b>${I18n.t('tut.t.' + s.id)}</b><span>${s.hint()}</span><em>${I18n.t('tut.skip', { k: Input.device === 'kbm' ? 'N' : '' })}</em>`;
  },

  spawnDummies() {
    const spawn = (x, z, i) => { const b = Bots.spawnGround(x, z, Math.PI / 2, { name: 'Target ' + (i + 1), passive: true, hp: 60 }); this.dummies.push(b); };
    [[-12, -22], [2, -22], [18, -22], [34, -22], [6, -10]].forEach(([x, z], i) => spawn(x, z, i));
  },

  spawnSparring() {
    this.bot = Bots.spawnGround(30, 8, Math.PI / 2, { name: 'Sparring', diff: 'easy', loadout: [{ id: 'smg', rarity: 0 }, { id: 'pistol', rarity: 0 }], ammo: { light: 180, medium: 0, shells: 0, heavy: 0, rocket: 0 } });
    this.bot.dmgScale *= 0.5;
  },

  onKill(victim) {
    if (victim.passive) { this.st.kills++; this.render(); setTimeout(() => { if (this.active && this.steps[this.step] && this.steps[this.step].id === 'shoot' && G.bots.indexOf(victim) >= 0) { /* corpse removed by Bots */ } }, 0); }
    else if (victim === this.bot) this.st.botDown = true;
  },

  onPlayerDied() {            // training never ends in defeat: stand back up
    setTimeout(() => {
      if (!this.active) return;
      Player.alive = true; Player.health = 100; Player.shield = 0; Player.tppNow = false; if (Player.rig) Player.rig.root.visible = false; Player.vel.set(0, 0, 0);
      const sp = Arena.spawns[0]; Player.pos.set(sp[0], 0, sp[1]); G.state = 'playing'; HUD.banner(I18n.t('tut.respawn'), 2);
    }, 1200);
  },

  update(dt) {
    if (!this.active || this.step < 0 || this.step >= this.steps.length) return;
    const S = this.st, P = Player; S.t += dt;
    S.turn += Math.abs(angDiff(S.lastYaw, P.yaw)); S.lastYaw = P.yaw;
    const d = Math.hypot(P.pos.x - S.lastPos.x, P.pos.z - S.lastPos.z); S.dist += d; S.lastPos.copy(P.pos);
    if (P.sprinting) S.sprint += dt; if (!P.onGround && P.vel.y > 2) S.jumped = true; if (P.crouch) S.crouched += dt; if (P.aimT > 0.8) S.aimed += dt;
    if (P.reloadT > 0) S.reloaded = true; if (P.useT > 0) S.healed = true; if (P.throwT > 0) S.threw = true;
    if (P.cur !== (S.curAtStart === undefined ? (S.curAtStart = P.cur) : S.curAtStart)) this.st.slotSwitched = true;
    const step = this.steps[this.step];
    // dummies stand back up a few seconds after being hit
    this.spawnT -= dt;
    if (step.id === 'shoot' && this.spawnT <= 0) { this.spawnT = 2; const alive = this.dummies.filter(b => b.alive).length; if (alive < 2) this.spawnDummies2(); }
    if (S.t > 0.4 && (step.done(S) || (step.auto && S.t > step.auto))) this.next();
    else if (Math.floor(S.t * 2) !== Math.floor((S.t - dt) * 2)) this.render();
  },

  spawnDummies2() {
    const pos = [[-6, -22], [10, -22], [26, -22], [40, -22]];
    const [x, z] = pick(pos); const b = Bots.spawnGround(x, z, Math.PI / 2, { name: 'Target', passive: true, hp: 60 }); this.dummies.push(b);
  },

  complete() {
    this.active = false; HUD.el.tutBox.classList.remove('on');
    Game.finish(true, { title: I18n.t('tut.done'), stats: I18n.t('tut.doneSub'), rank: 1, total: 1, time: Math.round(G.time) });
  }
};
