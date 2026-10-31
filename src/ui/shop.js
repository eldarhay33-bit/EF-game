// Locker (equip skins, gear, starter weapon) and Shop (buy skins, gear, starter weapons, special maps with coins).
(function () {
  const h = (t, c, html) => Menu.h(t, c, html), T = (k, p) => I18n.t(k, p), hex = c => '#' + c.toString(16).padStart(6, '0');
  const rcol = r => hex(RARITY[Math.min(r, 6)].color);

  function effectText(slot, tier) {
    const E = CATALOG.equip, i = tier - 1, pc = v => Math.round(v * 100);
    switch (slot) {
      case 'vest': return T('eff.vest', { n: E.vest.shield[i], p: pc(E.vest.dr[i]) });
      case 'helmet': return T('eff.helmet', { p: pc(E.helmet.hs[i]) });
      case 'boots': return T('eff.boots', { p: pc(E.boots.speed[i]), q: pc(E.boots.quiet[i]) });
      case 'gloves': return T('eff.gloves', { p: pc(E.gloves.reload[i]) });
      default: return T('eff.pack', { a: E.pack.meds[i], b: E.pack.shields[i], c: E.pack.frags[i] });
    }
  }
  const starterOf = id => CATALOG.starters.find(s => s.id === id);
  const starterName = s => WEAPONS[s.w].name + ' · ' + RARITY[s.r].name;

  const skinCard = (sk, onClick, owned, price) => {
    const col = rcol(sk.rarity), swatch = sk.camo ? `linear-gradient(135deg, ${sk.camo.slice(0, 4).map((c, i) => hex(c) + ' ' + (i * 25) + '%').join(',')})` : `linear-gradient(135deg, ${hex(sk.cloth)}, ${hex(sk.gear)})`;
    const c = h('div', 'skin' + (sk.rarity >= 6 ? ' ultra' : '') + (owned ? '' : ' lockd'), `<div class="sw" style="background:${swatch}"><img class="th" alt="">${sk.glow ? `<i style="background:${hex(sk.glow)}"></i>` : ''}</div><div class="nm">${sk.name}</div><div class="rar" style="color:${col}">${RARITY[Math.min(sk.rarity, 6)].name}</div>${owned ? '' : `<div class="price"><i></i>${I18n.n(price)}</div>`}`);
    c.style.setProperty('--rc', col); c.onclick = onClick; Thumbs.attach(sk.id, c.querySelector('img.th')); return c;
  };

  // ---------- locker ----------
  Menu.builders.locker = function (el) {
    el.innerHTML = '';
    const a = h('div', 'side a wide'), b = h('div', 'side b');
    const owned = SKINS.filter(s => Profile.owns('skin', s.id)), cur = Settings.get('skin');
    a.appendChild(h('h3', 'ttl', T('locker.skins')));
    const grid = h('div', 'skingrid');
    for (const sk of SKINS) {
      const own = Profile.owns('skin', sk.id);
      const c = skinCard(sk, () => { if (!own) { Menu.previewId = sk.id; Menu.rebuildRig(); Menu.shopTab = 'skins'; Menu.setTab('shop'); return; } Settings.set('skin', sk.id); Profile.equip('skin', sk.id); Menu.previewId = null; Menu.rebuildRig(); Sound.ui(); Menu.builders.locker(el); }, own, Profile.skinPrice(sk));
      if (own && cur === sk.id) c.classList.add('on'); grid.appendChild(c);
    }
    a.appendChild(grid);
    // gear + starter weapon
    const g = h('div', 'card'); g.appendChild(h('h3', '', T('locker.gear')));
    for (const slot of CATALOG.equipSlots) {
      const tier = Profile.d.loadout[slot] || 0, ownedTiers = [0].concat(Profile.d.owned[slot].map(Number).sort());
      const row = h('div', 'gearrow'), name = h('div', 'gname', `<b>${T('equip.' + slot)}</b><small>${tier ? effectText(slot, tier) : T('locker.none')}</small>`);
      if (tier) name.style.setProperty('--rc', rcol(tier - 1));
      const prev = h('button', 'arrow', '‹'), next = h('button', 'arrow', '›'), step = d => { const i = ownedTiers.indexOf(tier), n = ownedTiers[(i + d + ownedTiers.length) % ownedTiers.length]; Profile.equip(slot, n); Menu.rebuildRig(); Sound.ui(); Menu.builders.locker(el); };
      prev.onclick = () => step(-1); next.onclick = () => step(1);
      row.appendChild(prev); row.appendChild(name); row.appendChild(next); g.appendChild(row);
    }
    b.appendChild(g);
    const sw = h('div', 'card'); sw.appendChild(h('h3', '', T('locker.starter')));
    const list = h('div', 'seg col');
    for (const s of CATALOG.starters) {
      if (!Profile.owns('starter', s.id)) continue;
      const btn = h('button', Profile.d.loadout.starter === s.id ? 'on' : '', starterName(s)); btn.style.setProperty('--rc', rcol(s.r));
      btn.onclick = () => { Profile.equip('starter', s.id); Menu.previewGun = s.w; Menu.rebuildRig(); Sound.ui(); Menu.builders.locker(el); }; list.appendChild(btn);
    }
    sw.appendChild(list); b.appendChild(sw);
    el.appendChild(a); el.appendChild(b);
  };

  // ---------- shop ----------
  const buyBtn = (price, onBuy, owned, why) => {
    if (owned) return h('div', 'owned', T('shop.owned'));
    const can = Profile.canBuy(price), btn = h('button', 'buy' + (can ? '' : ' no'), `<i></i>${I18n.n(price)}`);
    btn.onclick = e => { e.stopPropagation(); onBuy(); }; if (why) btn.title = why; return btn;
  };

  function doBuy(type, id, price, after) {
    const r = Profile.buy(type, id, price);
    if (!r.ok) { HUD.toast(T(r.why === 'coins' ? 'shop.needCoins' : r.why === 'ultraReq' ? 'shop.ultraReq' : 'shop.owned'), '', 0xff6a6a); Sound.hurt && Sound.ui(); return false; }
    Sound.pickup(); HUD.toast(T('shop.bought'), '', 0x5fd14a); Menu.refresh(); if (after) after(); return true;
  }

  Menu.shopTab = 'skins';
  Menu.builders.shop = function (el) {
    el.innerHTML = '';
    const a = h('div', 'side a wide'), bar = h('div', 'seg subtabs');
    for (const k of ['skins', 'gear', 'weapons', 'maps']) { const b = h('button', Menu.shopTab === k ? 'on' : '', T('shop.' + k)); b.onclick = () => { Menu.shopTab = k; Sound.ui(); Menu.builders.shop(el); }; bar.appendChild(b); }
    a.appendChild(bar);
    const grid = h('div', 'shopgrid');
    const rebuild = () => Menu.builders.shop(el);
    if (Menu.shopTab === 'skins') {
      const list = SKINS.slice().sort((x, y) => y.rarity - x.rarity);
      for (const sk of list) {
        const own = Profile.owns('skin', sk.id), price = Profile.skinPrice(sk);
        if (sk.rarity >= 6) {
          const hero = h('div', 'ultracard', `<div class="ushine"></div><img class="th" alt=""><b>${sk.name}</b><small>${T('shop.ultraDesc')}</small><em>${T('shop.ultraPts')}</em>`);
          Thumbs.attach(sk.id, hero.querySelector('img.th'));
          hero.onclick = () => { Menu.previewId = sk.id; Menu.rebuildRig(); }; hero.appendChild(buyBtn(price, () => doBuy('skin', sk.id, price, rebuild), own)); if (!own) hero.appendChild(h('small', 'req', T('shop.ultraReq'))); grid.appendChild(hero); continue;
        }
        const c = skinCard(sk, () => { Menu.previewId = sk.id; Menu.rebuildRig(); Sound.ui(); }, true, price);
        if (price > 0 || !own) c.appendChild(buyBtn(price, () => doBuy('skin', sk.id, price, rebuild), own)); else c.appendChild(h('div', 'owned', T('shop.owned')));
        grid.appendChild(c);
      }
    } else if (Menu.shopTab === 'gear') {
      for (const slot of CATALOG.equipSlots) for (let t = 1; t <= 5; t++) {
        const id = String(t), own = Profile.owns(slot, id), price = CATALOG.tierPrice[t - 1];
        const c = h('div', 'shopItem', `<div class="ico gear-${slot}"></div><div class="nm">${T('equip.' + slot)} · ${RARITY[t - 1].name}</div><div class="rar" style="color:${rcol(t - 1)}">${effectText(slot, t)}</div>`);
        c.style.setProperty('--rc', rcol(t - 1)); c.onclick = () => { Menu.tryOn = { [slot]: t }; Menu.rebuildRig(); Sound.ui(); };          // a tap shows the piece on the character before it is bought
        c.appendChild(buyBtn(price, () => doBuy(slot, id, price, () => { if (t > (Profile.d.loadout[slot] || 0)) Profile.equip(slot, t); Menu.tryOn = null; Menu.rebuildRig(); rebuild(); }), own)); grid.appendChild(c);          // a better piece is put on at once
      }
    } else if (Menu.shopTab === 'weapons') {
      for (const s of CATALOG.starters) {
        if (s.price === 0) continue;
        const own = Profile.owns('starter', s.id), d = WEAPONS[s.w];
        const c = h('div', 'shopItem', `<div class="ico wpn"></div><div class="nm">${starterName(s)}</div><div class="rar" style="color:${rcol(s.r)}">${T('shop.starterDesc')}</div><small>${d.mode}</small>`);
        c.style.setProperty('--rc', rcol(s.r)); c.onclick = () => { Menu.previewGun = s.w; Menu.rebuildRig(); }; c.appendChild(buyBtn(s.price, () => doBuy('starter', s.id, s.price, rebuild), own)); grid.appendChild(c);
      }
    } else {
      for (const m of CATALOG.maps) {
        if (m.price === 0) continue;
        const own = Profile.owns('map', m.id);
        const c = h('div', 'shopItem mapitem map-' + m.id, `<div class="ico"></div><div class="nm">${T('map.' + m.id)}</div><div class="rar">${T('map.' + m.id + '.d')}</div><small>${T(m.type === 'duel' ? 'shop.duelMap' : 'shop.brMap')}</small>`);
        c.appendChild(buyBtn(m.price, () => doBuy('map', m.id, m.price, rebuild), own)); grid.appendChild(c);
      }
    }
    a.appendChild(grid);
    const b = h('div', 'side b'); b.appendChild(h('div', 'card', `<h3>${T('shop.wallet')}</h3><div class="big"><span class="coin"></span> ${I18n.n(Profile.d.coins)}</div><p>${T('shop.earn')}</p>`));
    el.appendChild(a); el.appendChild(b);
  };
  Menu.onTab = Menu.onTab || {};
  Menu.onTab.shop = () => { Menu.builders.shop(document.getElementById('tab-shop')); };
  Menu.onTab.locker = () => { Menu.previewId = null; Menu.rebuildRig(); Menu.builders.locker(document.getElementById('tab-locker')); };
  const prevPlay = Menu.onTab.play; Menu.onTab.play = () => { Menu.previewId = null; Menu.rebuildRig(); if (prevPlay) prevPlay(); };
})();
