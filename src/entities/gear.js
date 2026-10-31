// Equipment worn on the character: the five slots of the shop (helmet, vest, pack, boots, gloves) in five tiers each. A better tier is a different piece, not a recolour:
//   1 light and soft   2 a hard shell   3 reinforced, with a metal trim and a glowing accent   4 heavy alloy, extra guards   5 elite: closed or ornate, glowing lines
// The pieces are built like the gear of a skin (suit.js buildGear): rounded shapes fixed to the bones and merged with the skin's gear into a few meshes, so they cost no extra draw calls except two:
//   'alloy' (metal, tinted by the tier) and 'eq' (the glowing accent in the colour of the tier, the same colours as the weapon rarities); both carry vertex colours.
// What a piece replaces of the skin's own gear (the skin's cap under a helmet would be silly): see REPLACES. A helmet of tier 3 and up also covers the hair, gloves cover bare hands.
// The numbers (shield, damage reduction, speed...) are in CATALOG.equip and Profile.effects(); this file is only what it looks like. Bots and online players show the same pieces through opts.loadout.
(function () {
  const PI = Math.PI, SLOTS = ['vest', 'helmet', 'boots', 'gloves', 'pack'];
  const rc = (t) => RARITY[Math.max(0, Math.min(4, t - 1))].color;                                    // the tier colour (white, green, blue, purple, gold)
  const ALLOY = [0, 0x9aa4ae, 0x9aa4ae, 0xa3b6cc, 0x9484bf, 0xe6b84f];                                // the metal by tier (index 1..5): steel, steel, blue steel, violet steel, gold
  const REPLACES = { helmet: ['helmet', 'cap', 'beanie', 'hood', 'bubble', 'visor'], vest: ['vest'], pack: ['pack'], boots: ['boots', 'shins'] };
  const paint = (geo, hex, mul = 1) => { const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r * mul; a[i * 3 + 1] = c.g * mul; a[i * 3 + 2] = c.b * mul; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };

  // { vest, helmet, boots, gloves, pack } of 0..5 from a loadout (the profile's, a bot's, an online player's); null when nothing is worn
  Character.tiersOf = function (lo) {
    if (!lo) return null; const t = {}; let any = false;
    for (const s of SLOTS) { t[s] = Math.max(0, Math.min(5, Math.round(Number(lo[s]) || 0))); if (t[s]) any = true; }
    return any ? t : null;
  };
  Character.gearKey = (t) => t ? [t.vest, t.helmet, t.boots, t.gloves, t.pack].join('') : '';
  // does worn equipment take the place of this item of the skin's own gear?
  Character.equipReplaces = function (name, t) {
    for (const s in REPLACES) if (t[s] > 0 && REPLACES[s].includes(name)) return true;
    return (t.vest >= 4 && name === 'pads') || (t.gloves >= 4 && name === 'bracers') || (t.boots >= 5 && name === 'knees');
  };
  // the skin as it looks with this equipment: no hair under a closed helmet, gloves on bare hands (a copy: the skin itself stays as it is)
  Character.equipSkin = function (skin, t) {
    if (!t) return skin; const q = skin.q, suit = q.suit || {};
    return Object.assign({}, skin, { q: Object.assign({}, q, { hair: t.helmet >= 3 ? [] : q.hair, suit: t.gloves > 0 && suit.gloves === 0 ? Object.assign({}, suit, { gloves: 1 }) : suit }) });
  };

  // c: { add, rb, both, dome, ball, tube, ring, rest, k } from suit.js buildGear (add(kind, geometry, bone, x, y, z, rx, ry, rz, sx, sy, sz) in the model space of the base character); T: the tiers
  Character.equipParts = function (c, T) {
    const { add, rb, both, dome, tube, ring, rest, k } = c;
    const alloy = (t, geo, ...a) => add('alloy', paint(geo, ALLOY[t]), ...a);
    const glow = (t, geo, ...a) => add('eq', paint(geo, rc(t), 1.7), ...a);
    const sphere = (...a) => new THREE.SphereGeometry(...a);
    const at = (name) => { const p = rest[name]; return [p.x / k, p.y / k, p.z / k]; };                // a bone's rest position in the units of add()

    // ---------- helmet (the head, its middle is at y 1.69) ----------
    const helmet = (t) => {
      if (t === 1) {                                                                                     // a soft bump cap with a short peak
        add('fabric', dome(0.5), 'Head', 0, 1.7, -0.008, -0.1, 0, 0, 0.126, 0.118, 0.148); add('fabric', rb(0.19, 0.012, 0.09, 0.005), 'Head', 0, 1.742, 0.145, 0.15);
        return;
      }
      if (t === 5) {                                                                                     // closed elite helmet: alloy shell, tinted visor, crest, glowing brow line
        alloy(5, dome(0.8), 'Head', 0, 1.69, -0.01, 0, 0, 0, 0.138, 0.152, 0.162);
        add('glass', sphere(1, 28, 12, PI / 2 - 0.95, 1.9, PI * 0.36, PI * 0.26), 'Head', 0, 1.69, -0.01, 0, 0, 0, 0.142, 0.156, 0.166);
        alloy(5, rb(0.016, 0.045, 0.21, 0.007), 'Head', 0, 1.845, -0.02, -0.15); alloy(5, rb(0.1, 0.035, 0.07, 0.014), 'Head', 0, 1.585, 0.085);          // crest and chin guard
        glow(5, rb(0.17, 0.011, 0.01, 0.004), 'Head', 0, 1.745, 0.163);
        both((s) => { glow(5, rb(0.008, 0.012, 0.1, 0.003), 'Head', s * 0.139, 1.72, 0.02); add('metal', rb(0.012, 0.06, 0.07, 0.005), 'Head', s * 0.142, 1.66, -0.01); });
        add('metal', tube(0.004, 0.004, 0.13, false, 6), 'Head', -0.1, 1.83, -0.07, 0, 0, -0.2);
        return;
      }
      const shell = (geo, ...a) => t === 4 ? alloy(4, geo, ...a) : add('plate', geo, ...a);
      shell(dome(0.52), 'Head', 0, 1.708, -0.006, -0.28, 0, 0, 0.13, 0.145, 0.155);                      // the hard shell, tilted back so that the forehead and the eyes are free
      add('rubber', ring(0.13, 0.009), 'Head', 0, 1.699, -0.006, -0.28, 0, 0, 1, 1, 1.19);                // the rim
      both((s) => add('rubber', rb(0.008, 0.11, 0.014, 0.003), 'Head', s * 0.098, 1.6, 0.02, 0, 0, s * 0.08));          // chin strap
      add('metal', rb(0.05, 0.03, 0.03, 0.01), 'Head', 0, 1.79, 0.128, -0.22);
      if (t >= 3) {
        both((s) => { add('plate', rb(0.034, 0.075, 0.115, 0.012), 'Head', s * 0.128, 1.68, 0); add('metal', rb(0.016, 0.03, 0.12, 0.006), 'Head', s * 0.134, 1.738, 0); });          // ear guards and side rails
        add('metal', rb(0.07, 0.05, 0.04, 0.012), 'Head', 0, 1.79, 0.13, -0.22);                           // night-vision mount
        glow(t, rb(0.012, 0.014, 0.27, 0.004), 'Head', 0, 1.822, -0.01, -0.3);                             // the accent stripe over the crown
      }
      if (t === 4) {                                                                                     // face shield and chin guard
        add('glass', sphere(1, 28, 12, PI / 2 - 0.9, 1.8, PI * 0.34, PI * 0.28), 'Head', 0, 1.69, -0.01, 0, 0, 0, 0.138, 0.152, 0.162);
        alloy(4, rb(0.1, 0.03, 0.05, 0.012), 'Head', 0, 1.585, 0.1); glow(4, rb(0.15, 0.01, 0.01, 0.004), 'Head', 0, 1.742, 0.16);
      }
    };

    // ---------- vest (the chest, spine_03 at about y 1.3) ----------
    const vest = (t) => {
      const plate = (geo, ...a) => t >= 4 ? alloy(t, geo, ...a) : add('plate', geo, ...a);
      add('fabric', rb(0.31, 0.34, 0.075, 0.035), 'spine_03', 0, 1.31, 0.15, -0.06); add('fabric', rb(0.32, 0.34, 0.075, 0.035), 'spine_03', 0, 1.3, -0.2);          // front and back panel
      both((s) => add('fabric', rb(0.075, 0.03, 0.38, 0.012), 'spine_03', s * 0.1, 1.535, -0.02));          // shoulder straps
      if (t >= 2) { plate(rb(0.25, 0.27, 0.045, 0.03), 'spine_03', 0, 1.33, 0.185, -0.06); plate(rb(0.25, 0.27, 0.045, 0.03), 'spine_03', 0, 1.32, -0.228); }          // the plates
      if (t >= 2) both((s) => add('fabric', rb(0.07, 0.105, 0.05, 0.015), 'spine_02', s * 0.075, 1.12, 0.185));          // two pouches
      if (t >= 3) {
        add('fabric', tube(0.205, 0.21, 0.13, true, 28), 'spine_01', 0, 1.1, -0.02, 0, 0, 0, 1.0, 1.0, 0.82);          // cummerbund
        add('fabric', rb(0.07, 0.105, 0.05, 0.015), 'spine_02', 0, 1.12, 0.185);
        both((s) => { add('metal', rb(0.02, 0.05, 0.03, 0.008), 'spine_03', s * 0.12, 1.5, 0.17); add('plate', rb(0.04, 0.2, 0.15, 0.015), 'spine_03', s * 0.175, 1.27, 0.0); });
        glow(t, rb(0.26, 0.014, 0.012, 0.004), 'spine_03', 0, 1.215, 0.214, -0.06);                             // the accent line across the chest plate
      }
      if (t >= 4) {                                                                                      // heavy: shoulder guards and a high collar
        both((s, b) => { alloy(t, dome(0.5), 'upperarm_' + b, s * 0.245, 1.495, -0.065, 0, 0, -s * 0.3, 0.105, 0.05, 0.105); glow(t, ring(0.1, 0.006).rotateZ(-s * 0.3), 'upperarm_' + b, s * 0.245, 1.484, -0.065, 0, 0, 0, 1.0, 1.0, 1.0); });          // flat pauldrons over the shoulders
        alloy(t, tube(0.082, 0.105, 0.075, true, 24), 'neck_01', 0, 1.55, -0.035, -0.1);
      }
      if (t >= 5) {                                                                                      // elite: glowing emblem and edge lines, bigger pauldrons
        glow(5, rb(0.06, 0.06, 0.012, 0.004), 'spine_03', 0, 1.37, 0.222, -0.06, 0, PI / 4, 1, 1.35, 1);               // (every piece must be an indexed geometry: the pieces of one kind are merged)
        both((s) => { glow(5, rb(0.012, 0.22, 0.01, 0.004), 'spine_03', s * 0.105, 1.325, 0.216, -0.06); glow(5, rb(0.012, 0.22, 0.01, 0.004), 'spine_03', s * 0.105, 1.31, -0.254); alloy(5, dome(0.5), 'upperarm_' + (s > 0 ? 'l' : 'r'), s * 0.245, 1.52, -0.065, 0, 0, -s * 0.3, 0.075, 0.04, 0.075); });          // a second, smaller plate on top of each pauldron
      }
    };

    // ---------- pack (the back, about z -0.285) ----------
    const pack = (t) => {
      if (t === 1) { add('fabric', rb(0.23, 0.28, 0.11, 0.04), 'spine_03', 0, 1.3, -0.26); add('plate', rb(0.21, 0.05, 0.12, 0.02), 'spine_03', 0, 1.42, -0.26); return; }           // a small pouch
      const W = t >= 4 ? 0.34 : 0.3, Hh = t >= 4 ? 0.48 : 0.4, D = t >= 4 ? 0.21 : 0.17, y = t >= 4 ? 1.2 : 1.25, z = -0.285 - (D - 0.17) / 2;          // (the top stays below the head)
      add('fabric', rb(W, Hh, D, 0.05), 'spine_03', 0, y, z); add('plate', rb(W - 0.02, 0.07, D + 0.02, 0.03), 'spine_03', 0, y + Hh / 2 + 0.03, z);
      both((s) => add('fabric', rb(0.075, 0.2, 0.12, 0.03), 'spine_03', s * (W / 2 + 0.04), 1.17, z + 0.015));          // side pockets
      if (t >= 3) { add('rubber', tube(0.045, 0.045, 0.31, false, 14).rotateZ(PI / 2), 'spine_03', 0, y - Hh / 2 - 0.02, z + 0.005); glow(t, rb(0.12, 0.012, 0.012, 0.004), 'spine_03', 0, y + Hh / 2 - 0.03, z - D / 2 - 0.004); }          // bedroll and the accent tag
      if (t >= 4) { both((s) => add('metal', tube(0.034, 0.034, 0.26, false, 14), 'spine_03', s * (W / 2 + 0.085), 1.25, z + 0.02)); alloy(t, rb(0.2, 0.1, 0.06, 0.02), 'spine_03', 0, y - 0.02, z - D / 2 - 0.02); }          // canisters and a back plate
      if (t >= 5) { both((s) => { glow(5, rb(0.012, 0.3, 0.012, 0.004), 'spine_03', s * 0.09, y, z - D / 2 - 0.012); add('metal', tube(0.012, 0.012, 0.16, false, 8), 'spine_03', s * 0.14, y + Hh / 2 + 0.1, z + 0.02); }); }
    };

    // ---------- boots (feet and calves) ----------
    const boots = (t) => {
      both((s, b) => {
        if (t === 1) {                                                                                   // sneakers
          add('fabric', rb(0.118, 0.09, 0.29, 0.04), 'foot_' + b, s * 0.114, 0.075, 0.0, 0.05); add('rubber', rb(0.124, 0.03, 0.3, 0.014), 'foot_' + b, s * 0.114, 0.018, 0.0); add('fabric', tube(0.062, 0.058, 0.05, false, 16), 'calf_' + b, s * 0.114, 0.14, -0.045);
          return;
        }
        add('fabric', rb(0.125, 0.15, 0.31, 0.05), 'foot_' + b, s * 0.114, 0.085, 0.0, 0.04); add('rubber', rb(0.132, 0.036, 0.325, 0.016), 'foot_' + b, s * 0.114, 0.018, 0.0);          // boot and sole
        add('fabric', tube(0.074, 0.08, 0.17, false, 20), 'calf_' + b, s * 0.114, 0.2, -0.045); add('metal', rb(0.14, 0.02, 0.03, 0.006), 'foot_' + b, s * 0.114, 0.19, 0.0);        // shaft and the buckle
        if (t >= 3) { add('metal', rb(0.12, 0.07, 0.1, 0.03), 'foot_' + b, s * 0.114, 0.06, 0.125); glow(t, rb(0.134, 0.012, 0.16, 0.005), 'foot_' + b, s * 0.114, 0.047, 0.0); }          // steel toe cap, the accent band on the sole
        if (t >= 4) { alloy(t, rb(0.1, 0.3, 0.05, 0.025), 'calf_' + b, s * 0.114, 0.35, 0.012, -0.04); alloy(t, rb(0.14, 0.034, 0.34, 0.016), 'foot_' + b, s * 0.114, 0.012, 0.0); }          // shin guard (on the shin, not in front of it) and a heavy sole
        if (t >= 5) { glow(5, rb(0.012, 0.22, 0.01, 0.004), 'calf_' + b, s * 0.114, 0.35, 0.04, -0.04); glow(5, rb(0.138, 0.01, 0.2, 0.004), 'foot_' + b, s * 0.114, 0.026, 0.0); alloy(5, rb(0.12, 0.08, 0.06, 0.025), 'calf_' + b, s * 0.114, 0.575, 0.075, -0.1); }   // elite: glowing lines and a knee plate
      });
    };

    // ---------- gloves (hands and wrists; placed from the bones: arms differ between the two bodies) ----------
    const gloves = (t) => {
      both((s, b) => {
        const [hx, hy, hz] = at('hand_' + b), [mx] = at('middle_01_' + b), len = Math.abs(mx - hx), cx = hx + s * len * 0.5, wrist = 'lowerarm_' + b;
        add('cuff', tube(0.056, 0.062, 0.07, true, 18).rotateZ(PI / 2), wrist, hx - s * 0.04, hy, hz);                  // the wrist band (the cloth gloves themselves come from the suit)
        if (t === 1) return;
        add('plate', rb(len * 0.8, 0.012, 0.07, 0.005), 'hand_' + b, cx - s * len * 0.04, hy + 0.025, hz);          // the back of the hand
        if (t >= 3) { add('metal', rb(0.016, 0.022, 0.086, 0.007), 'hand_' + b, mx - s * 0.008, hy + 0.03, hz); glow(t, rb(0.05, 0.012, 0.062, 0.004), wrist, hx - s * 0.075, hy + 0.045, hz); }          // knuckle bar and an accent on the wrist
        if (t >= 4) { alloy(t, tube(0.064, 0.058, 0.17, false, 20).rotateZ(PI / 2), wrist, hx - s * 0.115, hy, hz); alloy(t, rb(len * 0.95, 0.018, 0.084, 0.008), 'hand_' + b, cx, hy + 0.03, hz); }        // gauntlet
        if (t >= 5) { glow(5, tube(0.066, 0.066, 0.012, false, 20).rotateZ(PI / 2), wrist, hx - s * 0.185, hy, hz); glow(5, rb(0.13, 0.008, 0.01, 0.003), wrist, hx - s * 0.11, hy + 0.066, hz); }       // elite: glowing ring and line
      });
    };

    if (T.helmet) helmet(T.helmet); if (T.vest) vest(T.vest); if (T.pack) pack(T.pack); if (T.boots) boots(T.boots); if (T.gloves) gloves(T.gloves);
  };
})();
