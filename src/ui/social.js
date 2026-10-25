// Friends tab: go online with a username, friends list with presence, invitations and the party lobby (see net/p2p.js).
(function () {
  const h = (t, c, html) => Menu.h(t, c, html), T = (k, p) => I18n.t(k, p);
  const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const online = {};                                         // friend username -> last presence result
  let host = null, draft = '', typing = '';

  // developer helper: ?u=alice&n=Alice&k=cyber opens a second tab as another player (settings are shared between tabs of one browser)
  const q = new URLSearchParams(location.search);
  if (q.get('n')) Settings.data.name = q.get('n').slice(0, 14);
  if (q.get('k')) Settings.data.skin = q.get('k');
  const myUser = () => Net.sanitize(q.get('u') || draft || Settings.get('netName') || Settings.get('name'));

  const statusKey = { offline: 'friends.offlineMode', connecting: 'friends.connecting', taken: 'friends.nameTaken', nonet: 'friends.noNet', badname: 'friends.badName' };

  function render() {
    if (!host) return;
    host.innerHTML = '';
    const a = h('div', 'side a wide'), b = h('div', 'side b');
    // --- connection card
    const c = h('div', 'card'); c.appendChild(h('h3', '', T('friends.title')));
    const on = Net.status === 'online';
    c.appendChild(h('div', 'netstat ' + (on ? 'on' : Net.status === 'connecting' ? 'wait' : 'off'), `<i class="dot"></i>${on ? esc(T('friends.onlineMode', { name: Net.user })) : esc(T(statusKey[Net.status] || 'friends.offlineMode'))}`));
    const row = h('div', 'frow'); const inp = h('input'); inp.maxLength = 16; inp.placeholder = T('friends.name'); inp.value = on ? Net.user : myUser(); inp.disabled = on || Net.status === 'connecting';
    inp.oninput = () => { draft = inp.value; };
    const go = h('button', on ? 'ghostbtn' : 'buy', T(on ? 'friends.offlineMode' : 'friends.connect')); go.disabled = Net.status === 'connecting';
    go.onclick = () => { Sound.ui(); if (on) Net.stop(); else Net.go(inp.value || myUser()); };
    row.appendChild(inp); row.appendChild(go); c.appendChild(row);
    if (on) { const cp = h('button', 'ghostbtn small', T('friends.copy')); cp.onclick = () => { try { navigator.clipboard.writeText(Net.user); } catch (e) { /* ignore */ } HUD.toast(T('friends.copied'), '', 0x5fd14a); }; c.appendChild(cp); }
    a.appendChild(c);
    // --- add friend
    const f = h('div', 'card'); f.appendChild(h('h3', '', T('friends.add')));
    const ar = h('div', 'frow'); const ai = h('input'); ai.maxLength = 16; ai.placeholder = T('friends.addPh'); ai.value = typing; ai.oninput = () => { typing = ai.value; };
    const ab = h('button', 'buy', T('friends.addBtn'));
    const add = () => {
      const u = Net.sanitize(ai.value); if (!u) return;
      if (u === Net.sanitize(Net.user || myUser())) return HUD.toast(T('friends.self'), '', 0xffb84a);
      if (Profile.d.friends.includes(u)) return HUD.toast(T('friends.dupe'), '', 0xffb84a);
      Profile.d.friends.push(u); Profile.save(); typing = ''; HUD.toast(T('friends.added'), u, 0x5fd14a); Sound.pickup(); render(); ping(u);
    };
    ab.onclick = add; ai.onkeydown = e => { if (e.key === 'Enter') add(); e.stopPropagation(); };
    ar.appendChild(ai); ar.appendChild(ab); f.appendChild(ar); a.appendChild(f);
    // --- friend list
    const l = h('div', 'card'); l.appendChild(h('h3', '', T('friends.list')));
    if (!Profile.d.friends.length) l.appendChild(h('p', 'small', T('friends.none')));
    for (const u of Profile.d.friends) {
      const isOn = on && (online[u] || Net.isPeer(u)), r = h('div', 'frow fr'); r.appendChild(h('span', 'fname', `<i class="dot ${isOn ? 'on' : ''}"></i>${esc(Net.info[u] ? Net.info[u].n + ' · ' : '')}${esc(u)}`));
      const iv = h('button', 'buy', T('friends.invite')); iv.disabled = !on || !!Net.session || (Net.party && Net.party.host !== Net.user);
      iv.onclick = () => { Sound.ui(); Net.invitePlayer(u, Net.party ? Net.party.mode : (Settings.get('partyMode') || 'duo')); };
      const rm = h('button', 'ghostbtn small', T('friends.remove')); rm.onclick = () => { Profile.d.friends = Profile.d.friends.filter(x => x !== u); Profile.save(); render(); };
      r.appendChild(iv); r.appendChild(rm); l.appendChild(r);
    }
    a.appendChild(l);
    // --- party
    const P = Net.party, pc = h('div', 'card'); pc.appendChild(h('h3', '', T('party.title')));
    const isHost = !P || P.host === Net.user, mode = P ? P.mode : (Settings.get('partyMode') || 'duo');
    pc.appendChild(h('p', 'small', T('party.mode')));
    const seg = h('div', 'seg');
    for (const [k, key] of [['duo', 'party.duo'], ['trio', 'party.trio'], ['squad', 'party.squad'], ['duel', 'party.duel']]) {
      const bt = h('button', mode === k ? 'on' : '', T(key)); bt.disabled = !isHost || !!Net.session;
      bt.onclick = () => { Sound.ui(); Settings.set('partyMode', k); if (P) Net.setMode(k); render(); }; seg.appendChild(bt);
    }
    pc.appendChild(seg);
    pc.appendChild(h('p', 'small', T('party.members')));
    if (!P || P.members.length < 2) pc.appendChild(h('p', 'small', T('party.empty')));
    for (const m of (P ? P.members : [])) pc.appendChild(h('div', 'frow mem', `<span class="fname"><i class="dot on"></i>${esc(m.n)} <small>${esc(m.u)}</small></span>${P.host === m.u ? `<b class="badge">${esc(T('party.host'))}</b>` : ''}`));
    const br = h('div', 'frow');
    if (P) {
      if (isHost) { const st = h('button', 'play', T('party.start')); st.disabled = P.members.length < 2 || G.state !== 'menu'; st.onclick = () => { if (!Net.startMatch()) HUD.toast(T('party.needMore'), '', 0xffb84a); }; br.appendChild(st); }
      else br.appendChild(h('p', 'small', T('party.hostOnly')));
      const lv = h('button', 'ghostbtn', T('party.leave')); lv.onclick = () => { Net.leaveParty(); render(); }; br.appendChild(lv);
    }
    pc.appendChild(br); b.appendChild(pc);
    // --- optional global board server
    const sv = h('div', 'card'); sv.appendChild(h('h3', '', T('net.server'))); const si = h('input'); si.placeholder = 'https://your-project.firebaseio.com'; si.value = Settings.get('dbUrl') || '';
    si.onchange = () => Settings.set('dbUrl', si.value.trim()); si.onkeydown = e => e.stopPropagation(); sv.appendChild(si); sv.appendChild(h('p', 'small', T('net.serverHint'))); b.appendChild(sv);
    host.appendChild(a); host.appendChild(b);
  }

  async function ping(u) { online[u] = await Net.check(u); if (Menu.tab === 'friends') render(); }
  function pingAll() { if (Net.status === 'online') for (const u of Profile.d.friends) ping(u); }

  Menu.builders.friends = function (el) { host = el; render(); };
  Menu.onTab = Menu.onTab || {};
  Menu.onTab.friends = () => { render(); pingAll(); };

  // invitation popup (shown in the lobby)
  let box = null;
  Net.on('invite', () => {
    if (box) { box.remove(); box = null; }
    const i = Net.invite; if (!i) return;
    box = h('div', 'invite', `<b>${esc(T('party.invited', { name: i.n, mode: T('party.' + i.mode) }))}</b>`);
    const ok = h('button', 'buy', T('party.accept')), no = h('button', 'ghostbtn small', T('party.decline'));
    ok.onclick = () => { Sound.pickup(); Net.acceptInvite(); }; no.onclick = () => Net.declineInvite();
    const rw = h('div', 'frow'); rw.appendChild(ok); rw.appendChild(no); box.appendChild(rw); document.body.appendChild(box); Sound.ui();
  });
  const again = () => { if (Menu.tab === 'friends') render(); };
  Net.on('status', () => { again(); if (Net.status === 'online') pingAll(); });
  Net.on('party', () => { again(); Menu.refresh && Menu.refresh(); });
  Net.on('hi', again); Net.on('conn', again);
  document.addEventListener('pointerdown', () => { /* keeps audio unlocked for the invite sound */ }, { once: true });
})();
