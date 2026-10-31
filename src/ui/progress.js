// Challenges tab (daily / weekly missions + achievements) and the ULTRA MAX leaderboard tab.
(function () {
  const h = (t, c, html) => Menu.h(t, c, html), T = (k, p) => I18n.t(k, p);
  const roman = ['I', 'II', 'III', 'IV', 'V'];

  const missionCard = m => {
    const pct = Math.round(m.progress / m.goal * 100);
    return h('div', 'mission' + (m.done ? ' done' : ''), `<div class="mtext">${T('mission.' + m.id, { n: I18n.n(m.goal) })}</div><div class="mbar"><s style="width:${pct}%"></s><em>${I18n.n(m.progress)} / ${I18n.n(m.goal)}</em></div><div class="mrew"><i class="coin"></i>${I18n.n(m.coins)} <i class="pt"></i>${m.pts}</div>`);
  };

  Menu.achFilter = 'all';
  Menu.builders.challenges = function (el) {
    el.innerHTML = '';
    const a = h('div', 'side a wide'), b = h('div', 'side b wide2');
    const M = Profile.d.missions;
    a.appendChild(h('h3', 'ttl', T('ch.daily')));
    for (const m of M.daily.list) a.appendChild(missionCard(m));
    a.appendChild(h('h3', 'ttl', T('ch.weekly')));
    for (const m of M.weekly.list) a.appendChild(missionCard(m));
    // achievements
    const bar = h('div', 'seg subtabs');
    for (const f of ['all', 'special', 'done']) { const bt = h('button', Menu.achFilter === f ? 'on' : '', T('ch.f.' + f)); bt.onclick = () => { Menu.achFilter = f; Sound.ui(); Menu.builders.challenges(el); }; bar.appendChild(bt); }
    b.appendChild(h('h3', 'ttl', T('ch.ach'))); b.appendChild(bar);
    const list = h('div', 'achlist'), all = Profile.achList();
    let doneCount = 0, total = all.length; for (const x of all) if (x.done) doneCount++;
    b.appendChild(h('p', 'small', T('ch.progress', { a: doneCount, b: total, p: I18n.n(Profile.d.points) })));
    for (const c of CATALOG.chains) {
      const tiers = all.filter(x => x.chain === c.id), cur = tiers.find(x => !x.done) || tiers[tiers.length - 1], doneT = tiers.filter(x => x.done).length;
      if (Menu.achFilter === 'special' && !c.special) continue; if (Menu.achFilter === 'done' && !doneT) continue;
      const complete = doneT === tiers.length, pct = Math.round(cur.val / cur.goal * 100);
      const row = h('div', 'ach' + (c.special ? ' special' : '') + (complete ? ' done' : ''), `<div class="atop"><b>${T('ach.' + c.id + '.n')}</b><span class="tiers">${tiers.map(t => `<i class="${t.done ? 'on' : ''}">${roman[t.tier]}</i>`).join('')}</span></div><div class="adesc">${T('ach.' + c.id + '.d', { n: I18n.n(cur.goal) })}</div><div class="mbar"><s style="width:${complete ? 100 : pct}%"></s><em>${I18n.n(Math.min(cur.val, cur.goal))} / ${I18n.n(cur.goal)}</em></div><div class="mrew"><i class="coin"></i>${I18n.n(cur.coins)} <i class="pt"></i>${cur.pts}</div>`);
      list.appendChild(row);
    }
    b.appendChild(list); el.appendChild(a); el.appendChild(b);
  };

  // ---------- leaderboard ----------
  Menu.builders.board = function (el) {
    el.innerHTML = '';
    const a = h('div', 'side a wide');
    a.appendChild(h('h3', 'ttl ultra-title', T('board.title'))); a.appendChild(h('p', 'small', T('board.desc')));
    const status = h('p', 'small status', T('board.loading')); a.appendChild(status);
    const tbl = h('div', 'board'); a.appendChild(tbl);
    const b = h('div', 'side b');
    const me = h('div', 'card'); me.appendChild(h('h3', '', T('board.you')));
    const ultraOwned = Profile.owns('skin', 'ultra'), ultraOn = Settings.get('skin') === 'ultra';
    me.appendChild(h('div', 'big', `<i class="pt"></i> ${I18n.n(Profile.d.points)}`));
    me.appendChild(h('p', '', T(ultraOwned ? (ultraOn ? 'board.ready' : 'board.equip') : 'board.need')));
    const sub = h('button', 'buy', T('board.submit')); sub.disabled = !(ultraOwned && ultraOn);
    sub.onclick = async () => { sub.disabled = true; const r = await Online.submitScore(true); HUD.toast(T(r.ok ? 'board.sent' : 'board.fail'), '', r.ok ? 0x5fd14a : 0xff6a6a); await load(); sub.disabled = !(ultraOwned && ultraOn); };
    const rank = h('p', 'rankline', ''); me.appendChild(rank);
    me.appendChild(sub);
    const rf = h('button', 'ghostbtn small', T('board.refresh')); rf.onclick = () => { Sound.ui(); load(); }; me.appendChild(rf); b.appendChild(me);
    const tip = h('div', 'card'); tip.appendChild(h('h3', '', T('board.how'))); tip.appendChild(h('p', 'small', T('board.howText'))); b.appendChild(tip);
    async function load() {
      if (!document.body.contains(el) || (Menu.tab !== 'board' && tbl.childElementCount)) return;
      if (!tbl.childElementCount) status.textContent = T('board.loading');
      const res = await Online.fetchBoard();
      status.textContent = T(res.online ? 'board.online' : res.stale ? 'board.stale' : 'board.offline') + (res.online ? ' · ' + res.list.length + '/100' : '');
      status.classList.toggle('live', !!res.online);
      rank.textContent = res.me >= 0 ? T('board.rank', { n: res.me + 1 }) : (ultraOn ? T('board.notTop') : '');
      tbl.innerHTML = '';
      const head = h('div', 'brow bh', `<span>#</span><span>${T('board.player')}</span><span>${T('board.pts')}</span>`); tbl.appendChild(head);
      if (!res.list.length) tbl.appendChild(h('p', 'small', T('board.empty')));
      const medal = ['🥇', '🥈', '🥉'];
      res.list.slice(0, 100).forEach((e, i) => tbl.appendChild(h('div', 'brow' + (i < 3 ? ' top' + (i + 1) : '') + (i === res.me ? ' me' : ''), `<span>${i < 3 ? medal[i] : i + 1}</span><span>${(e.name || '?').replace(/[<>&]/g, '')}<small>${T('wallet.lvl')} ${e.lvl || 1}</small></span><span>${I18n.n(e.points)}</span>`)));
    }
    el.appendChild(a); el.appendChild(b); load();
    // the table stays fresh while it is on screen
    clearInterval(Menu.boardTimer); Menu.boardTimer = setInterval(() => { if (Menu.tab === 'board' && G.state === 'menu') load(); }, 30000);
  };
  Menu.onTab = Menu.onTab || {};
  Menu.onTab.challenges = () => Menu.builders.challenges(document.getElementById('tab-challenges'));
  Menu.onTab.board = () => Menu.builders.board(document.getElementById('tab-board'));
})();
