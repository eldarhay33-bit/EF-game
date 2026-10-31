// The matchmaker: who plays with whom. Pure logic, no network and no DOM, so the same file runs in the Cloudflare worker (server/worker.js), in the dev lobby page (server/dev-lobby.html)
// and in the tests. It is a plain script (no import / export): in the browser it defines the global Matchmaker, in a worker or Node it is module.exports.
//
// A player who wants a match sends a ticket { id, mode: 'br' | 'duel', n (name), skin, lo (equipment tiers), r (rating 0..100, src/core/skill.js), hs (how good a host the device is) }.
// tick(now) is called every second or two and says what has to be sent to whom: [{ to: id, msg }]
//   { t: 'w', mode, s: seconds waited, n: tickets of this mode }                        a status line while waiting
//   { t: 'm', id, mode, role, host, members: [{ u, n, skin, r, lo }], bots, br }        a match: the host (best device) runs it, the others join it; bots fill the places that are still empty
//   { t: 'x', why: 'timeout' }                                                          duel: nobody of the same level came in time, the client plays against a bot
// Rules: players of about the same level are put together (the band starts at +-15 rating points and widens by 10 every 8 seconds, so nobody waits for ever);
//   battle royale: 20 places; starts at once when 20 are found, after 15 seconds when at least 10 are (10 real players are enough), after 60 seconds with whoever is there (bots fill the rest);
//   duel: two players; after 30 seconds without a partner the player is told to take a bot.
(function (root) {
  const DEFAULTS = {
    br: { size: 20, minStart: 10, grace: 15000, wait: 60000 },
    duel: { size: 2, wait: 30000 },
    bandStart: 15, bandStep: 10, bandEvery: 8000,
    maxAge: 150000
  };

  class Matchmaker {
    constructor(cfg) { this.cfg = Object.assign({}, DEFAULTS, cfg || {}); this.tickets = new Map(); this.seq = 0; this.matchSeq = 0; }

    // a player joins the queue (a second ticket of the same player replaces the first)
    enqueue(t, now) {
      if (!t || !t.id || (t.mode !== 'br' && t.mode !== 'duel')) return false;
      this.tickets.set(t.id, { id: String(t.id), mode: t.mode, n: String(t.n || 'Player').slice(0, 14), skin: String(t.skin || 'recruit').slice(0, 24), lo: t.lo || null, r: Math.max(0, Math.min(100, Number(t.r) || 0)), hs: Number(t.hs) || 0, t0: now, seq: ++this.seq });
      return true;
    }
    cancel(id) { return this.tickets.delete(id); }
    count(mode) { let n = 0; for (const t of this.tickets.values()) if (t.mode === mode) n++; return n; }
    band(ms) { return this.cfg.bandStart + Math.floor(ms / this.cfg.bandEvery) * this.cfg.bandStep; }

    // the host of a group: the best device (hs), the one that has waited longest if equal
    pickHost(group) { return group.slice().sort((a, b) => (b.hs - a.hs) || (a.seq - b.seq))[0]; }

    makeMatch(mode, group, bots) {
      const host = this.pickHost(group), id = 'm' + (++this.matchSeq).toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      const members = group.map(t => ({ u: t.id, n: t.n, skin: t.skin, r: Math.round(t.r), lo: t.lo })), br = Math.round(group.reduce((a, t) => a + t.r, 0) / group.length);
      return group.map(t => ({ to: t.id, msg: { t: 'm', id, mode, role: t.id === host.id ? 'host' : 'guest', host: host.id, members, bots, br } }));
    }

    tick(now) {
      const out = [], c = this.cfg;
      for (const t of Array.from(this.tickets.values())) if (now - t.t0 > c.maxAge) this.tickets.delete(t.id);
      for (const mode of ['br', 'duel']) {
        const q = Array.from(this.tickets.values()).filter(t => t.mode === mode).sort((a, b) => a.seq - b.seq);
        const used = new Set();
        for (const a of q) {
          if (used.has(a.id)) continue;
          const waited = now - a.t0, band = this.band(waited), M = c[mode];
          const near = q.filter(t => !used.has(t.id) && (t === a || Math.abs(t.r - a.r) <= band)).sort((x, y) => (x === a ? -1 : y === a ? 1 : Math.abs(x.r - a.r) - Math.abs(y.r - a.r)));
          const group = near.slice(0, M.size);
          let go = false;
          if (mode === 'br') go = group.length >= M.size || (group.length >= M.minStart && waited >= M.grace) || waited >= M.wait;
          else if (group.length >= 2) go = true;
          if (go) {
            for (const t of group) used.add(t.id);
            out.push(...this.makeMatch(mode, group, mode === 'br' ? M.size - group.length : 0));
          } else if (mode === 'duel' && waited >= M.wait) { used.add(a.id); out.push({ to: a.id, msg: { t: 'x', why: 'timeout' } }); }
        }
        for (const t of this.tickets.values()) if (t.mode === mode && used.has(t.id)) this.tickets.delete(t.id);
      }
      for (const t of this.tickets.values()) out.push({ to: t.id, msg: { t: 'w', mode: t.mode, s: Math.floor((now - t.t0) / 1000), n: this.count(t.mode) } });
      return out;
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = Matchmaker; else root.Matchmaker = Matchmaker;
})(typeof self !== 'undefined' ? self : this);
