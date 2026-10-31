// The level of the player, worked out from what the player has done, and everything that follows from it. There is no difficulty picker any more:
//   - the bots are as good as the player (and a few better, a few worse), see params() and botRating(); a new player meets easy bots, a veteran meets hard ones
//   - the bots wear the equipment that goes with their level and it protects them the same way it protects the player (tierFor, loadoutFor, protection)
//   - online, the same number puts the player with opponents of the same level (the server matches on rating(); see docs/ONLINE-PLAN.md)
// The rating is 0..100 and comes from four things the player did (win rate, eliminations per match, points, play time) and from how the last ten matches went, so it follows the player:
// a player who starts winning meets harder opponents within a few matches, one who struggles gets easier ones. A player who has played less than about twelve matches is held near the bottom.
// The four old difficulty tables of settings.js (easy, normal, hard, insane) are the anchors the bot values are drawn between.
const Skill = {
  anchors: ['easy', 'normal', 'hard', 'insane'],

  hist() { const d = Profile.d; if (!d.skill) d.skill = { hist: [] }; return d.skill.hist; },

  // 0..100
  rating() {
    const d = Profile.d, S = d.stats, g = S.games || 0, h = this.hist();
    const wr = clamp(((S.wins + 0.5) / (g + 10)) / 0.25, 0, 1);                       // win rate, held down while there are few matches; 25 % is full marks
    const kpg = clamp((S.kills / Math.max(1, g)) / 3.5, 0, 1);                         // eliminations per battle royale match
    const pts = clamp(Math.log10(1 + d.points) / 4, 0, 1);                              // points: 10,000 is full marks
    const tm = clamp(Math.log10(1 + (S.playTime || 0) / 60) / 3, 0, 1);                 // play time in minutes: 1,000 is full marks
    const life = 100 * (0.4 * wr + 0.25 * kpg + 0.2 * pts + 0.15 * tm);
    const recent = h.length ? 100 * h.reduce((a, x) => a + x, 0) / h.length : life;      // the last ten matches
    const trust = clamp(g / 12, 0, 1);
    return clamp(trust * (0.6 * life + 0.4 * recent) + (1 - trust) * 12, 0, 100);
  },

  // the names of the five levels (language keys skill.0 .. skill.4)
  index(r) { return Math.min(4, Math.floor(clamp(r, 0, 99.9) / 20)); },
  name(r) { return I18n.t('skill.' + this.index(r === undefined ? this.rating() : r)); },

  // the values of the bot AI for a rating: drawn between the four tables of DIFFICULTY (easy at 0, normal at 33, hard at 67, insane at 100)
  params(r) {
    const k = clamp(r, 0, 100) / 33.34, i = Math.min(2, Math.floor(k)), f = k - i, A = DIFFICULTY[this.anchors[i]], B = DIFFICULTY[this.anchors[i + 1]], o = {};
    for (const key in A) { const a = A[key], b = B[key]; o[key] = Array.isArray(a) ? a.map((v, j) => lerp(v, b[j], f)) : typeof a === 'number' ? lerp(a, b, f) : a; }
    o.hp = 0.9 + 0.2 * clamp(r, 0, 100) / 100;                                                     // (health: the strong bots get their toughness from the equipment they wear, not from extra health)
    return o;
  },

  // the level of one bot of a match: around the player's, a little below on average, the spread of three dice (mostly within 10, now and then 30 away)
  botRating(base) {
    const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    return clamp((base === undefined ? this.rating() : base) + g * 30 - 4, 0, 100);
  },
  // an opponent in a duel: the player's level, give or take five
  duelRating() { return clamp(this.rating() + (Math.random() - 0.5) * 10, 0, 100); },

  // the equipment a bot of this level wears (a tier from 0 to 5, a little different for each piece), and what it is worth
  tierFor(r) { return r < 14 ? 0 : r < 32 ? 1 : r < 50 ? 2 : r < 68 ? 3 : r < 86 ? 4 : 5; },
  loadoutFor(r) {
    const t = this.tierFor(r); if (!t) return null;
    const j = () => clamp(t + (Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0), 0, 5);
    return { vest: j(), helmet: j(), boots: j(), gloves: j(), pack: j() };
  },
  protection(lo) {
    if (!lo) return { dr: 0, hs: 0 }; const E = CATALOG.equip;
    return { dr: lo.vest > 0 ? E.vest.dr[lo.vest - 1] : 0, hs: lo.helmet > 0 ? E.helmet.hs[lo.helmet - 1] : 0 };
  },

  // after a match: how it went, 0..1 (placement and eliminations; a duel is won or lost). The rating follows the last ten.
  record(o, m) {
    const duel = m.mode === 'duel', total = o.total || (duel ? 2 : 20), rank = o.rank || (o.won ? 1 : total);
    const place = total > 1 ? 1 - (rank - 1) / (total - 1) : (o.won ? 1 : 0);
    const x = duel ? (o.won ? 0.9 : 0.2) : clamp(0.65 * place + 0.35 * Math.min(1, (m.kills || 0) / 4), 0, 1), h = this.hist();
    h.push(Math.round(x * 1000) / 1000); while (h.length > 10) h.shift();
  }
};
