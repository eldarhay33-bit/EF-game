// 1v1 duel: best of three rounds in a dedicated arena against a bot (or a friend over the network, see net/p2p.js).
// Both fighters get the same loadout, no equipment bonuses, so the result only depends on skill.
const DUEL_LOADOUT = {
  weapons: [{ id: 'ar', rarity: 2 }, { id: 'shotgun', rarity: 1 }, { id: 'pistol', rarity: 1 }],
  ammo: { light: 60, medium: 150, shells: 24, heavy: 0, rocket: 0 }, meds: 3, shields: 2, frags: 1, flash: 1
};

const Duel = {
  active: false, round: 0, score: [0, 0], phase: 'idle', t: 0, opp: null, map: 'colosseum', need: 2, guideT: 0, roundT: 0, net: null,

  info() {
    if (!this.active) return '';
    return I18n.t('duel.info', { a: this.score[0], b: this.score[1], r: this.round });
  },

  begin(opts) {
    opts = opts || {};
    const map = opts.map || Profile.d.loadout.duelMap || 'colosseum'; this.map = map; this.net = opts.net || null;
    Arena.enter(map);
    SkySys.apply(map === 'ruins' ? 'golden' : map === 'neon' ? 'night' : 'day'); Game.syncEnv();
    Themes.setLamp(false);
    this.active = true; this.round = 0; this.score = [0, 0]; this.need = 2;
    Player.reset(); Player.fair = true; Player.fx = Profile.noEffects(); Player.buildRig();                  // (no equipment on the body: it has no effect in a duel)
    Zone.reset(); Zone.wall.visible = false;
    this.startRound();
  },

  leave() {
    if (!this.active && !Arena.group) return;
    this.active = false; this.phase = 'idle'; this.opp = null; Player.frozen = false; Player.fair = false;
    if (Arena.kind !== 'training') Arena.leave();
  },

  giveLoadout(a) {
    const L = DUEL_LOADOUT;
    a.health = a.maxHealth || 100; a.shield = 0;
    if (a === Player) {
      a.alive = true; a.slots = L.weapons.map(l => { const w = Weapons.make(l.id, l.rarity); w.mag = w.size; return { w }; }).concat([null, null]); a.cur = 0;
      a.ammo = Object.assign({}, L.ammo); a.meds = { small: L.meds, big: 0 }; a.shields = { small: L.shields, big: 0 }; a.nades = { frag: L.frags, smoke: 0, flash: L.flash, sticky: 0 };
      a.reloadT = 0; a.equipT = 0.5; a.useT = 0; a.pendingUse = null; a.throwT = 0; a.firing = false; a.aiming = false; a.vmKey = ''; a.rigGunKey = '';
      a.crouch = false; a.sliding = 0; a.vel.set(0, 0, 0); a.invuln = false;
    }
  },

  startRound() {
    this.round++; this.phase = 'count'; this.t = 3.4; this.roundT = 0;
    Projectiles.reset(); Loot.clear(); Bots.reset();
    const sp = Arena.spawns, flip = (this.round % 2 === 0) !== !!(this.net && !this.net.host), me = sp[flip ? 1 : 0], foe = sp[flip ? 0 : 1];
    Player.phase = 'ground'; Player.onGround = true; Player.pos.set(me[0], 0, me[1]); Player.yaw = me[2]; Player.pitch = 0; Player.riding = false; Player.tppNow = false;
    if (Player.rig) Player.rig.root.visible = false;
    this.giveLoadout(Player);
    if (this.net) this.net.onRound(this, foe);
    else {
      this.opp = Bots.spawnGround(foe[0], foe[1], foe[2], { name: Duel.rivalName(), diff: Skill.duelRating(), loadout: DUEL_LOADOUT.weapons, ammo: DUEL_LOADOUT.ammo, meds: DUEL_LOADOUT.meds });
      this.opp.frozenUntil = G.time + this.t;
    }
    Player.frozen = true;
    HUD.banner(I18n.t('duel.round', { n: this.round }), 2.2);
    G.noises.length = 0;
  },

  rivalName() { return pick(BOT_NAMES) + (Profile.match && (Profile.match.lvl || 0) >= 80 ? ' ☠' : ''); },          // (the skull marks an opponent of the top level)

  update(dt) {
    if (!this.active) return;
    if (this.phase === 'count') {
      const was = Math.ceil(this.t); this.t -= dt; const now = Math.ceil(this.t);
      if (now !== was && now > 0) { HUD.banner(String(now), 0.9); Sound.ui(); }
      if (this.opp) { this.opp.grace = 99; }
      if (this.t <= 0) { this.phase = 'fight'; Player.frozen = false; if (this.opp) this.opp.grace = 0; HUD.banner(I18n.t('duel.go'), 1.1); Sound.pickup(); }
    } else if (this.phase === 'fight') {
      this.roundT += dt; this.guideT -= dt;
      const o = this.opp;
      if (o && o.alive && this.guideT <= 0 && !this.net) {
        this.guideT = 1.1;
        if (!o.canSee) { o.suspect = { x: Player.pos.x + mr(-3, 3), z: Player.pos.z + mr(-3, 3) }; o.suspectT = G.time; o.enemy = Player; }
        if (o.alive && o.health < 45 && o.meds.small > 0 && G.time - o.lastHurt > 3) o.tryHeal();
      }
      if (this.roundT > 110 && o && !this.net) { this.endRound(Player.health + Player.shield >= o.health + o.shield); }          // time over: more health wins
    } else if (this.phase === 'over') {
      this.t -= dt;
      if (this.t <= 0) {
        if (this.score[0] >= this.need || this.score[1] >= this.need) this.finish();
        else this.startRound();
      }
    }
  },

  onKill(victim) {
    if (this.phase !== 'fight') return;
    if (victim === this.opp) this.endRound(true);
  },

  onPlayerDied() {
    if (this.phase !== 'fight') return;
    this.endRound(false);
  },

  endRound(playerWon) {
    this.phase = 'over'; this.t = 3.0; this.score[playerWon ? 0 : 1]++;
    HUD.banner(I18n.t(playerWon ? 'duel.won' : 'duel.lost') + '  ' + this.score[0] + ' - ' + this.score[1], 3);
    const M = Profile.match; if (M && playerWon && Player.health >= 100) M.flawlessRound = true;
  },

  finish() {
    const won = this.score[0] > this.score[1];
    this.phase = 'done';
    Game.finish(won, { title: I18n.t(won ? 'duel.victory' : 'duel.defeat'), stats: I18n.t('duel.final', { a: this.score[0], b: this.score[1], d: Skill.name(Profile.match ? Profile.match.lvl : undefined) }), total: 2, rank: won ? 1 : 2, time: Math.round(G.time) });
  }
};
