// Peer-to-peer play over WebRTC (PeerJS, free public broker): friends, parties, online 1v1 duel and squad co-op.
// Topology: a star around the party host. Every player simulates and shoots for themselves (shooter-side hit detection, the victim applies damage).
// In co-op the host also runs the bots; guests see them as "puppets" driven by host snapshots. See docs/ONLINE.md for the message list.
const PHASES = ['plane', 'freefall', 'glide', 'ground', 'riding'];
const PARTY_MAX = { duo: 2, trio: 3, squad: 4, duel: 2, pbr: 20 };          // pbr: a public battle royale found by the lobby server (src/net/matchmaking.js): everybody against everybody, the bots fill the rest
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

// An actor controlled over the network (a friend, the duel opponent or a host bot seen on a guest). Quacks like Bot for Combat, Projectiles and bot perception.
class Remote {
  constructor(o) {
    this.isRemote = true; this.user = o.u || ''; this.idx = o.idx; this.puppet = !!o.puppet; this.name = o.n || o.u || 'Friend'; this.team = o.team || null;
    this.pos = new THREE.Vector3(); this.target = new THREE.Vector3(); this.mvel = new THREE.Vector3(); this.vel = this.mvel; this.yaw = 0; this.tyaw = 0; this.aimPitch = 0;
    this.alive = true; this.health = 100; this.maxHealth = 100; this.shield = 0; this.crouch = false; this.riding = false; this.bike = null; this.onGround = true; this.state = 'ground'; this.dropPhase = 'free'; this.phase = 'plane';
    this.speed = 0; this.walkDir = 1; this.slots = []; this.cur = 0; this.reloadT = 0; this.lastFired = -99; this.recoil = 0; this.meds = { small: 0, big: 0 }; this.enemy = null;
    this.wkey = ''; this.gunKey = ''; this.chute = null; this.seen = false; this.deathT = 25;
    this.skinId = o.skin || 'recruit'; this.lo = o.lo || null;
    this.rig = Character.build(this.skinId, 0, { loadout: this.lo }); this.rig.root.visible = false; G.scene.add(this.rig.root);          // (the equipment the other player wears, from their hello)
  }
  weapon() { const s = this.slots[this.cur]; return s ? s.w : null; }
  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.6), this.pos.z); }
  tryHeal() { /* health is owned by the real player */ }
  takeDamage(amount, attacker, head, wid) { Net.hitRemote(this, amount, attacker, head, wid); }

  // state message from the owner (players) or a snapshot row (puppets)
  apply(s) {
    if (!this.seen) { this.pos.set(s.x, s.y, s.z); this.yaw = s.yw; this.seen = true; }
    this.target.set(s.x, s.y, s.z); this.tyaw = s.yw; this.aimPitch = s.pt; this.crouch = !!s.c; this.speed = s.sp; this.walkDir = s.wd === -1 ? -1 : 1;
    const ph = s.ph | 0; this.phase = PHASES[ph] || 'ground'; this.onGround = ph >= 3; this.riding = ph === 4; this.state = ph === 1 || ph === 2 ? 'drop' : 'ground'; this.dropPhase = ph === 1 ? 'free' : 'glide';
    if (s.w !== undefined && s.w !== this.wkey) { this.wkey = s.w; const p = s.w.split('|'); this.slots = p[0] ? [{ w: { id: p[0], rarity: +p[1] || 0, sight: p[2] || 'iron', mag: 1 } }] : []; this.cur = 0; }
    if (s.fr) this.lastFired = G.time;
    if (s.hp !== undefined) { this.health = s.hp; this.shield = s.sh || 0; }
    if (s.al === 0 && this.alive) this.markDead();
  }

  markDead() {
    if (!this.alive || !this.rig) return;
    this.alive = false; this.health = 0; this.removeChute();
    const dead = { speed: 0, fwd: 1, crouch: false, raise: 0, sprint: false, pitch: 0, dead: true, ride: false };
    this.rig.update(0.5, dead); for (let i = 0; i < 8; i++) this.rig.update(0.1, dead);
    this.rig.root.position.copy(this.pos); this.rig.root.visible = true; this.rig.setShadows(true);
  }

  update(dt) {
    if (!this.rig) return;
    if (!this.alive) { this.deathT -= dt; if (this.deathT <= 0) { G.scene.remove(this.rig.root); this.rig = null; } return; }
    if (!this.seen) return;
    const k = Math.min(1, dt * 14), ox = this.pos.x, oz = this.pos.z;
    this.pos.lerp(this.target, k); this.yaw += angDiff(this.yaw, this.tyaw) * k;
    if (dt > 0) { this.mvel.x = lerp(this.mvel.x, (this.pos.x - ox) / dt, 0.3); this.mvel.z = lerp(this.mvel.z, (this.pos.z - oz) / dt, 0.3); }
    const inPlane = this.phase === 'plane'; this.rig.root.visible = !inPlane;
    if (inPlane) return;
    if (this.state === 'drop' && this.dropPhase === 'glide') { this.makeChute(); if (this.chute) { this.chute.position.set(this.pos.x, this.pos.y + 3.6, this.pos.z); this.chute.rotation.y = this.yaw; } } else this.removeChute();
    this.syncRig(dt, this.state === 'drop' ? { drop: this.dropPhase } : null);
  }
}
Remote.prototype.syncRig = Bot.prototype.syncRig; Remote.prototype.makeChute = Bot.prototype.makeChute; Remote.prototype.removeChute = Bot.prototype.removeChute;

const Net = {
  peer: null, user: '', status: 'offline', conns: {}, info: {}, party: null, invite: null, listeners: {},
  session: null, active: false, coop: false, duel: false, isHost: false, hostUser: '', remotes: {}, puppets: {}, lib: null,
  stT: 0, snapT: 0, zoneT: 0, checkT: 0,

  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
  off(ev, fn) { const l = this.listeners[ev]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
  emit(ev, a) { for (const f of (this.listeners[ev] || []).slice()) { try { f(a); } catch (e) { console.error(e); } } },
  T(k, p) { return I18n.t(k, p); },
  sanitize(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16); },
  myInfo() { const L = Profile.d.loadout; return { n: String(Settings.get('name') || 'Player').slice(0, 14), skin: Settings.get('skin'), lo: { vest: L.vest | 0, helmet: L.helmet | 0, boots: L.boots | 0, gloves: L.gloves | 0, pack: L.pack | 0 }, r: Math.round(Skill.rating()) }; },
  say(title, sub, col) { if (typeof HUD !== 'undefined') HUD.toast(title, sub || '', col); },

  // ---------- connection ----------
  loadLib() {
    if (this.lib) return this.lib;
    return this.lib = new Promise((res, rej) => {
      if (window.Peer) return res();
      const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
      s.onload = res; s.onerror = () => { this.lib = null; rej(new Error('peerjs')); }; document.head.appendChild(s);
    });
  },

  async go(user) {
    user = this.sanitize(user); if (!user) { this.status = 'badname'; this.emit('status'); return false; }
    if (this.peer) this.stop();
    this.status = 'connecting'; this.user = user; this.emit('status');
    try { await this.loadLib(); } catch (e) { this.status = 'nonet'; this.emit('status'); return false; }
    return new Promise(resolve => {
      let settled = false; const done = ok => { if (!settled) { settled = true; resolve(ok); } };
      let peer; try { peer = this.peer = new window.Peer('lss-' + user, { debug: 0 }); } catch (e) { this.status = 'nonet'; this.emit('status'); return done(false); }
      const t = setTimeout(() => { if (this.status === 'connecting') { this.status = 'nonet'; this.emit('status'); try { peer.destroy(); } catch (e) { /* ignore */ } this.peer = null; done(false); } }, 9000);
      peer.on('open', () => { clearTimeout(t); this.status = 'online'; Settings.set('netName', user); this.emit('status'); done(true); });
      peer.on('connection', c => this.setup(c));
      peer.on('disconnected', () => { if (this.status === 'online') { try { peer.reconnect(); } catch (e) { /* ignore */ } } });
      peer.on('error', err => {
        if (err.type === 'unavailable-id') { clearTimeout(t); this.status = 'taken'; this.peer = null; this.emit('status'); done(false); }
        else if (err.type === 'peer-unavailable') this.emit('unavailable', String(err.message || '').replace(/.*lss-/, '').replace(/\W+$/, ''));
        else if (this.status === 'connecting') { clearTimeout(t); this.status = 'nonet'; this.peer = null; this.emit('status'); done(false); }
      });
    });
  },

  stop() {
    this.leaveParty(); this.leaveMatch(true);
    for (const u in this.conns) { try { this.conns[u].close(); } catch (e) { /* ignore */ } }
    this.conns = {}; if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } } this.peer = null; this.status = 'offline'; this.emit('status');
  },

  connect(user) {
    return new Promise((resolve, reject) => {
      if (!this.peer || this.status !== 'online') return reject(new Error('offline'));
      const ex = this.conns[user]; if (ex && ex.open) return resolve(ex);
      const c = this.peer.connect('lss-' + user, { reliable: true, serialization: 'json' });
      let fin = false;
      const gone = u => { if (u === user && !fin) { fin = true; clean(); reject(new Error('gone')); } };
      const clean = () => { clearTimeout(t); this.off('unavailable', gone); };
      const t = setTimeout(() => { if (!fin) { fin = true; clean(); try { c.close(); } catch (e) { /* ignore */ } reject(new Error('noreply')); } }, 6000);
      this.on('unavailable', gone);
      c.on('open', () => { if (fin) return; fin = true; clean(); this.setup(c); resolve(c); });
      c.on('error', () => { if (!fin) { fin = true; clean(); reject(new Error('error')); } });
    });
  },

  setup(c) {
    const u = String(c.peer).replace(/^lss-/, '');
    const hello = () => { try { c.send(Object.assign({ t: 'hi' }, this.myInfo())); } catch (e) { /* ignore */ } };
    const old = this.conns[u]; if (old && old !== c && old.open) { try { old.close(); } catch (e) { /* ignore */ } }
    this.conns[u] = c;
    c.on('data', m => { try { this.handle(m, u); } catch (e) { console.error('[net]', e); } });
    c.on('close', () => { if (this.conns[u] === c) { delete this.conns[u]; this.dropped(u); } });
    c.on('error', () => { /* handled by close */ });
    if (c.open) hello(); else c.on('open', hello);
  },

  send(u, m) { const c = this.conns[u]; if (c && c.open) { try { c.send(m); } catch (e) { /* ignore */ } } },
  all(m, except) { for (const u in this.conns) if (u !== except) this.send(u, m); },
  // to everyone in the match: guests talk to the host, the host talks to every guest
  cast(m) { if (this.isHost) this.all(m); else this.send(this.hostUser, m); },
  isPeer(u) { return !!(this.conns[u] && this.conns[u].open); },
  async check(u) { try { await this.connect(u); return true; } catch (e) { return false; } },

  // ---------- parties ----------
  createParty(mode) {
    this.party = { host: this.user, mode, members: [Object.assign({ u: this.user }, this.myInfo())] }; this.emit('party');
  },
  setMode(mode) { if (this.party && this.party.host === this.user && !this.session) { this.party.mode = mode; this.pushParty(); } },
  pushParty() { for (const m of this.party.members) if (m.u !== this.user) this.send(m.u, { t: 'party', p: this.party }); this.emit('party'); },

  async invitePlayer(u, mode) {
    if (this.status !== 'online') return false;
    if (!this.party) this.createParty(mode || 'duo');
    if (this.party.host !== this.user) return false;
    try { const c = await this.connect(u); c.send({ t: 'inv', mode: this.party.mode, n: this.myInfo().n }); this.say(this.T('friends.inviteSent', { name: u }), '', 0x5fd14a); return true; }
    catch (e) { this.say(this.T('friends.noReply', { name: u }), '', 0xff6a6a); return false; }
  },

  acceptInvite() {
    const i = this.invite; this.invite = null; this.emit('invite'); if (!i) return;
    this.connect(i.u).then(c => { c.send(Object.assign({ t: 'join' }, this.myInfo())); }).catch(() => this.say(this.T('friends.noReply', { name: i.u }), '', 0xff6a6a));
  },
  declineInvite() { const i = this.invite; this.invite = null; this.emit('invite'); if (i) this.send(i.u, { t: 'no' }); },

  leaveParty() {
    if (!this.party) return;
    if (this.party.host === this.user) { for (const m of this.party.members) if (m.u !== this.user) this.send(m.u, { t: 'party', p: null }); }
    else this.send(this.party.host, { t: 'leave' });
    this.party = null; this.emit('party');
  },

  // host presses "start match"
  startMatch() {
    const P = this.party; if (!P || P.host !== this.user || P.members.length < 2 || G.state !== 'menu') return false;
    const guests = P.members.filter(m => m.u !== this.user).map(m => m.u);
    if (P.mode === 'duel') {
      const map = Profile.d.loadout.duelMap || 'colosseum';
      for (const u of guests) this.send(u, { t: 'go', mode: 'duel', map, p: P });
      this.beginDuel(map, true, guests[0]);
    } else if (P.mode === 'pbr') {                                                                      // public battle royale: everybody for themselves, the host runs the bots (20 places in all)
      for (const u of guests) this.send(u, { t: 'go', mode: 'pbr', p: P });
      this.session = { kind: 'coop', host: true }; this.ffa = true;
      Game.start({ mode: 'br', net: { role: 'host', ffa: true, botCount: Math.max(0, BOT_COUNT + 1 - P.members.length), rating: P.br } });
    } else {
      for (const u of guests) this.send(u, { t: 'go', mode: 'coop', p: P });
      this.session = { kind: 'coop', host: true };
      Game.start({ mode: 'br', net: { role: 'host' } });
    }
    return true;
  },

  beginDuel(map, host, foe) {
    this.session = { kind: 'duel', host }; this.isHost = host; this.hostUser = host ? this.user : this.party.host; this.duel = true; this.coop = false; this.active = true;
    Game.start({ mode: 'duel', map, net: { host, foe, onRound: (duel, spawn) => this.duelRound(duel, spawn, foe) } });
  },

  // ---------- incoming messages ----------
  handle(m, u) { const H = this['on_' + m.t]; if (H) H.call(this, m, u); },
  on_hi(m, u) { this.info[u] = { n: m.n, skin: m.skin, lo: m.lo || null, r: m.r }; this.emit('hi', u); },
  on_inv(m, u) {
    if (G.state !== 'menu' || this.party || this.invite || this.session) return this.send(u, { t: 'no', busy: 1 });
    this.invite = { u, mode: m.mode, n: m.n || u }; this.emit('invite');
  },
  on_no(m, u) { this.say(this.T('friends.noReply', { name: u }), '', 0xff6a6a); },
  on_join(m, u) {
    const P = this.party; if (!P || P.host !== this.user || this.session) return this.send(u, { t: 'no', busy: 1 });
    if (P.members.length >= PARTY_MAX[P.mode]) { this.send(u, { t: 'no', full: 1 }); return this.say(this.T('party.full'), '', 0xff6a6a); }
    if (!P.members.some(x => x.u === u)) P.members.push({ u, n: m.n, skin: m.skin, lo: m.lo || null, r: m.r });
    if (!P.auto) this.say(this.T('party.joined', { name: m.n }), '', 0x5fd14a);
    this.pushParty();
    if (P.auto && P.members.length >= P.expect) this.autoStart();                                       // a match from the lobby server: start as soon as everybody who was promised is here
  },
  on_leave(m, u) { this.memberGone(u); },
  on_party(m, u) {
    this.party = m.p; this.emit('party');
    if (!m.p && !this.session) this.say(this.T('party.left', { name: this.nameOf(u) }), '', 0xffb84a);
  },
  on_go(m, u) {
    if (G.state !== 'menu') return;
    this.party = m.p || this.party; this.hostUser = u;
    if (m.mode === 'duel') this.beginDuel(m.map, false, u);
    else {
      this.ffa = m.mode === 'pbr';
      this.session = { kind: 'coop', host: false }; this.isHost = false; this.say(this.T('net.waiting', { name: this.nameOf(u) }), '', 0xffb84a);
      const s = this.session; setTimeout(() => { if (this.session === s && !this.active) this.session = null; }, 15000);
    }
  },

  memberGone(u) {
    const P = this.party; if (!P || P.host !== this.user) return;
    const i = P.members.findIndex(x => x.u === u); if (i >= 0) { this.say(this.T('party.left', { name: P.members[i].n }), '', 0xffb84a); P.members.splice(i, 1); this.pushParty(); }
  },
  nameOf(u) { const P = this.party, m = P && P.members.find(x => x.u === u); return m ? m.n : (this.info[u] && this.info[u].n) || u; },
  skinOf(u) { const P = this.party, m = P && P.members.find(x => x.u === u); return m ? m.skin : (this.info[u] && this.info[u].skin) || 'recruit'; },
  loOf(u) { const P = this.party, m = P && P.members.find(x => x.u === u); return (m && m.lo) || (this.info[u] && this.info[u].lo) || null; },

  dropped(u) {
    this.emit('conn');
    this.leftMatch(u);
    this.memberGone(u);
    if (this.party && this.party.host === u && !this.session) { this.party = null; this.emit('party'); }
  },

  // a player left the running match (quit to the lobby, or the connection dropped)
  leftMatch(u) {
    if (this.session && this.active) {
      const r = this.remotes[u];
      if (r) { this.say(this.T('net.disconnected', { name: r.name }), '', 0xff6a6a); if (r.alive) r.markDead(); }
      if (this.duel && G.state === 'playing') this.finishDuelForfeit();
      else if (this.coop && !this.isHost && u === this.hostUser) { this.say(this.T('net.lost'), '', 0xff6a6a); if (G.state === 'playing') Game.finish(false, this.ffa ? { title: this.T('net.hostLeft'), stats: this.T('net.hostLeftSub'), noStats: true, rank: 1, total: 1 } : { rank: Math.max(2, Game.aliveCount() + 1) }); }          // (a public match has no host to take over: it is cancelled and counts for nothing)
      else if (this.coop && this.isHost) this.checkEnd();
    }
  },

  // ---------- match: shared ----------
  addRemote(u, extra) {
    this.removeRemote(u);
    return this.remotes[u] = new Remote(Object.assign({ u, n: this.nameOf(u), skin: this.skinOf(u), lo: this.duel ? null : this.loOf(u), team: this.coop && !this.ffa ? 'A' : null }, extra || {}));          // (squad mates are team A; in a public match everybody is an opponent)
  },
  removeRemote(u) { const r = this.remotes[u]; if (r && r.rig) { G.scene.remove(r.rig.root); r.removeChute(); } delete this.remotes[u]; },

  leaveMatch(notify) {
    if (notify && this.active) this.cast({ t: 'bye' });
    for (const u in this.remotes) this.removeRemote(u);
    for (const i in this.puppets) { const p = this.puppets[i]; if (p.rig) { G.scene.remove(p.rig.root); p.removeChute(); } }
    this.puppets = {}; this.session = null; this.active = this.coop = this.duel = this.isHost = this.ffa = false; this.hostUser = ''; this.myRank = 0;
    if (this.party && (this.party.auto || this.party.guest)) { clearTimeout(this.autoT); this.party = null; this.emit('party'); }          // a party made by the lobby server ends with its match (a party of friends stays for the next one)
    if (typeof Zone !== 'undefined') Zone.remote = false;
    if (typeof Player !== 'undefined') Player.team = null;
    if (typeof Loot !== 'undefined') { Loot.idPrefix = ''; Loot.silent = false; }
  },

  on_bye(m, u) { this.leftMatch(u); },

  // other player's movement / loadout
  on_st(m, u) {
    const who = m.u || u, r = this.remotes[who]; if (!r) return;
    r.apply(m);
    if (this.isHost) this.all(Object.assign({}, m, { u: who }), u);
  },

  localState() {
    const P = Player, w = P.weapon(), ph = Math.max(0, PHASES.indexOf(P.phase));
    return { t: 'st', x: r2(P.pos.x), y: r2(P.pos.y), z: r2(P.pos.z), yw: r2(P.yaw), pt: r2(P.pitch), c: P.crouch ? 1 : 0, sp: r1(P.speed || 0), ph, w: w ? w.id + '|' + w.rarity + '|' + (w.sight || 'iron') : '', fr: G.time - (P.lastFireT || -9) < 0.25 ? 1 : 0, hp: Math.round(P.health), sh: Math.round(P.shield), al: P.alive ? 1 : 0, wd: 1, u: this.user };
  },

  // every shot is replicated as visuals only; damage is decided by the shooter
  sendShot(shooter, origin, dir, wpn) {
    if (!this.active) return;
    const m = { t: 'sh', o: [r2(origin.x), r2(origin.y), r2(origin.z)], d: [r2(dir.x), r2(dir.y), r2(dir.z)], w: wpn.id };
    if (shooter === Player) m.u = this.user; else if (shooter.isBot && this.isHost) m.b = shooter.idx; else return;
    this.cast(m);
  },
  on_sh(m, u) {
    const who = m.u || u, r = m.b !== undefined ? this.puppets[m.b] : this.remotes[who];
    if (this.isHost && m.b === undefined) this.all(m, u);
    if (!r) return;
    const d = WEAPONS[m.w]; if (!d) return;
    const o = new THREE.Vector3(m.o[0], m.o[1], m.o[2]), dir = new THREE.Vector3(m.d[0], m.d[1], m.d[2]);
    r.lastFired = G.time; r.recoil = 1;
    for (let p = 0; p < Math.min(d.pellets, 3); p++) {
      const dd = dir.clone(); if (p) { dd.x += (Math.random() - 0.5) * 0.08; dd.y += (Math.random() - 0.5) * 0.08; dd.z += (Math.random() - 0.5) * 0.08; dd.normalize(); }
      const t = Math.min(rayBoxes(o, dd, d.range).dist, rayTerrain(o, dd, d.range), d.range);
      FX.tracer(o, o.clone().addScaledVector(dd, t), m.w, r);
    }
    FX.muzzle(o, dir, d.pellets > 1); Sound.gun(d.snd, o, 1);
    if (this.isHost && m.b === undefined) addNoise(r.pos.x, r.pos.z, m.w === 'pistol' || m.w === 'revolver' ? 70 : m.w === 'special' || m.w === 'sniper' ? 230 : 130, r);
  },

  // grenades and rockets thrown by others: visual copies only (damage is applied by the thrower's own explosion)
  sendThrow(kind, pos, vel, rocket) {
    if (!this.active) return;
    this.cast({ t: 'th', k: kind, r: rocket ? 1 : 0, p: [r2(pos.x), r2(pos.y), r2(pos.z)], v: [r2(vel.x), r2(vel.y), r2(vel.z)], u: this.user });
  },
  on_th(m, u) {
    const p = new THREE.Vector3(m.p[0], m.p[1], m.p[2]), v = new THREE.Vector3(m.v[0], m.v[1], m.v[2]), who = this.remotes[m.u || u] || {};
    if (m.r) Projectiles.fireRocket(who, p, v.normalize(), { id: 'rpg', rarity: 0, sight: 'iron' }, true);
    else Projectiles.throwGrenade(who, m.k, p, v, true);
    if (this.isHost) this.all(m, u);
  },

  // ---------- damage ----------
  hitRemote(r, amount, attacker, head, wid) {
    if (!r.alive || !this.active) return;
    if (attacker && attacker.team && attacker.team === r.team) return;       // no friendly fire
    if (r.puppet) {                                                           // a guest shot a host bot: the host owns bot health
      if (attacker === Player) this.send(this.hostUser, { t: 'bh', i: r.idx, d: Math.round(amount * 10) / 10, h: head ? 1 : 0, w: wid, u: this.user, dist: r1(Player.pos.distanceTo(r.pos)) });
      return;
    }
    r.health = Math.max(1, r.health - amount);
    const m = { t: 'hit', d: Math.round(amount * 10) / 10, h: head ? 1 : 0, w: wid };
    if (attacker === Player) m.u = this.user; else if (attacker && attacker.isBot) { m.b = attacker.idx; m.n = attacker.name; } else return;
    this.send(r.user, m);
  },
  on_hit(m, u) {
    if (!Player.alive || G.state !== 'playing') return;
    const src = m.b !== undefined ? (this.puppets[m.b] || G.bots[m.b]) : this.remotes[m.u || u];
    const a = src || { name: m.n || this.nameOf(u), pos: Player.pos.clone().add(new THREE.Vector3(0, 0, 8)), alive: true };
    Player.takeDamage(m.d, a, !!m.h, m.w);
  },
  // guest -> host: damage to a bot
  on_bh(m, u) {
    const b = G.bots[m.i], who = this.remotes[m.u || u]; if (!b || !b.alive || !who) return;
    b.lastHit = { head: !!m.h, dist: m.dist || 0 }; b.takeDamage(m.d, who, !!m.h, m.w);
  },

  localDied(attacker, wid) {
    if (!this.active) return;
    this.myRank = Bots.aliveCount() + this.aliveExtra() + 1;                                             // (a public match: the place this player finishes in)
    this.cast({ t: 'dead', by: attacker && attacker.user ? attacker.user : '', bn: attacker ? attacker.name : '', w: wid || '', u: this.user });
    if (this.isHost) this.checkEnd();
  },
  on_dead(m, u) {
    const who = m.u || u, r = this.remotes[who]; if (!r) return;
    if (this.isHost) this.all(m, u);
    const wasAlive = r.alive; r.markDead(); if (!wasAlive) return;
    if (this.duel) { Game.actorKilled(r, Player, m.w); return; }
    const byName = m.by === this.user ? Player.name : (m.bn || '?'), wn = Game.weaponName(m.w);
    HUD.feed(this.T('feed.kill', { a: byName, v: r.name }) + (wn ? ' · ' + wn : ''), m.by === this.user ? 0xf3c64a : 0);
    if (this.ffa && m.by === this.user) { Player.kills++; G.kills++; if (Profile.match) Profile.match.kills++; HUD.hitMarker(true, false); Events.emit('kill', { victim: r, wid: m.w, head: false, dist: 0 }); }          // a public match: the kill is mine
    if (this.isHost) this.checkEnd();
  },
  // host -> guests: a bot died
  on_bk(m) {
    const p = this.puppets[m.i]; if (!p) return;
    p.markDead(); const wn = Game.weaponName(m.w);
    if (m.by === this.user) { Player.kills++; G.kills++; if (Profile.match) { Profile.match.kills++; if (m.h) Profile.match.headshots++; } HUD.hitMarker(true, !!m.h); Events.emit('kill', { victim: p, wid: m.w, head: !!m.h, dist: m.dist || 0 }); }
    HUD.feed(this.T('feed.kill', { a: m.bn || '?', v: p.name }) + (wn ? ' · ' + wn : ''), m.by === this.user ? 0xf3c64a : 0);
  },
  botDied(bot, attacker, wid) {
    if (!(this.active && this.coop && this.isHost)) return;
    const head = !!(bot.lastHit && bot.lastHit.head), dist = bot.lastHit ? bot.lastHit.dist : 0;
    this.all({ t: 'bk', i: bot.idx, by: attacker && attacker.user ? attacker.user : (attacker === Player ? this.user : ''), bn: attacker ? attacker.name : '', w: wid || '', h: head ? 1 : 0, dist });
  },

  // ---------- loot sync (co-op) ----------
  lootList() { return Loot.items.map(r => ({ i: r.id, x: r2(r.x), y: r2(r.y), z: r2(r.z), it: r.item })); },
  loadLoot(list) { Loot.clear(); Loot.silent = true; for (const e of list) { const rec = Loot.spawn(e.x, e.y, e.z, e.it); rec.id = e.i; } Loot.silent = false; },
  lootSpawned(rec) { if (this.active && this.coop && !Loot.silent) this.cast({ t: 'ls', i: rec.id, x: r2(rec.x), y: r2(rec.y), z: r2(rec.z), it: rec.item }); },
  lootRemoved(rec) { if (this.active && this.coop && !Loot.silent && rec.id) this.cast({ t: 'lr', i: rec.id }); },
  on_ls(m, u) { Loot.silent = true; const rec = Loot.spawn(m.x, m.y, m.z, m.it); rec.id = m.i; Loot.silent = false; if (this.isHost) this.all(m, u); },
  on_lr(m, u) { const rec = Loot.items.find(r => r.id === m.i); if (rec) { Loot.silent = true; Loot.remove(rec); Loot.silent = false; } if (this.isHost) this.all(m, u); },

  // ---------- co-op session ----------
  // host: called at the end of Game.beginBR, once the match world exists
  enterCoopHost() {
    this.session = { kind: 'coop', host: true }; this.coop = this.active = this.isHost = true; this.duel = false; this.hostUser = this.user; Player.team = this.ffa ? null : 'A'; Loot.idPrefix = 'h';
    let n = 0; for (const r of Loot.items) r.id = 'h' + (++n); Loot.idN = n;
    for (const m of this.party.members) if (m.u !== this.user) this.addRemote(m.u);
    const th = Math.atan2(Player.planeDir.z, Player.planeDir.x);
    // big messages are not reliable over WebRTC data channels, so the world description goes out in small pieces
    const loot = this.lootList(), CH = 25, chunks = Math.ceil(loot.length / CH);
    const init = { t: 'init', map: Profile.d.loadout.map || 'classic', th, nl: chunks, bots: G.bots.map(b => ({ i: b.idx, n: b.name, s: b.skinId })), zone: Zone.snapshot() };
    for (const m of this.party.members) if (m.u !== this.user) {
      this.send(m.u, init);
      for (let k = 0; k < chunks; k++) this.send(m.u, { t: 'il', k, l: loot.slice(k * CH, (k + 1) * CH) });
    }
    this.stT = this.snapT = this.zoneT = this.checkT = 0;
  },
  on_init(m) {
    if (!this.session || this.session.kind !== 'coop' || this.session.host || G.state !== 'menu') return;
    this.pendInit = m; m.loot = []; this.tryStartGuest();
  },
  on_il(m) { if (this.pendInit) { this.pendInit.loot.push(...m.l); this.pendInit.got = (this.pendInit.got || 0) + 1; this.tryStartGuest(); } },
  tryStartGuest() {
    const i = this.pendInit; if (!i || (i.got || 0) < i.nl) return;
    this.pendInit = null; Game.start({ mode: 'br', net: { role: 'guest', init: i } });
  },
  // guest: called from Game.beginBR with the host's world description
  enterCoopGuest(init) {
    this.session = { kind: 'coop', host: false }; this.coop = this.active = true; this.isHost = false; this.duel = false; Player.team = this.ffa ? null : 'A'; Loot.idPrefix = 'g' + this.user;
    this.loadLoot(init.loot);
    const dx = Math.cos(init.th), dz = Math.sin(init.th);
    Player.planeDir.set(dx, 0, dz); Player.pos.set(-dx * (MAP.half + 40), 170, -dz * (MAP.half + 40)); Player.yaw = Math.atan2(-dx, -dz);
    for (const m of this.party.members) if (m.u !== this.user) this.addRemote(m.u);
    for (const b of init.bots) this.puppets[b.i] = new Remote({ idx: b.i, n: b.n, skin: b.s, puppet: true });
    Zone.remote = true; Zone.apply(init.zone);
    this.stT = this.snapT = this.zoneT = this.checkT = 0;
  },

  botSnapshot() {
    const rows = [];
    for (const b of G.bots) {
      const w = b.weapon(), dropping = b.state === 'drop';
      const flags = (b.alive ? 1 : 0) | (b.crouch ? 2 : 0) | (dropping ? (b.dropPhase === 'free' ? 4 : 8) : 0) | (b.riding ? 16 : 0) | (G.time - b.lastFired < 2.2 ? 32 : 0) | (b.state === 'dropwait' ? 64 : 0);
      rows.push([b.idx, r1(b.pos.x), r1(b.pos.y), r1(b.pos.z), r2(b.yaw), r2(b.aimPitch || 0), flags, r1(b.speed || 0), w ? w.id + '|' + w.rarity + '|' + (w.sight || 'iron') : '', b.walkDir >= 0 ? 1 : -1]);
    }
    return rows;
  },
  on_bs(m) {
    for (const r of m.r) {
      const p = this.puppets[r[0]]; if (!p || !p.rig) continue;
      const f = r[6], drop = f & 12;
      if (!(f & 1)) { if (p.alive) { p.pos.set(r[1], r[2], r[3]); p.markDead(); } continue; }
      if (f & 64) { p.rig.root.visible = false; p.phase = 'plane'; p.seen = false; continue; }
      p.apply({ x: r[1], y: r[2], z: r[3], yw: r[4], pt: r[5], c: f & 2, sp: r[7], ph: drop ? (f & 4 ? 1 : 2) : (f & 16 ? 4 : 3), w: r[8], fr: f & 32, wd: r[9] });
    }
  },
  on_zn(m) { Zone.apply(m.z); },

  checkEnd() {
    if (!(this.active && this.coop && this.isHost) || G.state !== 'playing') return;
    if (this.ffa) {                                                                                      // a public match: it ends when one player is left (or no real player is)
      const rem = Object.values(this.remotes).filter(r => r.alive), humans = (Player.alive ? 1 : 0) + rem.length, alive = humans + Bots.aliveCount(), total = BOT_COUNT + 1;
      if (humans === 0 || alive <= 1) {
        const w = Player.alive ? this.user : (rem[0] ? rem[0].user : '');
        this.all({ t: 'end', w, total }); Game.finish(!!Player.alive, { rank: Player.alive ? 1 : (this.myRank || alive + 1), total });
      }
      return;
    }
    const team = (Player.alive ? 1 : 0) + Object.values(this.remotes).filter(r => r.alive).length, bots = Bots.aliveCount(), total = BOT_COUNT + 1 + Object.keys(this.remotes).length;
    if (team === 0) { const rank = bots + 1; this.all({ t: 'end', won: 0, rank, total }); Game.finish(false, { rank, total }); }
    else if (bots === 0) { this.all({ t: 'end', won: 1, rank: 1, total }); Game.finish(true, { rank: 1, total }); }
  },
  on_end(m) {
    if (G.state !== 'playing') return;
    if (this.ffa) { const me = m.w === this.user; Game.finish(me, { rank: me ? 1 : (this.myRank || Game.aliveCount() + 1), total: m.total || BOT_COUNT + 1 }); return; }
    Game.finish(!!m.won, { rank: m.rank || 1, total: m.total || BOT_COUNT + 1 });
  },

  // ---------- public matches (found by the lobby server, src/net/matchmaking.js) ----------
  // m: the lobby's 'match' message. The host waits for the others (they send 'join'), the guests connect to the host. Resolves true when this client is part of a match that is starting.
  async publicMatch(m) {
    const me = this.user, mode = m.mode === 'br' ? 'pbr' : 'duel';
    if (m.role === 'host') {
      this.party = { host: me, mode, members: [Object.assign({ u: me }, this.myInfo())], expect: m.members.length, br: m.br, auto: true }; this.emit('party');
      clearTimeout(this.autoT); this.autoT = setTimeout(() => this.autoStart(), 14000);
      return true;
    }
    this.party = { host: m.host, mode, members: [], guest: true };
    for (let i = 0; i < 3; i++) { try { const c = await this.connect(m.host); c.send(Object.assign({ t: 'join' }, this.myInfo())); return true; } catch (e) { await new Promise(r => setTimeout(r, 1500)); } }
    this.party = null; this.emit('party'); return false;
  },
  autoStart() {
    clearTimeout(this.autoT); const P = this.party;
    if (!P || P.host !== this.user || this.session || G.state !== 'menu') return;
    if (P.members.length < 2) { this.party = null; this.emit('party'); this.emit('alone'); return; }          // nobody came: the caller plays against bots instead
    this.startMatch();
  },

  // ---------- duel ----------
  duelRound(duel, spawn, foe) {
    const r = this.addRemote(foe, { team: null });
    r.pos.set(spawn[0], 0, spawn[1]); r.target.copy(r.pos); r.yaw = r.tyaw = spawn[2]; r.seen = true; r.phase = 'ground'; r.rig.root.visible = true; r.rig.setShadows(true);
    duel.opp = r;
  },
  on_dto(m) { if (this.duel && Duel.phase === 'fight') Duel.endRound(!m.w); },
  finishDuelForfeit() {
    if (Duel.phase === 'done' || G.state !== 'playing') return;
    Duel.phase = 'done'; Game.finish(true, { title: this.T('duel.victory'), stats: this.T('duel.final', { a: Duel.score[0], b: Duel.score[1], d: '' }), total: 2, rank: 1, time: Math.round(G.time) });
  },

  // ---------- per frame ----------
  update(dt) {
    if (!this.active) return;
    for (const u in this.remotes) this.remotes[u].update(dt);
    for (const i in this.puppets) this.puppets[i].update(dt);
    this.stT -= dt;
    if (this.stT <= 0) { this.stT = 1 / 12; this.cast(this.localState()); }
    if (this.coop && this.isHost) {
      this.snapT -= dt; if (this.snapT <= 0) { this.snapT = 1 / 8; this.all({ t: 'bs', r: this.botSnapshot() }); }
      this.zoneT -= dt; if (this.zoneT <= 0) { this.zoneT = 1; this.all({ t: 'zn', z: Zone.snapshot() }); }
      this.checkT -= dt; if (this.checkT <= 0) { this.checkT = 1; this.checkEnd(); }
    }
    // duel: the host decides when the round times out
    if (this.duel && this.isHost && Duel.phase === 'fight' && Duel.roundT > 110 && Duel.opp) {
      const o = Duel.opp, w = Player.health + Player.shield >= o.health + o.shield; this.send(o.user, { t: 'dto', w: w ? 1 : 0 }); Duel.endRound(w);
    }
  },

  aliveExtra() { let n = 0; if (this.coop) for (const u in this.remotes) if (this.remotes[u].alive) n++; for (const i in this.puppets) if (this.puppets[i].alive) n++; return n; },
  actors() { const out = []; for (const u in this.remotes) { const r = this.remotes[u]; if (r.alive && r.seen && r.phase !== 'plane') out.push(r); } for (const i in this.puppets) { const p = this.puppets[i]; if (p.alive && p.seen) out.push(p); } return out; }
};
