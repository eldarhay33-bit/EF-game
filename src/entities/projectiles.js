// Grenades (frag / smoke / flash), RPG rockets and explosion damage.
const _po = new THREE.Vector3(), _pm = new THREE.Vector3(), _pd = new THREE.Vector3(), _pn = new THREE.Vector3(), _pt = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);       // scratch vectors: nothing is allocated per frame for a flying grenade or rocket
const Explosions = {
  boom(pos, radius, dmg, owner, wid) {
    FX.explosion(pos, radius); Sound.explosion(pos, radius / 7);
    const origin = new THREE.Vector3(pos.x, pos.y + 0.4, pos.z);
    for (const a of Combat.actors()) {
      const ty = a.pos.y + (a.crouch ? 0.7 : 1.0), dx = a.pos.x - pos.x, dy = ty - pos.y, dz = a.pos.z - pos.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > radius) continue;
      let f = Math.pow(1 - d / radius, 1.1);
      if (!hasLineOfSight(origin, new THREE.Vector3(a.pos.x, ty, a.pos.z), true)) f *= 0.12;
      if (f < 0.02) continue;
      const scale = owner && owner.dmgScale && a === G.player ? Math.max(owner.dmgScale * 1.6, 0.5) : 1;
      a.takeDamage(dmg * f * scale, owner, false, wid);
      if (a === G.player && a.knock) a.knock(dx / (d || 1), dz / (d || 1), f * 9);
    }
  },

  flash(pos, radius, owner) {
    FX.glow.spawn(pos.x, pos.y + 0.5, pos.z, 0, 0, 0, 0.3, 2, 9, 1, 1, 1, 1, 0);
    Sound.explosion(pos, 0.3);
    const origin = new THREE.Vector3(pos.x, pos.y + 0.4, pos.z);
    for (const a of Combat.actors()) {
      const eye = new THREE.Vector3(a.pos.x, a.pos.y + 1.5, a.pos.z), d = eye.distanceTo(origin);
      if (d > radius || !hasLineOfSight(origin, eye, true)) continue;
      let f = 1 - d / radius;
      if (a === G.player) {
        const to = origin.clone().sub(eye).normalize(), fw = G.player.forward(), facing = clamp(fw.dot(to) * 0.5 + 0.6, 0.15, 1);
        G.player.flashed = Math.max(G.player.flashed || 0, (1.4 + 3.2 * f) * facing * (1 - ((G.player.fx && G.player.fx.flashDr) || 0)));
      } else a.blind = Math.max(a.blind || 0, 1.5 + 3.5 * f);
    }
  }
};

const Projectiles = {
  list: [],

  reset() { for (const p of this.list) G.scene.remove(p.mesh); this.list.length = 0; },

  // visual: a copy of someone else's throw (network); it explodes for show only, the thrower's own client applies the damage
  throwGrenade(owner, kind, pos, vel, visual) {
    const mesh = GM.grenade(kind); mesh.position.copy(pos); G.scene.add(mesh);
    const T = THROWABLES[kind];
    if (!visual && owner === G.player) Net.sendThrow(kind, pos, vel, false);
    this.list.push({ type: 'grenade', kind, pos: pos.clone(), vel: vel.clone(), mesh, t: 0, fuse: T.fuse, owner, T, visual, spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), beep: 0 });
    Sound.pin();
  },

  fireRocket(owner, pos, dir, wpn, visual) {
    if (!visual && owner === G.player) Net.sendThrow('rocket', pos, dir, true);
    const mesh = GM.rocket(); mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir); G.scene.add(mesh);
    const st = Weapons.stat(wpn);
    this.list.push({ type: 'rocket', pos: pos.clone(), dir: dir.clone(), speed: 15, mesh, t: 0, owner, dmg: st.dmg, trail: 0, visual });
    Sound.whoosh(pos);
  },

  explode(p) {
    G.scene.remove(p.mesh);
    if (p.visual) { if (p.type === 'rocket') { FX.explosion(p.pos, 7.5); Sound.explosion(p.pos, 1); } else if (p.kind === 'smoke') { FX.smokeCloud(p.pos, 7.5, 24); Sound.hiss(p.pos); } else if (p.kind !== 'flash') { FX.explosion(p.pos, p.T.radius); Sound.explosion(p.pos, p.T.radius / 7); } return; }
    if (p.type === 'rocket') Explosions.boom(p.pos, 7.5, p.dmg * 1.05, p.owner, 'rpg');
    else if (p.kind === 'frag' || p.kind === 'sticky') Explosions.boom(p.pos, p.T.radius, p.T.dmg, p.owner, 'frag');
    else if (p.kind === 'smoke') { FX.smokeCloud(p.pos, 7.5, 24); Sound.hiss(p.pos); }
    else Explosions.flash(p.pos, p.T.radius, p.owner);
  },

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.t += dt;
      if (p.type === 'rocket') {
        p.speed = Math.min(62, p.speed + 120 * dt);
        const step = p.speed * dt, o = _po.copy(p.pos);
        let hitT = step, boom = false;
        const rb = rayBoxes(o, p.dir, step); if (rb.hit) { hitT = rb.dist; boom = true; }
        const rt = rayTerrain(o, p.dir, step); if (rt < hitT - 0.001) { hitT = rt; boom = true; }
        for (const a of Combat.actors()) { if (a === p.owner && p.t < 0.15) continue; const r = Combat.rayActor(o, p.dir, a, hitT); if (r && r.t < hitT) { hitT = r.t; boom = true; } }
        p.pos.addScaledVector(p.dir, hitT);
        p.mesh.position.copy(p.pos);
        p.trail -= dt;
        if (p.trail <= 0) {
          p.trail = 0.012;
          const tail = _pt.copy(p.pos).addScaledVector(p.dir, -0.4);
          FX.smoke.spawn(tail.x, tail.y, tail.z, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 1.5, 0.25, 1.1, 0.75, 0.75, 0.75, 0.5, 0, 0, 0.5);
          FX.glow.spawn(tail.x, tail.y, tail.z, 0, 0, 0, 0.12, 0.45, 0.1, 1, 0.6, 0.2, 0.9, 0);
        }
        if (boom || p.t > 8) { this.list.splice(i, 1); this.explode(p); }
      } else {
        const sticky = p.kind === 'sticky';
        if (p.stuck) {
          if (p.stickTo && p.stickTo.alive) { p.pos.set(p.stickTo.pos.x, p.stickTo.pos.y + 1.0, p.stickTo.pos.z); p.mesh.position.copy(p.pos); }
          if (p.t >= p.fuse) { this.list.splice(i, 1); this.explode(p); }
          continue;
        }
        p.vel.y -= 19 * dt; p.vel.multiplyScalar(1 - 0.12 * dt);
        const o = _po.copy(p.pos), move = _pm.copy(p.vel).multiplyScalar(dt), len = move.length();
        if (len > 1e-5) {
          const dir = _pd.copy(move).normalize(), rb = rayBoxes(o, dir, len + 0.08);
          if (rb.hit && rb.dist < len + 0.06) {
            const n = _pn.set(rb.normal.x, rb.normal.y, rb.normal.z);
            p.pos.copy(o).addScaledVector(dir, Math.max(0, rb.dist - 0.07));
            if (sticky) { p.stuck = true; p.vel.set(0, 0, 0); p.mesh.position.copy(p.pos); p.mesh.quaternion.setFromUnitVectors(_up, n); Sound.bounce(p.pos); continue; }
            p.vel.addScaledVector(n, -(1 + 0.4) * p.vel.dot(n)).multiplyScalar(0.78); Sound.bounce(p.pos);
            if (n.y > 0.5 && Math.abs(p.vel.y) < 1.2) p.vel.y = 0;
          } else {
            p.pos.add(move);
            if (sticky) for (const a of Combat.actors()) { if (a === p.owner && p.t < 0.3) continue; const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z; if (dx * dx + dz * dz < 0.35 && p.pos.y > a.pos.y && p.pos.y < a.pos.y + 1.9) { p.stuck = true; p.vel.set(0, 0, 0); p.stickTo = a; Sound.bounce(p.pos); break; } }
          }
        }
        const gh = terrainHeight(p.pos.x, p.pos.z);
        if (sticky && p.pos.y < gh + 0.06) { p.pos.y = gh + 0.04; p.stuck = true; p.vel.set(0, 0, 0); p.mesh.position.copy(p.pos); p.mesh.quaternion.setFromUnitVectors(_up, terrainNormal(p.pos.x, p.pos.z)); Sound.bounce(p.pos); continue; }
        if (p.pos.y < gh + 0.06) {
          p.pos.y = gh + 0.06;
          const n = terrainNormal(p.pos.x, p.pos.z), vn = p.vel.dot(n);
          if (vn < 0) { p.vel.addScaledVector(n, -(1 + 0.35) * vn); p.vel.x *= 0.7; p.vel.z *= 0.7; if (vn < -2.5) Sound.bounce(p.pos); }
          if (p.vel.length() < 0.6) p.vel.set(0, 0, 0);
        }
        p.mesh.position.copy(p.pos);
        const sp = Math.min(1, p.vel.length() / 4);
        p.mesh.rotation.x += p.spin.x * dt * sp; p.mesh.rotation.y += p.spin.y * dt * sp; p.mesh.rotation.z += p.spin.z * dt * sp;
        if (p.kind === 'smoke' && p.vel.lengthSq() < 0.01 && p.t > p.fuse - 0.2) { /* settle */ }
        if (p.t >= p.fuse) { this.list.splice(i, 1); this.explode(p); }
      }
    }
  }
};
