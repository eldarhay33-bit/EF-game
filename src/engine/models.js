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
  mats: {}, cache: {},
  mat(key, accent) {
    const tint = (key === 'poly' || key === 'metal') && accent !== undefined && accent !== RARITY[0].color;
    const k = key + (key === 'accent' || tint ? accent : '');
    if (this.mats[k]) return this.mats[k];
    const o = {
      metal:  { color: 0x2b2e31, metalness: 0.9, roughness: 0.36 },
      steel:  { color: 0x8b8f93, metalness: 0.95, roughness: 0.28 },
      poly:   { color: 0x1e2022, metalness: 0.15, roughness: 0.68 },
      wood:   { color: 0x6a4527, metalness: 0.0, roughness: 0.55 },
      olive:  { color: 0x4a5236, metalness: 0.3, roughness: 0.6 },
      white:  { color: 0xd9dce0, metalness: 0.2, roughness: 0.35 },
      red:    { color: 0xa02a22, metalness: 0.3, roughness: 0.5 },
      glass:  { color: 0x78a8ff, metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.45 },
      dot:    { color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 3 },
      cyan:   { color: 0x35f0ff, emissive: 0x35f0ff, emissiveIntensity: 2.4 },
      accent: { color: accent, emissive: accent, emissiveIntensity: 1.4 }
    }[key];
    if (tint) { const c = new THREE.Color(o.color).lerp(new THREE.Color(accent), key === 'poly' ? 0.42 : 0.22); o.color = c.getHex(); if (key === 'poly') { o.emissive = accent; o.emissiveIntensity = 0.12; } }
    const m = new THREE.MeshStandardMaterial(Object.assign({ envMapIntensity: 1.1 }, o));
    return (this.mats[k] = m);
  },

  // parts: ['b',w,h,d,x,y,z,mat,rx,ry,rz] | ['c',rTop,rBottom,len(z),x,y,z,mat,rx,ry,rz] | ['s',r,x,y,z,mat]
  assemble(parts, accent) {
    const buckets = {}, grp = new THREE.Group(), q = new THREE.Quaternion(), m = new THREE.Matrix4();
    for (const p of parts) {
      let geo, x, y, z, mk, rx = 0, ry = 0, rz = 0;
      if (p[0] === 'b') { geo = new THREE.BoxGeometry(p[1], p[2], p[3]); [x, y, z, mk, rx = 0, ry = 0, rz = 0] = p.slice(4); }
      else if (p[0] === 'c') { geo = new THREE.CylinderGeometry(p[1], p[2], p[3], 10).rotateX(Math.PI / 2); [x, y, z, mk, rx = 0, ry = 0, rz = 0] = p.slice(4); }
      else { geo = new THREE.SphereGeometry(p[1], 10, 8); [x, y, z, mk] = p.slice(2); }
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
    minigun: { railY: 0.0, sightZ: [0, 0], muzzle: -1.0, eject: -0.05, parts: [
      ['b', .14, .14, .25, 0, 0, 0, 'metal'], ['c', .08, .08, .04, 0, 0, -.5, 'steel'], ['c', .08, .08, .04, 0, 0, -.85, 'steel'], ['c', .075, .075, .03, 0, 0, -.97, 'steel'],
      ['b', .03, .12, .03, 0, .13, -.15, 'metal'], ['b', .03, .03, .18, 0, .19, -.15, 'metal'], ['b', .1, .2, .2, .14, -.1, -.05, 'olive'], ['b', .02, .02, .14, .09, -.02, -.1, 'steel'],
      ['b', .15, .012, .12, 0, .077, -.05, 'accent'], ['b', .04, .1, .04, 0, -.12, -.2, 'poly']] },
    sniper: { railY: 0.06, sightZ: [-0.14, -0.9], muzzle: -1.15, eject: -0.1, parts: [
      ['b', .05, .07, .28, 0, 0, -.14, 'metal'], ['c', .016, .016, .8, 0, .02, -.72, 'steel'], ['c', .024, .024, .07, 0, .02, -1.12, 'metal'], ['b', .045, .1, .4, 0, -.01, .16, 'poly', .1],
      ['b', .04, .03, .14, 0, .06, .18, 'poly'], ['b', .05, .05, .3, 0, -.01, -.45, 'poly'], ['b', .03, .012, .012, .04, .02, -.1, 'steel'], ['s', .011, .06, .02, -.1, 'steel'],
      ['b', .03, .07, .09, 0, -.07, -.17, 'metal'], ['b', .028, .012, .3, 0, .05, -.15, 'steel'], ['b', .052, .01, .06, 0, 0, -.28, 'accent'], ['b', .008, .2, .008, .03, -.08, -.7, 'steel', .35], ['b', .008, .2, .008, -.03, -.08, -.7, 'steel', .35]] },
    special: { railY: 0.07, sightZ: [-0.1, -0.7], muzzle: -1.36, eject: -0.1, parts: [
      ['b', .07, .09, .4, 0, 0, -.2, 'white'], ['b', .02, .02, 1.0, .035, .03, -.7, 'cyan'], ['b', .02, .02, 1.0, -.035, .03, -.7, 'cyan'],
      ['c', .06, .06, .02, 0, .02, -.4, 'steel'], ['c', .06, .06, .02, 0, .02, -.58, 'steel'], ['c', .06, .06, .02, 0, .02, -.76, 'steel'], ['c', .06, .06, .02, 0, .02, -.94, 'steel'],
      ['c', .02, .02, .4, 0, .02, -1.1, 'steel'], ['c', .032, .032, .05, 0, .02, -1.32, 'cyan'], ['b', .05, .12, .3, 0, -.02, .2, 'white'], ['b', .035, .1, .05, 0, -.08, 0, 'poly', .25],
      ['b', .06, .06, .12, 0, -.08, -.25, 'cyan'], ['b', .03, .012, .4, 0, .056, -.25, 'steel'], ['b', .072, .01, .08, 0, .0, -.1, 'accent']] },
    rpg: { railY: 0.06, sightZ: [-0.3, -0.4], muzzle: -1.2, eject: -0.05, parts: [
      ['c', .05, .05, .95, 0, 0, -.5, 'olive'], ['c', .05, .085, .14, 0, 0, .05, 'olive'], ['c', .002, .06, .24, 0, 0, -1.1, 'red'], ['b', .03, .1, .04, 0, -.09, -.3, 'poly'], ['b', .03, .1, .04, 0, -.09, -.58, 'poly'],
      ['b', .02, .06, .03, .045, .07, -.35, 'metal'], ['c', .054, .054, .03, 0, 0, -.7, 'accent'], ['b', .04, .06, .12, 0, -.01, .12, 'poly']] }
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
      const spin = new THREE.Group(); spin.name = 'spin'; spin.position.z = -0.55;
      const geos = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; geos.push(new THREE.CylinderGeometry(0.014, 0.014, 0.8, 8).rotateX(Math.PI / 2).translate(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0)); }
      const mm = new THREE.Mesh(FX.mergeGeometries(geos, false), this.mat('steel')); spin.add(mm); g.add(spin);
    }
    const mz = new THREE.Object3D(); mz.name = 'muzzle'; mz.position.set(0, sp.railY * 0.45, sp.muzzle); g.add(mz);
    const ej = new THREE.Object3D(); ej.name = 'eject'; ej.position.set(0.03, sp.railY * 0.5, sp.eject); g.add(ej);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.t.flash, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    flash.name = 'flash'; flash.position.copy(mz.position); flash.position.z -= 0.04; flash.scale.setScalar(id === 'sniper' || id === 'rpg' ? 0.5 : id === 'minigun' ? 0.42 : 0.3); flash.visible = false; g.add(flash);
    g.userData = { aimY: aim, aimZ: rear, muzzleZ: sp.muzzle, sight: sight || 'iron' };
    return g;
  },

  // ---------- throwables ----------
  grenade(kind) {
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

  rocket() {
    const g = this.assemble([
      ['c', .05, .05, .55, 0, 0, 0, 'olive'], ['c', .002, .05, .18, 0, 0, -.36, 'red'], ['c', .06, .06, .02, 0, 0, .28, 'steel'],
      ['b', .02, .09, .06, 0, .05, .24, 'poly'], ['b', .09, .02, .06, .05, 0, .24, 'poly'], ['b', .09, .02, .06, -.05, 0, .24, 'poly']], 0xffb833);
    return g;
  }
};
