// The lobby server of Last Squad Standing on Cloudflare (free plan): a Worker that hands every WebSocket to ONE Durable Object, which runs the matchmaker (matchmaker.js).
// It only puts players together: who plays with whom and who hosts. The matches themselves are played peer-to-peer (the game traffic never passes through here), which is what keeps a free plan enough.
// WebSocket Hibernation: an idle lobby is not kept in memory and not billed; the queue is rebuilt from what the sockets remember (serializeAttachment) when it wakes up.
// Requests that count against the free 100,000 a day: every message a player sends (a ticket, a ping every 15 s, a cancel; incoming WebSocket messages count 1 in 20) and every 2-second alarm while somebody waits.
// Deploy: see server/README.md (npx wrangler login, npx wrangler deploy).
import Matchmaker from './matchmaker.js';

export class Lobby {
  constructor(state, env) { this.state = state; this.env = env; this.mm = new Matchmaker(); this.loaded = false; }

  // after a wake-up the queue is rebuilt from the sockets that are still open
  load() {
    if (this.loaded) return; this.loaded = true; this.mm = new Matchmaker();
    for (const ws of this.state.getWebSockets()) { const t = ws.deserializeAttachment(); if (t && t.id) { this.mm.tickets.set(t.id, t); this.mm.seq = Math.max(this.mm.seq, t.seq || 0); } }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Last Squad Standing lobby', { status: 200 });
    const allowed = String((this.env && this.env.ALLOWED_ORIGINS) || '').split(',').map(s => s.trim()).filter(Boolean), origin = request.headers.get('Origin') || '';
    if (allowed.length && !allowed.includes(origin)) return new Response('forbidden', { status: 403 });                   // optional: only the game's own pages may use the lobby
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    this.load(); let m; try { m = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)); } catch (e) { return; }
    if (m.t === 'q') {
      const old = ws.deserializeAttachment(); if (old && old.id && old.id !== m.id) this.mm.cancel(old.id);
      if (this.mm.enqueue(m, Date.now())) { ws.serializeAttachment(this.mm.tickets.get(String(m.id))); await this.schedule(); this.flush(this.mm.tick(Date.now())); }
    } else if (m.t === 'c') { const t = ws.deserializeAttachment(); if (t && t.id) this.mm.cancel(t.id); ws.serializeAttachment(null); }
    // 't: p' (ping) keeps the connection alive and needs no answer
  }
  async webSocketClose(ws) { this.load(); const t = ws.deserializeAttachment(); if (t && t.id) this.mm.cancel(t.id); }
  async webSocketError(ws) { return this.webSocketClose(ws); }

  // every 2 seconds while somebody waits: make matches, tell the others how long they have waited
  async alarm() { this.load(); this.flush(this.mm.tick(Date.now())); if (this.mm.tickets.size) await this.state.storage.setAlarm(Date.now() + 2000); }
  async schedule() { if ((await this.state.storage.getAlarm()) === null) await this.state.storage.setAlarm(Date.now() + 2000); }

  flush(events) {
    if (!events.length) return;
    const by = new Map(); for (const ws of this.state.getWebSockets()) { const t = ws.deserializeAttachment(); if (t && t.id) by.set(String(t.id), ws); }
    for (const ev of events) { const ws = by.get(String(ev.to)); if (!ws) continue; try { ws.send(JSON.stringify(ev.msg)); if (ev.msg.t === 'm' || ev.msg.t === 'x') ws.serializeAttachment(null); } catch (e) { /* the player is gone */ } }
  }
}

export default {
  async fetch(request, env) { return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(request); }
};
