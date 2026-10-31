// Online services: the GLOBAL ULTRA MAX Top 100 (Firebase Realtime Database over plain REST, no SDK) with a local fallback.
// Peer-to-peer play (friends, duel, squads) lives in net/p2p.js.
//
// ONE-TIME SETUP (see docs/GLOBAL-BOARD.md): create a free Firebase project, paste its database URL (and optionally the web API key
// for anonymous sign-in) into BOARD_CONFIG below, publish docs/firebase-rules.json. After that every player shares the same board automatically.
const BOARD_CONFIG = {
  url: '',          // e.g. 'https://last-squad-standing-default-rtdb.firebaseio.com'
  apiKey: ''        // optional: Firebase web API key. With it, scores are written by an anonymous signed-in user (rules block tampering with other entries)
};

const Online = {
  lastSubmit: 0, auth: null,

  dbUrl() { return (Settings.get('dbUrl') || BOARD_CONFIG.url || '').trim().replace(/\/+$/, ''); },
  isGlobal() { return !!this.dbUrl(); },

  // board-config.json (next to index.html) holds { "url": ..., "apiKey": ... }: edit it instead of the code. Missing file = local board only.
  async loadConfig() {
    try {
      const r = await this.http('board-config.json', {}); if (!r.ok) return;
      const c = await r.json(); if (c && typeof c.url === 'string') BOARD_CONFIG.url = c.url.trim(); if (c && typeof c.apiKey === 'string') BOARD_CONFIG.apiKey = c.apiKey.trim();
    } catch (e) { /* no config: local board */ }
  },
  // key of this player's entry: the anonymous Firebase user when sign-in is on, otherwise the device id
  myKey() { if (BOARD_CONFIG.apiKey) { try { const a = this.auth || JSON.parse(localStorage.getItem('lss-auth') || 'null'); if (a && a.uid) return a.uid; } catch (e) { /* ignore */ } } return this.uid(); },

  // stable anonymous id of this device (the key of its board entry)
  uid() {
    let id = Settings.get('uid');
    if (!id) { id = 'p' + Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(16).padStart(2, '0')).join(''); Settings.set('uid', id); }
    return id;
  },

  localBoard() { try { return JSON.parse(localStorage.getItem('lss-board') || '[]'); } catch (e) { return []; } },
  saveLocal(list) { try { localStorage.setItem('lss-board', JSON.stringify(list)); } catch (e) { /* storage unavailable */ } },
  cached() { try { return JSON.parse(localStorage.getItem('lss-board-cache') || 'null'); } catch (e) { return null; } },

  async http(url, opt) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 7000);
    try { return await fetch(url, Object.assign({ cache: 'no-store', signal: ac.signal }, opt || {})); } finally { clearTimeout(t); }
  },

  clean(id, e) {
    if (!e || typeof e.name !== 'string' || typeof e.points !== 'number' || !isFinite(e.points) || e.points < 0 || e.points > 1e9) return null;
    return { id, name: e.name.replace(/[<>&"]/g, '').slice(0, 14) || '?', points: Math.floor(e.points), lvl: Math.max(1, Math.min(999, e.lvl | 0)), ts: +e.ts || 0 };
  },

  // top 100 by points; falls back to this device's own list when no backend is configured or it cannot be reached
  async fetchBoard() {
    const url = this.dbUrl(), me = this.myKey();
    if (url) {
      try {
        let r = await this.http(`${url}/leaderboard.json?orderBy=%22points%22&limitToLast=100`);
        if (r.status === 400) r = await this.http(`${url}/leaderboard.json`);          // no ".indexOn" rule yet: download everything and sort here
        if (r.ok) {
          const data = (await r.json()) || {};
          const list = Object.keys(data).map(k => this.clean(k, data[k])).filter(Boolean).sort((a, b) => b.points - a.points || a.ts - b.ts).slice(0, 100);
          const res = { online: true, list, me: list.findIndex(e => e.id === me) };
          try { localStorage.setItem('lss-board-cache', JSON.stringify({ t: Date.now(), list })); } catch (e) { /* ignore */ }
          return res;
        }
      } catch (e) { /* fall through */ }
      const c = this.cached();
      if (c && c.list) return { online: false, stale: true, list: c.list, me: c.list.findIndex(e => e.id === me) };
    }
    const list = this.localBoard().map(e => this.clean(e.id || this.uid(), e)).filter(Boolean).sort((a, b) => b.points - a.points).slice(0, 100);
    return { online: false, list, me: list.findIndex(e => e.id === this.uid()) };
  },

  // anonymous Firebase sign-in over REST (only when BOARD_CONFIG.apiKey is set)
  async token() {
    const key = BOARD_CONFIG.apiKey; if (!key) return null;
    let a = this.auth; if (!a) { try { a = JSON.parse(localStorage.getItem('lss-auth') || 'null'); } catch (e) { a = null; } }
    const save = o => { this.auth = o; try { localStorage.setItem('lss-auth', JSON.stringify(o)); } catch (e) { /* ignore */ } };
    try {
      if (a && a.exp > Date.now() + 60000) return a;
      if (a && a.refresh) {
        const r = await this.http(`https://securetoken.googleapis.com/v1/token?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(a.refresh)}` });
        if (r.ok) { const j = await r.json(); a = { uid: j.user_id, token: j.id_token, refresh: j.refresh_token, exp: Date.now() + (+j.expires_in || 3600) * 1000 }; save(a); return a; }
      }
      const r = await this.http(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' });
      if (!r.ok) return null;
      const j = await r.json(); a = { uid: j.localId, token: j.idToken, refresh: j.refreshToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 }; save(a); return a;
    } catch (e) { return null; }
  },

  // Only players wearing the ULTRA MAX skin may enter the table. Called after every match and from the "Submit" button.
  async submitScore(force) {
    if (!Profile.owns('skin', 'ultra') || Settings.get('skin') !== 'ultra') return { ok: false };
    if (!force && Date.now() - this.lastSubmit < 15000) return { ok: true, skipped: true };
    this.lastSubmit = Date.now();
    const entry = { name: String(Settings.get('name') || 'Player').replace(/[<>&"]/g, '').slice(0, 14) || 'Player', points: Math.max(0, Math.floor(Profile.d.points)), lvl: Profile.level(), ts: Date.now() };
    const id = this.uid(), local = this.localBoard().filter(e => e.id !== id); local.push(Object.assign({ id }, entry)); this.saveLocal(local);
    const url = this.dbUrl(); if (!url) return { ok: true, local: true };
    try {
      let path = `${url}/leaderboard/${id}.json`;
      if (BOARD_CONFIG.apiKey) { const a = await this.token(); if (!a) return { ok: false }; path = `${url}/leaderboard/${a.uid}.json?auth=${encodeURIComponent(a.token)}`; }
      const r = await this.http(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
      return { ok: r.ok };
    } catch (e) { return { ok: false }; }
  }
};
