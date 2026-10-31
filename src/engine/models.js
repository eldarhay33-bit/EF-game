// Procedural gun, sight and grenade models. Parts are merged per material so each gun costs only a few draw calls.
const RARITY = [
  { name: '',    color: 0xb4b8bc, mult: 1.0,  mag: 1.0,  reload: 1.0,  recoil: 1.0,  w: 46 },
  { name: '', color: 0x5fd14a, mult: 1.06, mag: 1.08, reload: 0.96, recoil: 0.95, w: 28 },
  { name: '',    color: 0x3aa0ff, mult: 1.12, mag: 1.15, reload: 0.92, recoil: 0.9,  w: 15 },
  { name: '',     color: 0xb25cff, mult: 1.18, mag: 1.25, reload: 0.88, recoil: 0.85, w: 8 },
  { name: '',    color: 0xffb833, mult: 1.26, mag: 1.4,  reload: 0.82, recoil: 0.78, w: 3 },
  { name: '',  color: 0x35f0ff, mult: 1.0,  mag: 1.0,  reload: 1.0,  recoil: 1.0,  w: 0 },
  { name: '',  color: 0xffd24a, mult: 1.0,  mag: 1.0,  reload: 1.0,  recoil: 1.0,  w: 0 }
];

const SIGHTS = {
  iron:    { name: '',  zoom: 1.2,  scope: false, reticle: false },
  reddot:  { name: '', zoom: 1.35, scope: false, reticle: 'dot' },
  holo:    { name: '',   zoom: 1.5,  scope: false, reticle: 'holo' },
  x2:      { name: '',   zoom: 2.0,  scope: false, reticle: 'cross' },
  x4:      { name: '',   zoom: 4.0,  scope: true,  reticle: 'cross' },
  x6:      { name: '',   zoom: 6.0,  scope: true,  reticle: 'cross' },
  x8:      { name: '',   zoom: 8.0,  scope: true,  reticle: 'mil' },
  x12:     { name: '',  zoom: 12.0, scope: true,  reticle: 'mil' },
  thermal: { name: '',       zoom: 5.0,  scope: true,  reticle: 'cross', thermal: true }
};

const GM = {
  // Modelled guns (Quaternius Ultimate Gun Pack, CC0, assets/models/guns/*.glb) replace the procedural bodies when they have loaded; sights, muzzle flash and ejection still come from the tables below.
  // The files keep the pack's axes (barrel towards +X, up +Y); prepGlb() turns and scales each one to fit the size of the procedural gun it replaces.
  glb: {}, glbBoost: 2.2,
  glbCfg: {
    pistol: { f: 'Pistol_1' }, revolver: { f: 'Revolver_3' }, smg: { f: 'SubmachineGun_1' }, ar: { f: 'AssaultRifle2_1' }, ak: { f: 'AssaultRifle_2' },
    dmr: { f: 'SniperRifle_5', scoped: true }, shotgun: { f: 'Shotgun_2' }, autoshotgun: { f: 'Bullpup_2' }, sniper: { f: 'SniperRifle_1', scoped: true }
  },
  mats: {}, cache: {},
  mat(key, accent) {
    const tint = (key === 'poly' || key === 'metal') && accent !== undefined && accent !== RARITY[0].color;
    const k = key + (key === 'accent' || tint ? accent : '');
    if (this.mats[k]) return this.mats[k];
    const o = {
      metal:  { color: 0x2b2e31, metalness: 0.9, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25 },
      steel:  { color: 0x9aa0a6, metalness: 0.95, roughness: 0.2, clearcoat: 0.3, clearcoatRoughness: 0.2 },
      poly:   { color: 0x1e2022, metalness: 0.15, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.35 },
      wood:   { color: 0x6a4527, metalness: 0.0, roughness: 0.55 },
      olive:  { color: 0x4a5236, metalness: 0.3, roughness: 0.6 },
      brass:  { color: 0xc9a24a, metalness: 0.85, roughness: 0.3 },
      white:  { color: 0xd9dce0, metalness: 0.2, roughness: 0.35 },
      red:    { color: 0xa02a22, metalness: 0.3, roughness: 0.5 },
      glass:  { color: 0x78a8ff, metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.45 },
      dot:    { color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 3 },
      cyan:   { color: 0x35f0ff, emissive: 0x35f0ff, emissiveIntensity: 2.4 },
      accent: { color: accent, emissive: accent, emissiveIntensity: 1.4 }
    }[key];
    if (tint) { const c = new THREE.Color(o.color).lerp(new THREE.Color(accent), key === 'poly' ? 0.42 : 0.22); o.color = c.getHex(); if (key === 'poly') { o.emissive = accent; o.emissiveIntensity = 0.12; } }
    const m = new THREE.MeshPhysicalMaterial(Object.assign({ envMapIntensity: 1.2 }, o));
    return (this.mats[k] = m);
  },

  // a box with rounded edges (radius r): the vertices of a subdivided box are pushed out of the inner box by r
  roundBox(w, h, d, r) {
    const g = new THREE.BoxGeometry(w, h, d, 4, 4, 4), pa = g.attributes.position, na = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3(), hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i); c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz)); v.sub(c);
      if (v.lengthSq() > 1e-12) { v.normalize(); na.setXYZ(i, v.x, v.y, v.z); pa.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r); }
    }
    return g;
  },

  // parts: ['b',w,h,d,x,y,z,mat,rx,ry,rz] | ['c',rTop,rBottom,len(z),x,y,z,mat,rx,ry,rz] | ['s',r,x,y,z,mat]
  //        ['r',w,h,d,radius,x,y,z,mat,rx,ry,rz] rounded box | ['l',[[radius, z], ...],x,y,z,mat,rx,ry,rz,segments] lathe around the z axis (a polyline that goes out and back makes a thin shell) | ['t',R,r,x,y,z,mat,rx,ry,rz] ring around z
  // (in a cylinder the top radius is at +z, the rear of a gun; the muzzle is at -z)
  assemble(parts, accent) {
    const buckets = {}, grp = new THREE.Group(), q = new THREE.Quaternion(), m = new THREE.Matrix4();
    for (const p of parts) {
      let geo, x, y, z, mk, rx = 0, ry = 0, rz = 0;
      if (p[0] === 'b') { geo = new THREE.BoxGeometry(p[1], p[2], p[3]); [x, y, z, mk, rx = 0, ry = 0, rz = 0] = p.slice(4); }
      else if (p[0] === 'c') { geo = new THREE.CylinderGeometry(p[1], p[2], p[3], 16).rotateX(Math.PI / 2); [x, y, z, mk, rx = 0, ry = 0, rz = 0] = p.slice(4); }
      else if (p[0] === 'r') { geo = this.roundBox(p[1], p[2], p[3], p[4]); [x, y, z, mk, rx = 0, ry = 0, rz = 0] = p.slice(5); }
      else if (p[0] === 'l') { let seg = 24; [x, y, z, mk, rx = 0, ry = 0, rz = 0, seg = 24] = p.slice(2); geo = new THREE.LatheGeometry(p[1].map(a => new THREE.Vector2(a[0], a[1])), seg).rotateX(Math.PI / 2); }
      else if (p[0] === 't') { geo = new THREE.TorusGeometry(p[1], p[2], 8, 28); [x, y, z, mk, rx = 0, ry = 0, rz = 0] = p.slice(3); }
      else { geo = new THREE.SphereGeometry(p[1], 12, 9); [x, y, z, mk] = p.slice(2); }
      m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
      geo.applyMatrix4(m); geo.deleteAttribute('uv');
      (buckets[mk] || (buckets[mk] = [])).push(geo);
    }
    for (const k in buckets) {
      const mesh = new THREE.Mesh(FX.mergeGeometries(buckets[k], false), this.mat(k, accent));
      mesh.castShadow = false; grp.add(mesh);
    }
    return grp;
  },

  // ---------- weapon part tables ----------
  specs: {
    pistol: { railY: 0.066, sightZ: [-0.02, -0.2], muzzle: -0.235, eject: -0.06, parts: [
      ['b', .032, .04, .21, 0, .045, -.105, 'metal'], ['b', .028, .035, .17, 0, .01, -.085, 'poly'], ['b', .03, .1, .055, 0, -.05, 0, 'poly', .22],
      ['b', .012, .004, .05, 0, -.02, -.05, 'poly'], ['c', .008, .008, .03, 0, .045, -.22, 'steel'], ['b', .034, .006, .04, 0, .02, -.1, 'accent']] },
    revolver: { railY: 0.09, sightZ: [-0.02, -0.3], muzzle: -0.34, eject: -0.06, parts: [
      ['c', .036, .036, .06, 0, .03, -.05, 'steel'], ['b', .034, .07, .1, 0, .02, -.02, 'metal'], ['c', .012, .013, .24, 0, .045, -.2, 'steel'],
      ['b', .014, .016, .24, 0, .066, -.2, 'metal'], ['b', .03, .11, .05, 0, -.055, .035, 'wood', .3], ['b', .01, .02, .02, 0, .078, .02, 'steel'], ['b', .036, .008, .05, 0, .04, -.03, 'accent']] },
    smg: { railY: 0.062, sightZ: [-0.1, -0.5], muzzle: -0.56, eject: -0.12, parts: [
      ['b', .05, .1, .3, 0, 0, -.15, 'poly'], ['b', .028, .012, .28, 0, .056, -.15, 'steel'], ['c', .018, .018, .2, 0, .02, -.4, 'metal'], ['c', .012, .012, .06, 0, .02, -.53, 'steel'],
      ['b', .032, .18, .045, 0, -.13, -.12, 'metal'], ['b', .03, .085, .04, 0, -.085, -.01, 'poly', .25], ['b', .025, .08, .03, 0, -.06, -.33, 'poly'],
      ['b', .012, .012, .15, .016, .01, .12, 'metal'], ['b', .012, .012, .15, -.016, .01, .12, 'metal'], ['b', .04, .07, .02, 0, .01, .2, 'poly'], ['b', .052, .012, .07, 0, -.01, -.2, 'accent']] },
    ar: { railY: 0.081, sightZ: [-0.12, -0.62], muzzle: -0.745, eject: -0.12, parts: [
      ['b', .045, .07, .2, 0, -.01, -.12, 'metal'], ['b', .048, .055, .26, 0, .04, -.15, 'metal'], ['b', .055, .058, .27, 0, .035, -.43, 'poly'], ['b', .028, .012, .5, 0, .075, -.3, 'steel'],
      ['c', .011, .011, .14, 0, .035, -.64, 'steel'], ['c', .015, .015, .05, 0, .035, -.72, 'metal'], ['b', .03, .15, .06, 0, -.115, -.15, 'poly', .08], ['b', .03, .09, .045, 0, -.08, -.03, 'poly', .3],
      ['b', .04, .07, .15, 0, 0, .1, 'poly'], ['c', .018, .018, .18, 0, .03, .1, 'metal'], ['b', .052, .01, .06, 0, -.04, -.22, 'accent'], ['b', .025, .07, .03, 0, -.05, -.36, 'poly']] },
    ak: { railY: 0.09, sightZ: [-0.1, -0.68], muzzle: -0.75, eject: -0.12, parts: [
      ['b', .048, .075, .3, 0, .01, -.15, 'metal'], ['b', .05, .02, .28, 0, .055, -.15, 'metal'], ['b', .055, .06, .24, 0, .01, -.42, 'wood'], ['b', .05, .03, .18, 0, .055, -.44, 'wood'],
      ['c', .012, .012, .28, 0, .068, -.46, 'steel'], ['c', .012, .012, .18, 0, .025, -.64, 'steel'], ['c', .016, .016, .03, 0, .025, -.74, 'metal'], ['b', .012, .035, .02, 0, .085, -.68, 'metal'],
      ['b', .032, .14, .06, 0, -.12, -.2, 'metal', .25], ['b', .032, .06, .055, 0, -.2, -.16, 'metal', .35], ['b', .03, .09, .045, 0, -.085, -.01, 'wood', .25], ['b', .035, .08, .2, 0, -.005, .12, 'wood'],
      ['b', .052, .01, .05, 0, -.01, -.27, 'accent'], ['b', .028, .01, .14, 0, .068, -.12, 'steel']] },
    dmr: { railY: 0.085, sightZ: [-0.12, -0.9], muzzle: -1.02, eject: -0.12, parts: [
      ['b', .046, .075, .24, 0, -.005, -.12, 'metal'], ['b', .048, .055, .3, 0, .04, -.15, 'metal'], ['b', .055, .058, .4, 0, .03, -.5, 'poly'], ['b', .028, .012, .64, 0, .078, -.36, 'steel'],
      ['c', .012, .012, .2, 0, .03, -.82, 'steel'], ['c', .02, .02, .06, 0, .03, -.97, 'metal'], ['b', .03, .12, .06, 0, -.1, -.14, 'poly', .06], ['b', .03, .09, .045, 0, -.08, -.03, 'poly', .3],
      ['b', .042, .09, .24, 0, .005, .13, 'poly'], ['b', .04, .03, .12, 0, .06, .14, 'poly'], ['b', .052, .01, .06, 0, -.04, -.22, 'accent'], ['b', .008, .16, .008, .03, -.07, -.72, 'steel', .3], ['b', .008, .16, .008, -.03, -.07, -.72, 'steel', .3]] },
    shotgun: { railY: 0.06, sightZ: [-0.1, -0.9], muzzle: -0.92, eject: -0.1, parts: [
      ['b', .05, .07, .24, 0, 0, -.1, 'metal'], ['c', .016, .016, .7, 0, .025, -.55, 'steel'], ['c', .015, .015, .55, 0, -.02, -.5, 'steel'], ['b', .045, .045, .17, 0, -.025, -.45, 'wood'],
      ['b', .04, .09, .3, 0, -.01, .15, 'wood', .12], ['b', .006, .012, .006, 0, .05, -.9, 'steel'], ['b', .052, .01, .06, 0, 0, -.07, 'accent'], ['b', .02, .008, .2, 0, .047, -.1, 'steel'], ['b', .03, .08, .04, 0, -.06, .0, 'wood', .3]] },
    autoshotgun: { railY: 0.075, sightZ: [-0.12, -0.6], muzzle: -0.72, eject: -0.12, parts: [
      ['b', .06, .09, .32, 0, 0, -.14, 'poly'], ['c', .02, .02, .42, 0, .03, -.5, 'steel'], ['c', .024, .024, .08, 0, .03, -.7, 'metal'], ['b', .05, .16, .1, 0, -.13, -.15, 'metal'],
      ['b', .03, .08, .035, 0, -.07, -.34, 'poly'], ['b', .04, .08, .22, 0, .01, .14, 'poly'], ['b', .062, .01, .06, 0, -.02, -.2, 'accent'], ['b', .03, .012, .3, 0, .052, -.2, 'steel'], ['b', .03, .08, .04, 0, -.07, -.0, 'poly', .3]] },
    // six barrels turning on a rotor (the 'spin' group, see _build), a gear housing behind them, spade grips with the trigger bar, a carry handle, the ammunition box and its belt of brass links
    minigun: { railY: 0.0, sightZ: [0, 0], muzzle: -1.0, eject: -0.05, parts: [
      ['r', .15, .15, .3, .035, 0, 0, .02, 'metal'], ['c', .06, .066, .12, 0, 0, .23, 'steel'], ['c', .04, .04, .06, 0, 0, .3, 'metal'],
      ['c', .082, .082, .14, 0, 0, -.2, 'metal'], ['t', .082, .006, 0, 0, -.27, 'steel'], ['t', .084, .005, 0, 0, -.13, 'steel'],
      ['r', .03, .02, .26, .008, 0, .17, -.05, 'poly'], ['r', .02, .075, .025, .006, 0, .13, -.15, 'metal'], ['r', .02, .075, .025, .006, 0, .13, .04, 'metal'],
      ['c', .014, .014, .13, .115, .01, .17, 'poly', Math.PI / 2], ['c', .014, .014, .13, -.115, .01, .17, 'poly', Math.PI / 2], ['b', .27, .016, .018, 0, .075, .17, 'metal'], ['b', .012, .026, .02, 0, .05, .14, 'steel'],
      ['r', .1, .2, .22, .02, .15, -.1, -.02, 'olive'], ['b', .102, .012, .222, .15, 0, -.02, 'metal'], ['b', .01, .05, .1, .205, -.1, -.02, 'metal'], ['b', .012, .06, .016, .1, -.1, .09, 'metal'],
      ['b', .028, .014, .024, .125, .02, -.04, 'brass', 0, 0, .3], ['b', .028, .014, .024, .1, .035, -.05, 'brass', 0, 0, .6], ['b', .028, .014, .024, .076, .042, -.06, 'brass', 0, 0, .9], ['b', .028, .014, .024, .052, .046, -.07, 'brass'], ['b', .028, .014, .024, .03, .046, -.08, 'brass'],
      ['c', .02, .02, .1, .07, .03, -.04, 'metal', 0, 0, Math.PI / 2], ['b', .05, .008, .1, 0, .077, -.05, 'accent'], ['b', .05, .02, .01, 0, .07, -.2, 'steel']],
      spin: [
        ['c', .0155, .0155, .74, .05, 0, 0, 'steel'], ['c', .0155, .0155, .74, .025, .0433, 0, 'steel'], ['c', .0155, .0155, .74, -.025, .0433, 0, 'steel'],
        ['c', .0155, .0155, .74, -.05, 0, 0, 'steel'], ['c', .0155, .0155, .74, -.025, -.0433, 0, 'steel'], ['c', .0155, .0155, .74, .025, -.0433, 0, 'steel'],
        ['c', .03, .03, .74, 0, 0, 0, 'metal'], ['c', .07, .07, .03, 0, 0, .3, 'metal'], ['c', .068, .068, .025, 0, 0, 0, 'metal'], ['c', .066, .066, .03, 0, 0, -.33, 'steel'],
        ['t', .066, .006, 0, 0, -.345, 'steel'], ['b', .012, .012, .014, .052, .0, -.35, 'accent']] },
    sniper: { railY: 0.06, sightZ: [-0.14, -0.9], muzzle: -1.15, eject: -0.1, parts: [
      ['b', .05, .07, .28, 0, 0, -.14, 'metal'], ['c', .016, .016, .8, 0, .02, -.72, 'steel'], ['c', .024, .024, .07, 0, .02, -1.12, 'metal'], ['b', .045, .1, .4, 0, -.01, .16, 'poly', .1],
      ['b', .04, .03, .14, 0, .06, .18, 'poly'], ['b', .05, .05, .3, 0, -.01, -.45, 'poly'], ['b', .03, .012, .012, .04, .02, -.1, 'steel'], ['s', .011, .06, .02, -.1, 'steel'],
      ['b', .03, .07, .09, 0, -.07, -.17, 'metal'], ['b', .028, .012, .3, 0, .05, -.15, 'steel'], ['b', .052, .01, .06, 0, 0, -.28, 'accent'], ['b', .008, .2, .008, .03, -.08, -.7, 'steel', .35], ['b', .008, .2, .008, -.03, -.08, -.7, 'steel', .35]] },
    // a sleek energy rifle: white shell with cyan light strips, a ringed barrel ending in an emitter, a glowing cell in the magazine well
    special: { railY: 0.07, sightZ: [-0.1, -0.7], muzzle: -1.36, eject: -0.1, parts: [
      ['r', .078, .1, .46, .024, 0, 0, -.17, 'white'], ['r', .058, .13, .3, .026, 0, -.015, .2, 'white'], ['b', .004, .014, .24, .0305, .03, .2, 'cyan'], ['b', .004, .014, .24, -.0305, .03, .2, 'cyan'], ['b', .004, .014, .16, .0305, -.04, .22, 'cyan'], ['b', .004, .014, .16, -.0305, -.04, .22, 'cyan'],
      ['r', .07, .07, .56, .022, 0, .006, -.66, 'white'], ['b', .004, .016, .46, .037, .012, -.66, 'cyan'], ['b', .004, .016, .46, -.037, .012, -.66, 'cyan'],
      ['b', .004, .05, .1, .04, .0, -.1, 'cyan'], ['b', .004, .05, .1, -.04, .0, -.1, 'cyan'],
      ['c', .017, .017, .4, 0, .012, -1.1, 'steel'], ['t', .028, .006, 0, .012, -.99, 'steel'], ['t', .028, .006, 0, .012, -1.1, 'steel'], ['t', .032, .005, 0, .012, -1.3, 'cyan'],
      ['l', [[.016, -1.25], [.03, -1.3], [.034, -1.34], [.02, -1.36], [.014, -1.33], [.012, -1.27]], 0, .012, 0, 'cyan'],
      ['r', .052, .15, .075, .018, 0, -.125, -.05, 'poly'], ['b', .054, .09, .02, 0, -.125, -.09, 'cyan'], ['r', .036, .11, .05, .014, 0, -.105, .09, 'poly', .3],
      ['b', .03, .012, .5, 0, .058, -.22, 'steel'], ['b', .072, .01, .08, 0, .0, -.1, 'accent'], ['t', .03, .003, 0, .1, -.5, 'cyan'], ['t', .022, .0025, 0, .1, -.5, 'cyan'],
      ['b', .02, .01, .12, 0, .066, -.6, 'steel'], ['b', .046, .016, .1, 0, .052, .28, 'steel']] },
    // an RPG-7 pattern launcher: the tube with its flared rear, a wooden heat shield, the loaded rocket (black nose cap, olive ogive, a ring in the rarity colour), pistol grip with trigger guard,
    // fore grip, the side optic and the top rail
    rpg: { railY: 0.06, sightZ: [-0.3, -0.4], muzzle: -1.2, eject: -0.05, parts: [
      ['c', .047, .047, 1.0, 0, 0, -.38, 'olive'], ['t', .049, .008, 0, 0, -.88, 'steel'],
      ['l', [[.047, .12], [.056, .17], [.082, .26], [.09, .28], [.083, .28], [.052, .2], [.038, .13]], 0, 0, 0, 'steel'],
      ['c', .057, .057, .32, 0, 0, -.2, 'wood'], ['t', .058, .004, 0, 0, -.05, 'steel'], ['t', .058, .004, 0, 0, -.35, 'steel'],
      ['l', [[.003, -1.255], [.014, -1.245], [.024, -1.22], [.031, -1.2], [.02, -1.2], [.01, -1.22]], 0, 0, 0, 'poly'],
      ['l', [[.031, -1.2], [.046, -1.14], [.058, -1.06], [.063, -.98], [.061, -.92], [.05, -.9], [.034, -.89], [.03, -.84]], 0, 0, 0, 'olive'], ['t', .062, .005, 0, 0, -.955, 'accent'],
      ['r', .036, .125, .056, .012, 0, -.12, -.2, 'poly', .22], ['b', .006, .005, .07, 0, -.075, -.245, 'metal'], ['b', .006, .04, .005, 0, -.055, -.28, 'metal'], ['b', .008, .03, .01, 0, -.09, -.22, 'steel'],
      ['r', .034, .11, .046, .012, 0, -.11, -.52, 'poly'], ['b', .03, .03, .05, -.05, .045, -.3, 'metal'], ['c', .019, .019, .16, -.06, .07, -.3, 'metal'], ['c', .022, .022, .03, -.06, .07, -.215, 'poly'],
      ['c', .017, .017, .006, -.06, .07, -.385, 'glass'], ['b', .02, .01, .16, 0, .052, -.3, 'steel'], ['b', .014, .02, .03, .05, 0, -.15, 'steel']] }
  },

  sightParts(key, railY, z) {
    const y = railY;
    switch (key) {
      case 'reddot': return { parts: [['b', .032, .036, .06, 0, y + .022, z, 'poly'], ['b', .026, .028, .004, 0, y + .03, z - .031, 'glass'], ['s', .0035, 0, y + .03, z - .012, 'dot'], ['b', .034, .006, .07, 0, y + .004, z, 'metal']], aim: y + .03, rear: z + .03 };
      case 'holo': return { parts: [['b', .034, .008, .07, 0, y + .004, z, 'metal'], ['b', .004, .04, .03, .018, y + .026, z, 'poly'], ['b', .004, .04, .03, -.018, y + .026, z, 'poly'], ['b', .04, .006, .03, 0, y + .046, z, 'poly'], ['b', .032, .03, .002, 0, y + .03, z - .006, 'glass'], ['s', .003, 0, y + .03, z - .004, 'dot']], aim: y + .03, rear: z + .02 };
      case 'x2': return { parts: [['c', .017, .017, .11, 0, y + .035, z, 'metal'], ['c', .022, .022, .03, 0, y + .035, z - .07, 'poly'], ['c', .019, .019, .008, 0, y + .035, z - .086, 'glass'], ['b', .02, .02, .03, 0, y + .01, z + .02, 'metal'], ['b', .02, .02, .03, 0, y + .01, z - .04, 'metal']], aim: y + .035, rear: z + .06 };
      case 'x4': return { parts: [['b', .036, .04, .14, 0, y + .03, z, 'metal'], ['c', .02, .02, .02, 0, y + .032, z - .08, 'poly'], ['c', .017, .017, .006, 0, y + .032, z - .092, 'glass'], ['b', .02, .01, .1, 0, y + .006, z, 'metal']], aim: y + .035, rear: z + .075 };
      case 'x6': case 'x8': return { parts: [['c', .02, .02, .26, 0, y + .045, z, 'metal'], ['c', .031, .031, .07, 0, y + .045, z - .15, 'poly'], ['c', .027, .027, .008, 0, y + .045, z - .19, 'glass'], ['c', .022, .022, .04, 0, y + .045, z + .14, 'poly'], ['b', .024, .03, .03, 0, y + .02, z + .05, 'metal'], ['b', .024, .03, .03, 0, y + .02, z - .06, 'metal'], ['c', .008, .008, .02, 0, y + .075, z, 'steel', 0, 0, Math.PI / 2]], aim: y + .045, rear: z + .16 };
      case 'x12': return { parts: [['c', .022, .022, .36, 0, y + .047, z, 'metal'], ['c', .034, .034, .09, 0, y + .047, z - .2, 'poly'], ['c', .03, .03, .008, 0, y + .047, z - .25, 'glass'], ['c', .024, .024, .05, 0, y + .047, z + .19, 'poly'], ['b', .024, .03, .03, 0, y + .02, z + .08, 'metal'], ['b', .024, .03, .03, 0, y + .02, z - .1, 'metal']], aim: y + .047, rear: z + .22 };
      case 'thermal': return { parts: [['b', .05, .06, .17, 0, y + .04, z, 'poly'], ['b', .04, .04, .004, 0, y + .042, z - .087, 'cyan'], ['c', .01, .01, .03, .035, y + .045, z, 'steel', 0, 0, Math.PI / 2], ['b', .028, .01, .1, 0, y + .006, z, 'metal']], aim: y + .042, rear: z + .09 };
      default: {      // iron sights built into the rail
        const rz = z, fz = z - 0.0;
        return { parts: [['b', .006, .024, .008, .011, y + .012, z, 'metal'], ['b', .006, .024, .008, -.011, y + .012, z, 'metal']], aim: y + .02, rear: z + .004, iron: true };
      }
    }
  },

  build(id, rarity, sight) {
    const key = `${id}|${rarity}|${sight}`;
    if (!this.cache[key]) this.cache[key] = this._build(id, rarity, sight);
    const g = this.cache[key].clone(true), t = this.cache[key].userData;
    g.userData = Object.assign({}, t);
    g.userData.muzzle = g.getObjectByName('muzzle'); g.userData.flash = g.getObjectByName('flash'); g.userData.eject = g.getObjectByName('eject'); g.userData.spin = g.getObjectByName('spin');
    return g;
  },

  _build(id, rarity, sight) {
    if (this.glb[id]) return this._buildGlb(id, rarity, sight);
    const sp = this.specs[id], accent = RARITY[rarity].color, parts = sp.parts.slice();
    let aim = sp.railY + 0.02, rear = 0;
    if (id !== 'minigun') {
      const sz = sight === 'iron' || !sight ? sp.sightZ[0] : (id === 'sniper' || id === 'dmr' ? -0.24 : id === 'pistol' || id === 'revolver' ? sp.sightZ[0] : -0.2);
      const s = this.sightParts(sight || 'iron', sp.railY, sz);
      parts.push(...s.parts); aim = s.aim; rear = s.rear;
      if (!s.iron) parts.push(['b', .004, .014, .004, 0, sp.railY + .007, sp.sightZ[1], 'metal']);   // folded front post
      else parts.push(['b', .006, .03, .006, 0, sp.railY + .014, sp.sightZ[1], 'metal']);
    }
    const g = this.assemble(parts, accent);
    if (id === 'minigun') {
      const spin = new THREE.Group(); spin.name = 'spin'; spin.position.z = -0.55;          // the rotor: six barrels, three clamps, the hub (parts of sp.spin, relative to the group)
      spin.add(this.assemble(sp.spin, accent)); g.add(spin);
    }
    const mz = new THREE.Object3D(); mz.name = 'muzzle'; mz.position.set(0, sp.railY * 0.45, sp.muzzle); g.add(mz);
    const ej = new THREE.Object3D(); ej.name = 'eject'; ej.position.set(0.03, sp.railY * 0.5, sp.eject); g.add(ej);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.t.flash, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    flash.name = 'flash'; flash.position.copy(mz.position); flash.position.z -= 0.04; flash.scale.setScalar(id === 'sniper' || id === 'rpg' ? 0.5 : id === 'minigun' ? 0.42 : 0.3); flash.visible = false; g.add(flash);
    g.userData = { aimY: aim, aimZ: rear, muzzleZ: sp.muzzle, sight: sight || 'iron' };
    return g;
  },

  // ---------- modelled guns ----------
  async preload(loader) {
    await Promise.all(Object.keys(this.glbCfg).map(id => loader.loadAsync('assets/models/guns/' + this.glbCfg[id].f + '.glb?v=' + (window.ASSET_VER || 0)).then(g => { try { this.glb[id] = this.prepGlb(id, g.scene); } catch (e) { console.warn('[guns] could not prepare', id, e); } }, e => console.warn('[guns] could not load', id, e && e.message))));
  },

  // measure the model once: length, muzzle height and the height of its top rail, then work out the turn / scale / offset that fits it to the procedural gun of the same id
  prepGlb(id, scene) {
    const sp = this.specs[id]; scene.updateMatrixWorld(true);
    const v = new THREE.Vector3(), P = []; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = -1e9;
    scene.traverse(o => { if (!o.isMesh) return; const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); P.push(v.x, v.y, v.z); if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z; if (v.y > y1) y1 = v.y; } });
    const L = x1 - x0, front = []; let rail = -1e9;
    for (let i = 0; i < P.length; i += 3) { if (P[i] > x1 - 0.1 * L) front.push(P[i + 1]); else if (P[i] > x0 + 0.3 * L && P[i] < x0 + 0.62 * L && P[i + 1] > rail) rail = P[i + 1]; }
    front.sort((a, b) => a - b); const yMuz = front[front.length >> 1];
    let zf = 1e9, zr = -1e9;
    for (const p of sp.parts) { const z = p[0] === 's' ? p[4] : p[6], d = p[0] === 'b' ? p[3] : p[0] === 'c' ? p[3] : p[1] * 2; if (z - d / 2 < zf) zf = z - d / 2; if (z + d / 2 > zr) zr = z + d / 2; }
    const s = (zr - zf) / L, yM = sp.railY * 0.45;
    return { scene, s, tx: -s * (z0 + z1) / 2, ty: yM - s * yMuz, tz: zf + s * x1, zf, yM, railY: s * rail + (yM - s * yMuz), scoped: !!this.glbCfg[id].scoped };
  },

  _buildGlb(id, rarity, sight) {
    const sp = this.specs[id], t = this.glb[id], accent = RARITY[rarity].color, g = new THREE.Group();
    const fit = new THREE.Group(), turn = new THREE.Group(); turn.rotation.y = Math.PI / 2; turn.add(t.scene.clone(true)); fit.add(turn);
    fit.scale.setScalar(t.s); fit.position.set(t.tx, t.ty, t.tz); g.add(fit);
    const mats = new Map();          // metals would reflect the blue sky: they stay dark and only half metallic
    fit.traverse(o => {
      if (!o.isMesh) return; o.castShadow = false;
      o.material = [].concat(o.material).map(m => { if (!mats.has(m)) { const c = m.clone(); c.envMapIntensity = 0.5; if (c.metalness > 0.3) { c.metalness = 0.25; c.roughness = 0.55; c.color.multiplyScalar(1.5); } else c.color.multiplyScalar(this.glbBoost); if (rarity > 0 && /black|main|grey|green/i.test(m.name)) { c.emissive = new THREE.Color(accent); c.emissiveIntensity = 0.1; } mats.set(m, c); } return mats.get(m); })[0];
    });
    let aim = t.railY + 0.012, rear = sp.sightZ[0];
    if (!t.scoped && sight && sight !== 'iron') {                                  // optics sit on the model's own top rail
      const sz = id === 'pistol' || id === 'revolver' ? sp.sightZ[0] : -0.2, s = this.sightParts(sight, t.railY, sz); aim = s.aim; rear = s.rear;
      const o = this.assemble(s.parts, accent); g.add(o);
    }
    const mz = new THREE.Object3D(); mz.name = 'muzzle'; mz.position.set(0, t.yM, t.zf); g.add(mz);
    const ej = new THREE.Object3D(); ej.name = 'eject'; ej.position.set(0.03, t.yM + 0.02, sp.eject); g.add(ej);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.t.flash, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    flash.name = 'flash'; flash.position.copy(mz.position); flash.position.z -= 0.04; flash.scale.setScalar(id === 'sniper' ? 0.5 : 0.3); flash.visible = false; g.add(flash);
    g.userData = { aimY: aim, aimZ: rear, muzzleZ: t.zf, sight: sight || 'iron' };
    return g;
  },

  // ---------- throwables ----------
  // built once per kind, every throw gets a clone that shares the geometry and the materials (nothing to build or free per grenade)
  grenade(kind) { const c = this._gc || (this._gc = {}); return (c[kind] || (c[kind] = this.makeGrenade(kind))).clone(); },
  rocket() { return (this._rc || (this._rc = this.makeRocket())).clone(); },

  makeGrenade(kind) {
    const g = new THREE.Group();
    if (kind === 'smoke') {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 10), this.mat('steel')));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.03, 10), this.mat('white')); cap.position.y = 0.04; g.add(cap);
    } else if (kind === 'sticky') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.08), this.mat('olive')); g.add(b);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), this.mat('dot')); led.position.set(0.03, 0.03, 0); g.add(led);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.06), this.mat('poly')); pad.position.y = -0.03; g.add(pad);
    } else if (kind === 'flash') {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 10), this.mat('white')));
    } else {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), this.mat('olive')); body.scale.y = 1.2; g.add(body);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.03, 8), this.mat('steel')); top.position.y = 0.055; g.add(top);
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.07, 0.012), this.mat('steel')); lever.position.set(0.03, 0.03, 0); g.add(lever);
    }
    return g;
  },

  makeRocket() {
    const g = this.assemble([
      ['c', .05, .05, .55, 0, 0, 0, 'olive'], ['c', .002, .05, .18, 0, 0, -.36, 'red'], ['c', .06, .06, .02, 0, 0, .28, 'steel'],
      ['b', .02, .09, .06, 0, .05, .24, 'poly'], ['b', .09, .02, .06, .05, 0, .24, 'poly'], ['b', .09, .02, .06, -.05, 0, .24, 'poly']], 0xffb833);
    return g;
  }
};
