// Finding a match with other players online: the client side of server/matchmaker.js.
// The player presses "Find match": a ticket (name, skin, equipment, level, how good a host this device is) goes to the lobby server over a WebSocket; the server sends a status line every few seconds
// and, once it has put players of about the same level together, the match: who hosts and who joins. The match itself is played peer-to-peer (net/p2p.js: Net.publicMatch), the host runs the bots.
// Whatever goes wrong (no server, no network, nobody of the same level comes in time, the others cannot be connected) the player gets a match against bots instead, and the screen says so
// ("all the other players are bots"), so nobody waits for ever and nobody is told they play people when they do not.
// The lobby address is in online-config.json: { "lobby": "wss://....workers.dev/ws" }. "local" (or ?mm=local) talks to server/dev-lobby.html open in another tab of the same browser, for tests.
// ?u=name gives a test tab its own peer id (tabs of one browser share the saved id).
const Matchmaking = {
  cfg: { lobby: '' }, state: 'idle', mode: '', t0: 0, stats: { n: 1, s: 0 }, ws: null, bc: null, send: null, timers: {}, heard: false, me: '', match: null, el: null,

  init() {
    this.loadConfig();
    Net.on('alone', () => { if (this.state === 'connecting') this.fallback('failed'); });                  // the host waited for the others and nobody came
    window.addEventListener('beforeunload', () => this.stopTransport());
  },

  async loadConfig() {
    const q = new URLSearchParams(location.search).get('mm'); if (q) { this.cfg.lobby = q; return; }
    try { const r = await fetch('online-config.json', { cache: 'no-store' }); if (r.ok) { const c = await r.json(); if (c && typeof c.lobby === 'string') this.cfg.lobby = c.lobby.trim(); } } catch (e) { /* no server configured: matches are against bots */ }
  },
  available() { return !!this.cfg.lobby; },
  myId() { return Net.sanitize(new URLSearchParams(location.search).get('u') || Online.uid()); },

  // the ticket: who this is and what the server needs to put the right players together
  ticket() {
    const L = Profile.d.loadout, conn = navigator.connection || {}, dev = Device.phone ? 30 : Device.tablet ? 60 : 100;
    return { t: 'q', mode: this.mode, id: this.me, n: String(Settings.get('name') || 'Player').slice(0, 14), skin: Settings.get('skin'), lo: { vest: L.vest | 0, helmet: L.helmet | 0, boots: L.boots | 0, gloves: L.gloves | 0, pack: L.pack | 0 },
      r: Math.round(Skill.rating() * 10) / 10, hs: dev - (conn.saveData ? 30 : 0) - (conn.effectiveType && conn.effectiveType !== '4g' ? 25 : 0) };
  },

  // mode: 'br' | 'duel'
  async find(mode) {
    if (this.state !== 'idle' || G.state !== 'menu') return;
    if (Net.party && !Net.party.auto) { HUD.toast(I18n.t('mm.inParty'), '', 0xffb84a); return; }                  // in a party with friends: leave it first
    this.mode = mode; this.t0 = Date.now(); this.stats = { n: 1, s: 0 }; this.match = null; this.heard = false;
    this.me = Net.status === 'online' && Net.user ? Net.user : this.myId();
    this.setState('searching');
    if (!this.available()) { this.timers.nolobby = setTimeout(() => this.fallback('noserver'), 1500); return; }          // no server set up yet (online-config.json): a short pause so that the screen is seen, then a match against bots
    this.timers.tick = setInterval(() => this.render(), 500);
    this.timers.hard = setTimeout(() => this.fallback('timeout'), 95000);
    this.openTransport();
  },

  openTransport() {
    const post = m => { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); else if (this.bc) this.bc.postMessage({ from: this.me, msg: m }); } catch (e) { /* ignore */ } };
    this.send = post;
    if (this.cfg.lobby === 'local') {
      const bc = this.bc = new BroadcastChannel('lss-lobby'); bc.onmessage = e => { const d = e.data; if (d && d.to === this.me) this.onMessage(d.msg); };
      post(this.ticket()); this.timers.hello = setTimeout(() => { if (!this.heard && this.state === 'searching') this.fallback('nolobby'); }, 4000);
      this.timers.ping = setInterval(() => post({ t: 'p' }), 15000);
      return;
    }
    let ws; try { ws = this.ws = new WebSocket(this.cfg.lobby); } catch (e) { this.fallback('nolobby'); return; }
    this.timers.open = setTimeout(() => { if (ws.readyState !== 1 && this.state === 'searching') this.fallback('nolobby'); }, 8000);
    ws.onopen = () => { clearTimeout(this.timers.open); post(this.ticket()); this.timers.ping = setInterval(() => post({ t: 'p' }), 15000); };
    ws.onmessage = e => { try { this.onMessage(JSON.parse(e.data)); } catch (x) { /* ignore */ } };
    ws.onclose = () => { if (this.state === 'searching') this.fallback('nolobby'); };
  },

  onMessage(m) {
    this.heard = true;
    if (this.state !== 'searching') return;
    if (m.t === 'w') { this.stats = { n: m.n, s: m.s }; this.render(); }
    else if (m.t === 'm') this.matchFound(m);
    else if (m.t === 'x') this.fallback('timeout');
  },

  // the server found a match: connect to the others (the host waits for them, the guests go to the host)
  async matchFound(m) {
    this.match = m; clearTimeout(this.timers.hard); this.stopTransport(); this.setState('connecting');
    if (m.members.length < 2) return this.fallback('alone');                                                  // only this player: nobody else came in time
    let ok = Net.status === 'online' && Net.user === this.me;
    if (!ok) ok = await Net.go(this.me);
    if (this.state !== 'connecting') return;                                                                  // cancelled meanwhile
    if (!ok) return this.fallback('nonet');
    const joined = await Net.publicMatch(m);
    if (this.state !== 'connecting') return;
    if (!joined) return this.fallback('failed');
    this.timers.guard = setTimeout(() => { if (this.state === 'connecting') this.fallback('failed'); }, 26000);          // the host starts after at most 14 s: after that something went wrong
  },

  cancel() {
    if (this.state === 'idle') return;
    if (this.send && this.state === 'searching') this.send({ t: 'c' });
    this.stop(); if (Net.party && Net.party.auto) Net.leaveParty(); this.setState('idle');
  },
  playNow() { if (this.state === 'idle') return; const mode = this.mode; this.cancel(); Game.start({ mode: mode === 'duel' ? 'duel' : 'br' }); },

  // a match against bots, with the reason on the screen
  fallback(why) {
    if (this.state === 'idle') return;
    const mode = this.mode; this.stop(); if (Net.party && Net.party.auto) Net.leaveParty(); this.setState('idle');
    const key = { noserver: 'mm.noserver', nolobby: 'mm.nolobby', nonet: 'mm.nonet', failed: 'mm.failed', timeout: 'mm.timeout', alone: 'mm.alone' }[why] || 'mm.failed';
    if (G.state === 'menu') { HUD.toast(I18n.t(key), '', 0xffb84a); Game.start({ mode: mode === 'duel' ? 'duel' : 'br' }); }
  },

  // Game.start calls this: a match is starting, whichever way it was found
  started() { if (this.state !== 'idle') { this.stop(); this.setState('idle'); } },

  stop() { for (const k in this.timers) { clearTimeout(this.timers[k]); clearInterval(this.timers[k]); } this.timers = {}; this.stopTransport(); },
  stopTransport() {
    if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (e) { /* ignore */ } this.ws = null; }
    if (this.bc) { try { this.bc.close(); } catch (e) { /* ignore */ } this.bc = null; }
    this.send = null;
  },
  setState(s) { this.state = s; this.render(); },

  // ---------- the screen ----------
  build() {
    if (this.el) return; const o = this.el = document.createElement('div'); o.id = 'mmBox'; o.className = 'hidden';
    o.innerHTML = '<div class="box"><h3 id="mmTitle"></h3><p id="mmText"></p><div class="mmBar"><i id="mmFill"></i></div><div class="acts"><button class="go" id="mmNow"></button><button class="no" id="mmCancel"></button></div></div>';
    document.body.appendChild(o); document.getElementById('mmNow').onclick = () => this.playNow(); document.getElementById('mmCancel').onclick = () => this.cancel();
  },
  render() {
    this.build(); const on = this.state !== 'idle'; this.el.classList.toggle('hidden', !on); if (!on) return;
    const T = (k, p) => I18n.t(k, p), s = Math.floor((Date.now() - this.t0) / 1000), max = this.mode === 'duel' ? 30 : 60, found = this.state === 'connecting';
    document.getElementById('mmTitle').textContent = T(found ? 'mm.found' : this.mode === 'duel' ? 'mm.titleDuel' : 'mm.titleBr');
    document.getElementById('mmText').textContent = found ? T('mm.connecting') : this.available() ? T('mm.stat', { s, n: this.stats.n }) + ' · ' + T('mm.hint') : T('mm.noserver');
    document.getElementById('mmFill').style.width = (found ? 100 : Math.min(100, s / max * 100)) + '%';
    document.getElementById('mmNow').textContent = T('mm.playNow'); document.getElementById('mmCancel').textContent = T('mm.cancel');
    document.getElementById('mmNow').style.display = found ? 'none' : '';
  }
};
