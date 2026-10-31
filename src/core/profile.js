// Player profile: coins, points, level, inventory/loadout, lifetime stats, achievements and daily/weekly missions (localStorage).
const STAT_KEYS = ['games', 'wins', 'kills', 'deaths', 'headshots', 'damage', 'bikeKills', 'explosiveKills', 'swimDist', 'grassTime', 'supply', 'exotic', 'distance', 'duelWins', 'duelInsaneWins', 'insaneKills', 'pistolWins', 'ghostWins', 'flawless', 'ultraWins', 'flips', 'airTime', 'playTime'];
const MAX_KEYS = ['bestStreak', 'maxMatchKills', 'longShot', 'maxMulti', 'maxSurvive', 'maxFlipJump'];

// Version 3.9 replaced every skin by new characters. A profile saved before that (no "roster" number) loses its old skins and gets what they cost back as coins.
const SKIN_ROSTER = 3, DEFAULT_SKINS = ['recruit', 'rookie'];
const OLD_SKIN_PRICE = {
  arctic: 900, urban: 900, digital: 900, cowboy: 900, panda: 900, rogue: 900, skelminion: 900,
  tiger: 2200, ghillie: 2200, blackops: 2200, ninja: 2200, pirate: 2200, viking: 2200, pumpkin: 2200, mage: 2200, hooded: 2200, skelrogue: 2200,
  crimson: 5000, cyber: 5000, samurai: 5000, astro: 5000, reaper: 5000, robot: 5000, knight: 5000, alien: 5000, unicorn: 5000, neon: 5000, ghost: 5000, skelmage: 5000, skelwarrior: 5000,
  phantom: 11000, gold: 11000, dragon: 11000, frost: 11000, magma: 11000, celestial: 16000, ultra: 40000
};

const Profile = {
  d: null, match: null, notice: null,

  defaults() {
    const stats = {}; STAT_KEYS.concat(MAX_KEYS).forEach(k => { stats[k] = 0; });
    return {
      v: 1, roster: SKIN_ROSTER, name: 'Player', coins: 600, points: 0, xp: 0, created: Date.now(),
      owned: { skin: DEFAULT_SKINS.slice(), vest: [], helmet: [], boots: [], gloves: [], pack: [], starter: ['pistol_0'], map: ['classic', 'colosseum'] },
      loadout: { skin: DEFAULT_SKINS[0], vest: 0, helmet: 0, boots: 0, gloves: 0, pack: 0, starter: 'pistol_0', map: 'classic', duelMap: 'colosseum' },
      stats, streak: 0, ach: {}, missions: { daily: null, weekly: null }, friends: [], tutorialDone: false, lastBoard: 0, skill: { hist: [] }          // skill: how the last matches went (src/core/skill.js)
    };
  },

  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('lss-profile') || 'null'); } catch (e) { s = null; }
    const d = this.defaults();
    if (s) { Object.assign(d, s); d.owned = Object.assign(this.defaults().owned, s.owned || {}); d.loadout = Object.assign(this.defaults().loadout, s.loadout || {}); d.stats = Object.assign(this.defaults().stats, s.stats || {}); }
    if (s && (s.roster || 0) < SKIN_ROSTER) this.migrateSkins(d, s);
    this.d = d; this.ensureMissions();
  },

  // the old skins are taken away and paid back (the lobby tells the player once, see Profile.notice)
  migrateSkins(d, saved) {
    let refund = 0; for (const id of (saved.owned && saved.owned.skin) || []) refund += OLD_SKIN_PRICE[id] || 0;
    d.coins += refund; d.owned.skin = DEFAULT_SKINS.slice(); d.loadout.skin = DEFAULT_SKINS[0]; d.roster = SKIN_ROSTER;
    if (refund) this.notice = { refund };
    try { Settings.set('skin', DEFAULT_SKINS[0]); } catch (e) { /* settings unavailable */ }
  },

  save() { try { localStorage.setItem('lss-profile', JSON.stringify(this.d)); } catch (e) { /* storage unavailable */ } },
  reset() { this.d = this.defaults(); this.ensureMissions(); this.save(); },

  // ---------- currency / level ----------
  addCoins(n) { this.d.coins = Math.max(0, Math.round(this.d.coins + n)); this.save(); },
  addPoints(n) { this.d.points = Math.max(0, Math.round(this.d.points + n)); this.save(); },
  addXp(n) { const l0 = this.level(); this.d.xp += Math.round(n); this.save(); const l1 = this.level(); if (l1 > l0 && typeof HUD !== 'undefined') HUD.toast(I18n.t('toast.level', { n: l1 }), I18n.t('toast.levelSub'), 0x5fd14a); },
  level() { return 1 + Math.floor(Math.sqrt(this.d.xp / 120)); },
  levelProgress() { const l = this.level(), a = (l - 1) * (l - 1) * 120, b = l * l * 120; return clamp((this.d.xp - a) / (b - a), 0, 1); },

  // ---------- shop ----------
  skinPrice(sk) { return sk.price !== undefined ? sk.price : CATALOG.skinPrice[sk.rarity]; },
  owns(type, id) { return this.d.owned[type] && this.d.owned[type].includes(id); },
  canBuy(price) { return this.d.coins >= price; },

  buy(type, id, price) {
    if (this.owns(type, id)) return { ok: false, why: 'owned' };
    if (this.d.coins < price) return { ok: false, why: 'coins' };
    if (type === 'skin' && id === 'ultra' && !this.d.owned.skin.some(s => { const k = Character.byId(s); return k && k.rarity === 4; })) return { ok: false, why: 'ultraReq' };
    this.d.coins -= price; this.d.owned[type].push(id); this.save();
    Events.emit('buy', { type, id });
    return { ok: true };
  },

  equip(slot, value) { this.d.loadout[slot] = value; this.save(); },

  noEffects() { return { shield: 0, dr: 0, hsDr: 0, flashDr: 0, speed: 0, quiet: 0, reload: 0, equipSpeed: 0, meds: 0, shields: 0, frags: 0 }; },

  // aggregated bonuses from the equipped items
  effects() {
    const L = this.d.loadout, E = CATALOG.equip, t = k => Math.max(0, Math.min(5, L[k] || 0)) - 1;
    const v = t('vest'), h = t('helmet'), b = t('boots'), g = t('gloves'), p = t('pack');
    return {
      shield: v >= 0 ? E.vest.shield[v] : 0, dr: v >= 0 ? E.vest.dr[v] : 0, hsDr: h >= 0 ? E.helmet.hs[h] : 0, flashDr: h >= 0 ? E.helmet.flash[h] : 0,
      speed: b >= 0 ? E.boots.speed[b] : 0, quiet: b >= 0 ? E.boots.quiet[b] : 0, reload: g >= 0 ? E.gloves.reload[g] : 0, equipSpeed: g >= 0 ? E.gloves.equip[g] : 0,
      meds: p >= 0 ? E.pack.meds[p] : 0, shields: p >= 0 ? E.pack.shields[p] : 0, frags: p >= 0 ? E.pack.frags[p] : 0
    };
  },

  // ---------- stats / achievements ----------
  track(stat, v = 1, kind) {
    if (this.match && this.match.trial) return;
    const S = this.d.stats; if (S[stat] === undefined) S[stat] = 0;
    const max = kind === 'max' || MAX_KEYS.includes(stat);
    if (max) { if (v <= S[stat]) { this.trackMissions(stat, v, true); return; } S[stat] = v; } else S[stat] += v;
    this.trackMissions(stat, v, max);
    this.checkAchievements();
  },

  achList() {
    const out = [];
    for (const c of CATALOG.chains) c.goals.forEach((goal, tier) => {
      const id = c.id + ':' + tier, val = this.d.stats[c.stat] || 0;
      out.push({ id, chain: c.id, tier, goal, pts: Math.round(CATALOG.achPts[Math.min(tier, 4)] * c.m), coins: Math.round(CATALOG.achCoins[Math.min(tier, 4)] * c.m), val: Math.min(val, goal), done: !!this.d.ach[id], special: !!c.special, stat: c.stat });
    });
    return out;
  },

  checkAchievements() {
    let any = false;
    for (const a of this.achList()) {
      if (a.done) continue;
      const c = CATALOG.chains.find(x => x.id === a.chain);
      if ((this.d.stats[c.stat] || 0) >= a.goal) {
        this.d.ach[a.id] = Date.now(); this.d.coins += a.coins; this.d.points += a.pts; any = true;
        if (typeof HUD !== 'undefined') HUD.toast(I18n.t('ach.' + a.chain + '.n') + ' ' + ['I', 'II', 'III', 'IV', 'V'][a.tier], I18n.t('toast.ach', { pts: a.pts, coins: a.coins }), a.special ? 0xffd24a : 0x4aa8ff);
        Sound.pickup && Sound.pickup();
      }
    }
    if (any) this.save();
  },

  // ---------- missions ----------
  dayKey() { const t = new Date(); return t.getFullYear() * 10000 + (t.getMonth() + 1) * 100 + t.getDate(); },
  weekKey() { const t = new Date(), s = new Date(t.getFullYear(), 0, 1); return t.getFullYear() * 100 + Math.floor((t - s) / 604800000); },

  makeMissions(seed, weekly) {
    const rng = mulberry32(seed), pool = CATALOG.missions.slice(), list = [];
    for (let tier = 0; tier < 3; tier++) {
      const i = Math.floor(rng() * pool.length), m = pool.splice(i, 1)[0], k = weekly ? 4 : 1, rw = CATALOG.missionReward[tier];
      list.push({ id: m.id, stat: m.stat, kind: m.kind || 'inc', tier, goal: Math.round(m.g[tier] * (weekly ? (m.kind === 'max' ? 1.4 : 4) : 1)), progress: 0, done: false, coins: rw.coins * (weekly ? 5 : 1), pts: rw.pts * (weekly ? 4 : 1) });
      void k;
    }
    return list;
  },

  ensureMissions() {
    const M = this.d.missions, dk = this.dayKey(), wk = this.weekKey();
    if (!M.daily || M.daily.key !== dk) M.daily = { key: dk, list: this.makeMissions(dk, false) };
    if (!M.weekly || M.weekly.key !== wk) M.weekly = { key: wk, list: this.makeMissions(wk * 7 + 3, true) };
    this.save();
  },

  trackMissions(stat, v, isMax) {
    for (const grp of [this.d.missions.daily, this.d.missions.weekly]) {
      if (!grp) continue;
      for (const m of grp.list) {
        if (m.done || m.stat !== stat) continue;
        m.progress = isMax || m.kind === 'max' ? Math.max(m.progress, v) : m.progress + v;
        if (m.progress >= m.goal) {
          m.progress = m.goal; m.done = true; this.d.coins += m.coins; this.d.points += m.pts;
          if (typeof HUD !== 'undefined') HUD.toast(I18n.t('toast.mission'), I18n.t('mission.' + m.id, { n: m.goal }) + ' · +' + m.coins, 0x5fd14a);
        }
      }
    }
    this.save();
  },

  // ---------- matches ----------
  beginMatch(mode, lvl) {                          // lvl: the player's rating at the start (src/core/skill.js): the opponents are matched to it
    this.match = { mode, lvl, kills: 0, headshots: 0, damage: 0, t0: Date.now(), bikeKills: 0, explosiveKills: 0, swim: 0, grass: 0, supply: 0, took: false, shots: 0, nonPistol: false, storm: 0, longShot: 0, ultra: this.d.loadout.skin === 'ultra', multi: 0, distance: 0, exotic: false, trial: Weapons.trial() };               // a trial match (Phantom-X test option) counts for nothing
  },

  endMatch(o) {
    const m = this.match || {}, S = this.d.stats, duel = m.mode === 'duel';
    const dIdx = Math.min(3, Math.floor((m.lvl || 0) / 25)), top = (m.lvl || 0) >= 80;                 // a stronger opponent pays more; "top" = the level that used to be Insane
    let coins, pts;
    if (duel) { coins = 40 + (o.won ? 160 + 60 * dIdx : 15); pts = o.won ? 20 : 3; }
    else { coins = 20 + (m.kills || 0) * 15 + Math.floor((o.time || 0) / 12) + (o.won ? 250 : o.rank <= 3 ? 80 : o.rank <= 5 ? 40 : 0); pts = 5 + (o.won ? 30 : 0) + (m.kills || 0); }
    const mult = o.coinMult || 1; coins = Math.round(coins * mult);
    this.d.coins += coins; this.d.points += pts; this.addXp(coins);
    this.d.stats.games++; this.trackMissions('games', 1, false);
    if (o.won) { this.d.stats.wins++; this.trackMissions('wins', 1, false); this.d.streak++; if (this.d.streak > S.bestStreak) S.bestStreak = this.d.streak; this.trackMissions('bestStreak', this.d.streak, true); } else { this.d.streak = 0; S.deaths++; }
    S.playTime = (S.playTime || 0) + Math.max(0, Math.round(o.time || 0));
    if (duel && o.won) { S.duelWins++; this.trackMissions('duelWins', 1, false); if (top) S.duelInsaneWins++; }
    if (!duel) {
      S.kills += m.kills || 0; this.trackMissions('kills', m.kills || 0, false); S.headshots += m.headshots || 0; this.trackMissions('headshots', m.headshots || 0, false);
      S.damage += Math.round(m.damage || 0); this.trackMissions('damage', Math.round(m.damage || 0), false); S.bikeKills += m.bikeKills || 0; this.trackMissions('bikeKills', m.bikeKills || 0, false);
      S.explosiveKills += m.explosiveKills || 0; this.trackMissions('explosiveKills', m.explosiveKills || 0, false); S.swimDist += Math.round(m.swim || 0); this.trackMissions('swimDist', Math.round(m.swim || 0), false);
      S.grassTime += Math.round(m.grass || 0); this.trackMissions('grassTime', Math.round(m.grass || 0), false); S.supply += m.supply || 0; this.trackMissions('supply', m.supply || 0, false);
      S.distance += Math.round(m.distance || 0); S.exotic += m.exotic ? 1 : 0;
      if (top) S.insaneKills += m.kills || 0;
      S.maxMatchKills = Math.max(S.maxMatchKills, m.kills || 0); S.longShot = Math.max(S.longShot, Math.round(m.longShot || 0)); S.maxMulti = Math.max(S.maxMulti, m.multi || 0);
      S.maxSurvive = Math.max(S.maxSurvive, Math.round(o.time || 0)); this.trackMissions('maxSurvive', Math.round(o.time || 0), true);
      if (o.won) {
        if (!m.took) S.flawless++; if (!m.nonPistol && m.shots > 0) S.pistolWins++; if (m.shots === 0) S.ghostWins++; if (m.ultra) S.ultraWins++;
      }
    }
    if (typeof Skill !== 'undefined') Skill.record(o, m);
    this.checkAchievements(); this.save();
    return { coins, pts, xp: coins };
  }
};
