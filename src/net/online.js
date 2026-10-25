// Online services: global ULTRA MAX leaderboard (Firebase Realtime Database REST, optional) with a local fallback.
// Peer-to-peer play (friends, duel, squads) is added below by Online.p2p (see net/p2p.js).
const Online = {
  // Optional shared backend: paste a Firebase Realtime Database URL (rules: read/write true) into Settings -> Online server.
  dbUrl() { return (Settings.get('dbUrl') || '').trim().replace(/\/+$/, ''); },

  localBoard() { try { return JSON.parse(localStorage.getItem('lss-board') || '[]'); } catch (e) { return []; } },
  saveLocal(list) { try { localStorage.setItem('lss-board', JSON.stringify(list)); } catch (e) { /* storage unavailable */ } },

  async fetchBoard() {
    const url = this.dbUrl(), local = this.localBoard();
    if (url) {
      try {
        const r = await fetch(url + '/leaderboard.json', { cache: 'no-store' });
        if (r.ok) {
          const data = await r.json() || {};
          const list = Object.values(data).filter(e => e && e.name && e.points >= 0).sort((a, b) => b.points - a.points).slice(0, 100);
          return { online: true, list };
        }
      } catch (e) { /* fall through to local */ }
    }
    return { online: false, list: local.sort((a, b) => b.points - a.points).slice(0, 100) };
  },

  // Only players wearing the ULTRA MAX skin may enter the table.
  async submitScore() {
    if (!Profile.owns('skin', 'ultra') || Settings.get('skin') !== 'ultra') return { ok: false };
    const entry = { name: String(Settings.get('name') || 'Player').slice(0, 14), points: Profile.d.points, ts: Date.now() };
    const local = this.localBoard().filter(e => e.name !== entry.name); local.push(entry); this.saveLocal(local);
    const url = this.dbUrl();
    if (url) {
      try {
        const key = encodeURIComponent(entry.name.toLowerCase());
        const r = await fetch(`${url}/leaderboard/${key}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
        return { ok: r.ok };
      } catch (e) { return { ok: false }; }
    }
    return { ok: true, local: true };
  }
};
