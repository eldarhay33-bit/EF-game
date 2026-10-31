// Game controller: renderer + post-processing, quality scaling, match flow, main loop.
const BOT_COUNT = 19;

// samples: multisampling of the post-processing target (0 = none); fxaa: the cheap edge smoothing pass instead (a GT 1030 at 1080p pays about 8 ms for 4x MSAA on the half-float target and about 1.5 ms for FXAA)
const QUALITY = {
  low:   { pr: 0.8,  shadow: 1024, extent: 55, post: false, grass: 0,    shadows: true, samples: 4, fxaa: false },
  med:   { pr: 1.0,  shadow: 2048, extent: 75, post: false, grass: 0.4,  shadows: true, samples: 4, fxaa: false },
  high:  { pr: 1.35, shadow: 2048, extent: 90, post: true,  grass: 1,    shadows: true, samples: 0, fxaa: true },
  ultra: { pr: 1.75, shadow: 4096, extent: 90, post: true,  grass: 1,    shadows: true, samples: 4, fxaa: false }
};

const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.42 }, grain: { value: 0 }, sat: { value: 1.24 }, contrast: { value: 1.1 }, hurt: { value: 0 }, thermal: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, sunUv: { value: new THREE.Vector2(0.5, 0.5) }, rays: { value: 0 }, sunCol: { value: new THREE.Color(1, 0.9, 0.7) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, vignette, grain, sat, contrast, hurt, thermal, rays; uniform vec2 res, sunUv; uniform vec3 sunCol; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      float ca = 0.0016 * r2 * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv + c * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * ca).b);
      if (rays > 0.01) {
        vec2 dir = (sunUv - vUv) * (1.0 / 14.0); vec2 p = vUv + dir * hash(vUv * res); float acc = 0.0, w = 1.0;
        for (int i = 0; i < 14; i++) { p += dir; vec3 s = texture2D(tDiffuse, p).rgb; float lum = dot(s, vec3(0.2126, 0.7152, 0.0722)); acc += max(lum - 1.1, 0.0) * w; w *= 0.94; }
        col += sunCol * acc * 0.02 * rays * smoothstep(1.4, 0.0, length(vUv - sunUv));
      }
      if (rays > 0.02) {                                   // lens flare: ghosts along the line through the screen centre, soft halo and a thin anamorphic streak, only while the sun disc itself is visible
        float sv = dot(texture2D(tDiffuse, sunUv).rgb, vec3(0.3333));
        float vis = smoothstep(1.4, 7.0, sv) * step(-0.05, sunUv.x) * step(sunUv.x, 1.05) * step(-0.05, sunUv.y) * step(sunUv.y, 1.05);
        vec2 asp = vec2(res.x / res.y, 1.0), toC = vec2(0.5) - sunUv; vec3 fl = vec3(0.0);
        for (int k = 0; k < 4; k++) {
          float t = 0.35 + float(k) * 0.42, sz = 0.03 + 0.018 * float(k); vec2 gp = sunUv + toC * t; float r = length((vUv - gp) * asp);
          fl += (smoothstep(sz, sz * 0.75, r) * 0.05 + exp(-r / (sz * 0.7)) * 0.035) * mix(vec3(1.0, 0.72, 0.4), vec3(0.4, 0.7, 1.0), float(k) / 3.0);
        }
        float rs = length((vUv - sunUv) * asp); fl += sunCol * exp(-rs * 6.0) * 0.2;
        fl += vec3(0.5, 0.65, 1.0) * exp(-abs(vUv.y - sunUv.y) * 70.0) * exp(-abs(vUv.x - sunUv.x) * 2.5) * 0.1;
        col += fl * vis * rays;
      }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat + 0.18 * (1.0 - clamp(max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b)), 0.0, 1.0)));       // vibrance: boosts dull colours more than vivid ones
      col = (col - 0.18) * contrast + 0.18;
      col *= mix(vec3(0.97, 1.0, 1.05), vec3(1.07, 1.02, 0.93), smoothstep(0.15, 0.75, l));                                               // cool shadows, warm highlights
      col *= 1.0 - vignette * r2 * 1.7;
      col += (hash(vUv * res + time) - 0.5) * grain;
      col = mix(col, vec3(col.r * 1.5 + 0.1, col.g * 0.45, col.b * 0.45), hurt);
      if (thermal > 0.5) {
        float h = clamp(l * 1.6, 0.0, 1.0);
        vec3 heat = mix(vec3(0.02, 0.0, 0.18), vec3(0.8, 0.1, 0.5), smoothstep(0.0, 0.4, h));
        heat = mix(heat, vec3(1.0, 0.8, 0.1), smoothstep(0.4, 0.8, h)); heat = mix(heat, vec3(1.0), smoothstep(0.8, 1.0, h));
        col = heat * 0.9;
      }
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`
};

const Game = {
  clock: new THREE.Clock(), endT: null, killer: null, killerWpn: null, lastPos: null, fpsAcc: 0, fpsN: 0, fpsT: 0, adaptT: 0, xray: false, qualityKey: 'high', composer: null, running: false,

  async init() {
    if (typeof Online !== 'undefined' && Online.loadConfig) Online.loadConfig();         // fire and forget: the board tab reads it later
    const canvas = document.getElementById('game'); this.canvas = canvas;
    const loadText = document.getElementById('loadText'), fill = document.getElementById('loadFill');
    const prog = (p, t) => { fill.style.width = p + '%'; if (t) loadText.textContent = t; };
    const tick = () => new Promise(r => setTimeout(r, 16));

    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    G.renderer = r; Tex.aniso = Math.min(8, r.capabilities.getMaxAnisotropy());                 // (16x filtering costs a GT 1030 about 2 ms of a 1080p frame over 8x and the eye hardly tells them apart)
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1800); G.scene.add(G.camera);
    G.player = Player;
    G.vmScene = new THREE.Scene(); G.vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10); G.vmScene.add(G.vmCam);
    G.vmScene.add(new THREE.HemisphereLight(0xeaf2ff, 0x9a8a6a, 1.0));
    this.vmSun = new THREE.DirectionalLight(0xffffff, 2.2); this.vmSun.position.set(2, 4, 3); G.vmScene.add(this.vmSun);

    this.resolveQuality();
    Profile.load();
    I18n.setLang(Settings.get('lang'), true); I18n.bindNames();
    { const lc = document.getElementById('loadCredit'); if (lc) lc.textContent = I18n.t('ui.credit'); }
    prog(5, I18n.t('load.textures')); await tick();
    await Tex.build(n => { prog(5 + Math.random() * 20, I18n.t('load.textures') + ': ' + n); });
    prog(30, I18n.t('load.world')); await tick();
    SkySys.build(G.scene, r); const q = QUALITY[this.qualityKey]; SkySys.setShadows(q.shadow, q.extent);
    await SkySys.loadHdr(Settings.get('tod')); SkySys.apply(Settings.get('tod')); if (!SkySys.lite()) SkySys.preloadRest();               // photographic sky of the chosen time of day first, the others in the background
    const skyKids = G.scene.children.slice();
    Terrain.build(G.scene);
    prog(50, I18n.t('load.structures')); await tick();
    Structures.build(G.scene);
    prog(70, I18n.t('load.nature')); await tick();
    Nature.build(G.scene, Device.phone ? 'low' : 'high');
    prog(76, I18n.t('load.structures')); await Assets.build(G.scene, (d, t) => prog(76 + 6 * d / t, I18n.t('load.structures') + ' ' + d + '/' + t));          // optional GLB props from assets/models.json
    FastEnv.convertTree(G.scene);                                                                      // (their matte materials too: Lambert + SH sky light, engine/fastenv.js)
    Terrain.bakeAO();
    World.main = G.scene.children.filter(o => !skyKids.includes(o));       // everything that belongs to the open world (hidden inside duel / training arenas)
    World.mainSpots = World.lootSpots;
    prog(82, I18n.t('load.fx')); await tick();
    FX.init(G.scene); Zone.init(G.scene); HUD.init(); Input.init(canvas);
    Zone.reset();
    this.applyQuality();
    Menu.build();
    this.setupPost();
    this.bindUI();
    prog(100, I18n.t('load.ready')); await tick();
    document.getElementById('loading').classList.add('hidden');
    this.toMenu();
    Updater.start();                                                                                  // new versions of the game reach an installed copy by themselves (src/core/updater.js)
    Matchmaking.init();                                                                               // online matches with other players (src/net/matchmaking.js)
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    this.running = true;
    this.loop();
  },

  resolveQuality() {
    const s = Settings.get('quality');
    if (s !== 'auto') { this.qualityKey = QUALITY[s] ? s : 'high'; return; }
    if (this.autoKey) { this.qualityKey = this.autoKey; return; }
    // auto starts as high as the machine looks able to handle and steps down on its own if the frame rate suffers (see measure)
    if (Device.phone) { this.qualityKey = Device.mem >= 4 && Device.cores >= 8 ? 'med' : 'low'; return; }          // phones start light and may only step down from there
    if (Device.tablet) { this.qualityKey = 'med'; return; }
    const cores = navigator.hardwareConcurrency || 4, dpr = window.devicePixelRatio || 1;
    this.qualityKey = cores >= 8 && dpr <= 2 ? 'ultra' : cores >= 6 ? 'high' : cores >= 4 ? 'med' : 'low';
  },

  applyQuality() {
    this.resolveQuality();
    const q = QUALITY[this.qualityKey]; G.quality = this.qualityKey; this.basePR = Math.min(window.devicePixelRatio || 1, q.pr * (Device.phone ? 1.25 : 1));
    G.drawScale = G.drawScale || 1;
    SkySys.setShadows(q.shadow, q.extent); SkySys.sun.castShadow = q.shadows;
    if (Nature.grass) Nature.grass.count = Math.floor(Nature.grass.instanceMatrix.count * q.grass);
    if (Nature.tall) Nature.tall.count = Math.floor(Nature.tall.instanceMatrix.count * Math.max(0.4, q.grass));
    this.usePost = q.post;
    Grass3D.apply(this.qualityKey);                                                                   // the blade carpet around the camera: High and Ultra only
    Trees.apply(this.qualityKey);                                                                     // the modelled trees (world/trees.js): High and Ultra only, the card trees elsewhere
    if (!Tex.photosAsked && !Device.phone && (this.qualityKey === 'high' || this.qualityKey === 'ultra') && !/[?&]photos=0/.test(location.search)) { Tex.photosAsked = true; setTimeout(() => Tex.loadPhotos(), 1500); }         // photographs for the ground and the buildings, once, only where the machine can afford them (?photos=0 keeps the painted textures, for comparing)
    if (this.composer) {
      this.bloom.enabled = q.post; this.fxaa.enabled = !!q.fxaa;
      for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== q.samples) { rt.samples = q.samples; rt.dispose(); }
    }
    this.onResize();
  },

  setupPost() {
    const r = G.renderer, size = new THREE.Vector2(); r.getDrawingBufferSize(size);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: QUALITY[this.qualityKey].samples });
    const c = this.composer = new FX.EffectComposer(r, rt);
    this.mainPass = new FX.RenderPass(G.scene, G.camera);
    this.vmPass = new FX.RenderPass(G.vmScene, G.vmCam); this.vmPass.clear = false; this.vmPass.clearDepth = true;
    this.bloom = new FX.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.34, 0.7, 0.82);
    this.grade = new FX.ShaderPass(GRADE_SHADER);
    this.outPass = new FX.OutputPass();
    this.fxaa = new FX.ShaderPass(FX.FXAAShader); this.fxaa.enabled = !!QUALITY[this.qualityKey].fxaa;          // after the output pass: it smooths the finished (tone-mapped) picture
    c.addPass(this.mainPass); c.addPass(this.vmPass); c.addPass(this.bloom); c.addPass(this.grade); c.addPass(this.outPass); c.addPass(this.fxaa);
  },

  onResize() {
    const r = G.renderer, w = innerWidth, h = innerHeight, pr = (this.basePR || 1) * (G.drawScale || 1);
    r.setPixelRatio(pr); r.setSize(w, h);
    G.camera.aspect = w / h; G.camera.updateProjectionMatrix(); G.vmCam.aspect = w / h; G.vmCam.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.grade.uniforms.res.value.set(w * pr, h * pr); if (this.fxaa) this.fxaa.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr)); }
  },

  syncEnv() {
    G.vmScene.environment = SkySys.envTex; if (Menu.scene) Menu.scene.environment = SkySys.envTex;
  },

  bindUI() {
    const canvas = this.canvas;
    document.getElementById('resumeBtn').onclick = () => this.resume();
    document.getElementById('quitBtn').onclick = () => { if (confirm(I18n.t('pause.confirm'))) this.quitToMenu(); };
    document.getElementById('pauseSettingsBtn').onclick = () => Menu.openOverlay();
    document.getElementById('againBtn').onclick = () => this.start({ mode: this.lastMode });
    document.getElementById('lobbyBtn').onclick = () => this.quitToMenu();
    document.addEventListener('keydown', e => { if (e.code === 'F3') { e.preventDefault(); Settings.set('showFps', !Settings.get('showFps')); } });
  },

  lock() { Input.tryLock(); if (Input.touchOn && window.__tryFullscreen) window.__tryFullscreen(); },

  toMenu() {
    G.state = 'menu';
    for (const id of ['pause', 'endScreen']) document.getElementById(id).classList.add('hidden');
    HUD.show(false); Menu.show(); this.syncEnv(); Input.showTouch(false);
    Sound.ambienceStop(); Sound.engineStop(); Sound.spinStop();
    if (document.pointerLockElement) document.exitPointerLock();
  },

  quitToMenu() { clearTimeout(this.endT); Menu.closeOverlay(); this.cleanup(); this.toMenu(); },

  cleanup(keepNet) {
    if (!keepNet) Net.leaveMatch(true);
    for (const b of G.bots) b.setGhost && b.setGhost(false);
    Bots.reset(); Loot.clear(); Vehicles.reset(); Projectiles.reset(); FX.reset(); Supply.reset();
    if (typeof Duel !== 'undefined') Duel.leave(); if (typeof Tutorial !== 'undefined') Tutorial.leave(); Zone.enabled = true;
    if (Player.rig) Player.rig.root.visible = false;
    if (Player.vmRoot) Player.vmRoot.visible = false;
  },

  // opts: { mode: 'br' | 'duel' | 'tutorial', again: true }
  start(opts) {
    opts = opts || {};
    const mode = opts.mode || this.lastMode || 'br'; this.lastMode = mode; this.mode = G.mode = mode;
    Sound.init(); Sound.setVolume(Settings.get('volume'));
    clearTimeout(this.endT); Menu.closeOverlay();
    this.cleanup(!!opts.net); if (typeof Matchmaking !== 'undefined') Matchmaking.started();                  // (a match is starting: the "looking for players" screen is over)
    G.state = 'playing'; G.time = 0; G.noises.length = 0; this.killer = null; this.xray = false; G.matchOver = false;
    Profile.beginMatch(mode, Skill.rating());
    if (mode === 'duel') Duel.begin(opts); else if (mode === 'tutorial') Tutorial.begin(opts); else this.beginBR(opts);
    HUD.last = {}; HUD.lastBeat = 0; HUD.el.killfeed.innerHTML = ''; HUD.el.dmgInd.innerHTML = ''; HUD.useBar(0);
    for (const id of ['pause', 'endScreen']) document.getElementById(id).classList.add('hidden');
    Menu.hide(); HUD.show(true); Input.showTouch(true);
    this.announceCrowd();
    Sound.ambienceStart();
    this.lock();
  },

  // opts.net: { role: 'host' } runs the bots for a squad, { role: 'guest', init } joins the host's world (see net/p2p.js)
  beginBR(opts) {
    const nt = (opts && opts.net) || null, guest = nt && nt.role === 'guest';
    Themes.apply(guest ? nt.init.map : (Profile.d.loadout.map || 'classic')); this.syncEnv();
    if (guest) {
      Vehicles.reset(); Loot.clear(); Player.reset(); Player.name = Settings.get('name') || 'Player';
      Zone.reset(); Zone.enabled = true; Net.enterCoopGuest(nt.init);
    } else {
      Loot.populate(); Vehicles.spawnAll();
      Player.reset(); Player.name = Settings.get('name') || 'Player';
      Bots.spawn(nt && nt.botCount !== undefined ? nt.botCount : BOT_COUNT, nt ? nt.rating : undefined); Bots.assignDrops(Player.pos.clone(), Player.planeDir);          // (a public match: the bots only fill the places the real players leave empty, around their average level)
      Zone.reset(); Zone.begin(); Zone.enabled = true;
      if (nt) Net.enterCoopHost();
    }
    HUD.banner(I18n.t('hud.plane', { k: Input.key('jump') }), 4);
  },

  pause() {
    if (G.state !== 'playing') return;
    G.state = 'paused'; document.getElementById('pause').classList.remove('hidden'); Sound.engineStop(); Sound.spinStop();
    Input.clear(); Input.showTouch(false);
  },

  resume() {
    Menu.closeOverlay();
    document.getElementById('pause').classList.add('hidden'); G.state = 'playing';
    if (Player.riding) Sound.engineStart();
    this.lock();
  },

  aliveCount() { return Bots.aliveCount() + Net.aliveExtra() + (Player.alive ? 1 : 0); },

  weaponName(wid) { return wid && WEAPONS[wid] ? WEAPONS[wid].name : wid === 'frag' ? I18n.t('throw.frag') : wid === 'storm' ? I18n.t('feed.stormShort') : wid === 'bike' ? I18n.t('feed.bike') : ''; },

  // who is in the match: real players and bots. In an online match with real players a bot carries a [BOT] tag in the kill feed, so that nobody mistakes it for a person.
  compose() {
    if (this.mode === 'duel') return { humans: Duel.net ? 2 : 1, bots: Duel.net ? 0 : 1 };
    if (this.mode === 'tutorial') return { humans: 1, bots: 1 };
    return { humans: 1 + (Net.remotes ? Object.keys(Net.remotes).length : 0), bots: G.bots.length || Object.keys(Net.puppets || {}).length || BOT_COUNT };          // (the host's bots, or the puppets a guest sees)
  },
  tag(actor) { return actor ? actor.name + (actor.isBot && this.mode !== 'tutorial' && this.compose().humans > 1 ? ' [BOT]' : '') : ''; },
  // at the start of a match: the text that says whether the other players are bots (all of them, some of them, or none)
  announceCrowd() {
    if (this.mode === 'tutorial') return;
    const c = this.compose(), duel = this.mode === 'duel';
    if (duel) HUD.toast(I18n.t(c.bots ? 'match.duelBot' : 'match.duelHuman'), '', 0x7fd0ff);
    else if (c.humans <= 1) HUD.toast(I18n.t('match.allBots'), '', 0x7fd0ff);
    else HUD.toast(c.bots ? I18n.t('match.someBots', { h: c.humans, b: c.bots }) : I18n.t('match.noBots'), c.bots ? I18n.t('match.someBotsSub') : '', 0x7fd0ff);
  },

  actorKilled(victim, attacker, wid) {
    const wn = this.weaponName(wid), M = Profile.match, hit = victim.lastHit || {};
    HUD.feed(attacker ? I18n.t('feed.kill', { a: this.tag(attacker), v: this.tag(victim) }) + (wn ? ' · ' + wn : '') : I18n.t('feed.stormKill', { v: this.tag(victim) }), attacker === Player ? 0xf3c64a : 0);
    if (attacker === Player) {
      Player.kills++; G.kills++;
      if (M) {
        M.kills++; if (hit.head) M.headshots++; M.longShot = Math.max(M.longShot, hit.dist || 0);
        if (wid === 'bike') M.bikeKills++; if (wid === 'frag' || wid === 'rpg') M.explosiveKills++;
      }
      Events.emit('kill', { victim, wid, head: !!hit.head, dist: hit.dist || 0 });
    }
    if (this.mode === 'duel') { Duel.onKill(victim, attacker); return; }
    if (this.mode === 'tutorial') { Tutorial.onKill(victim); return; }
    if (Net.coop) { if (Net.isHost) Net.checkEnd(); return; }
    if (Player.alive && Bots.aliveCount() === 0) this.finish(true);
  },

  playerDied(attacker, wid) {
    this.killer = attacker; this.killerWpn = wid; Net.localDied(attacker, wid);
    const wn = this.weaponName(wid);
    HUD.feed(attacker ? I18n.t('feed.killedBy', { a: this.tag(attacker) }) + (wn ? ' · ' + wn : '') : I18n.t('feed.storm'), 0xff5050);
    HUD.prompt(null); HUD.useBar(0);
    if (this.mode === 'duel') { Duel.onPlayerDied(attacker); return; }
    if (this.mode === 'tutorial') { Tutorial.onPlayerDied(); return; }
    if (Net.coop && (!Net.ffa || Net.isHost)) { if (Net.ffa) HUD.banner(I18n.t('net.out', { rank: Net.myRank }), 8); return; }          // squad: the match goes on for the team, the host ends it (Net.checkEnd); a public match: a guest finishes at once, the host keeps the world running for the others
    if (document.pointerLockElement) document.exitPointerLock();
    this.endT = setTimeout(() => this.finish(false), 2600);
  },

  // extra: { title, stats, rank, total, time } overrides for non battle-royale modes
  finish(won, extra) {
    if (G.state === 'over' || G.state === 'menu') return;
    G.state = 'over'; G.matchOver = true;
    if (document.pointerLockElement) document.exitPointerLock();
    Sound.engineStop(); Sound.spinStop(); Input.showTouch(false); Input.clear();
    extra = extra || {};
    const total = extra.total || (this.mode === 'duel' ? 2 : BOT_COUNT + 1), rank = extra.rank || (won ? 1 : (Net.ffa && Net.myRank ? Net.myRank : Bots.aliveCount() + 1));
    const time = extra.time !== undefined ? extra.time : Math.round(G.time);
    let rew = { coins: 0, pts: 0, xp: 0 };
    const cancelled = !!extra.noStats;                                                                               // an online match whose host left: nothing is counted, for or against the player
    const trial = (this.mode !== 'tutorial' && !!(Profile.match && Profile.match.trial)) || cancelled;               // the Phantom-X trial option: nothing is saved
    if (trial) rew = { coins: 0, pts: 0, xp: 0 }; else if (this.mode !== 'tutorial') rew = Profile.endMatch({ won, rank, time, total }); else { rew = { coins: won ? 300 : 0, pts: won ? 20 : 0, xp: won ? 300 : 0 }; if (won && !Profile.d.tutorialDone) { Profile.d.tutorialDone = true; Profile.d.coins += 300; Profile.d.points += 20; Profile.save(); } }
    document.getElementById('endTitle').textContent = extra.title || I18n.t(won ? 'end.win' : 'end.lose');
    document.getElementById('endStats').textContent = extra.stats || (I18n.t('end.stats', { rank, total, kills: Player.kills }) + (!won && this.killer ? I18n.t('end.by', { name: this.killer.name }) + (this.killerWpn ? ' (' + this.weaponName(this.killerWpn) + ')' : '') : ''));
    document.getElementById('endRewards').innerHTML = `<h4>${I18n.t('end.rewards')}</h4><span class="coin"></span> +${I18n.n(rew.coins)} &nbsp; <span class="pt"></span> +${I18n.n(rew.pts)} &nbsp; XP +${I18n.n(rew.xp)}`;
    document.getElementById('againBtn').style.display = this.mode === 'tutorial' || Net.session ? 'none' : '';
    document.getElementById('endScreen').classList.remove('hidden');
    HUD.show(false);
    if (trial) document.getElementById('endRewards').innerHTML = '<h4>' + I18n.t(cancelled ? 'net.hostLeftSub' : 'end.trial') + '</h4>'; else if (Settings.get('skin') === 'ultra' && Profile.owns('skin', 'ultra')) Online.submitScore();
  },

  // ---------- main loop ----------
  loop() {
    requestAnimationFrame(() => this.loop());
    const raw = this.clock.getDelta(), dt = Math.min(raw, 0.05);
    this.measure(raw);
    // a runtime error in one frame must never freeze the game: log (rate limited) and keep rendering
    try {
      if (G.state === 'playing' || (G.state === 'over' && Player.alive)) this.step(dt);
      else if (G.state === 'menu') { Input.update(dt); Menu.update(dt); SkySys.update(dt, G.camera); }
      else if (G.state === 'over') { Input.update(dt); FX.update(dt); Bots.update(dt); }
      else if (G.state === 'paused') Input.update(dt);
    } catch (e) { this.report(e); }
    try { this.render(); } catch (e) { this.report(e); }
  },

  report(e) {
    this.errCount = (this.errCount || 0) + 1;
    if (this.errCount < 6 || this.errCount % 200 === 0) console.error('[game]', e);
  },

  step(dt) {
    G.time += dt;
    Input.update(dt);
    Player.update(dt);
    Bots.update(dt); Net.update(dt);
    if (this.mode === 'duel') Duel.update(dt); else if (this.mode === 'tutorial') Tutorial.update(dt);
    Vehicles.update(dt);
    if (this.mode === 'br') Zone.update(dt);
    Loot.update(dt); Supply.update(dt);
    Projectiles.update(dt);
    FX.update(dt); if (G.quality !== 'low') FX.ambient(dt, G.camera.position);
    SkySys.update(dt, G.camera); Terrain.update(dt); Nature.update(dt); Grass3D.update(dt); Trees.update(dt);
    for (const f of World.updaters) f(dt);
    HUD.update(dt);
    Sound.setListener(G.camera);
    // x-ray and thermal scope effects
    const w = Player.weapon(), xr = !!(Player.scoped && w && w.id === 'special');
    if (xr !== this.xray) { this.xray = xr; for (const b of G.bots) b.setGhost(xr); }
    this.syncViewmodelLight();
  },

  syncViewmodelLight() {
    const q = G.camera.quaternion.clone().invert(), d = SkySys.sunDir.clone().applyQuaternion(q);
    this.vmSun.position.copy(d.multiplyScalar(6)); this.vmSun.color.copy(SkySys.sun.color); this.vmSun.intensity = SkySys.sun.intensity * 0.7;
  },

  render() {
    const r = G.renderer;
    const thermalOn = G.state !== 'menu' && Player.scoped && Player.weapon() && SIGHTS[Player.weapon().sight].thermal;
    const useComposer = this.composer && (this.usePost || thermalOn);
    if (G.state === 'menu') {
      if (useComposer) {
        this.mainPass.scene = Menu.scene; this.mainPass.camera = Menu.cam; this.vmPass.enabled = false; this.grade.uniforms.time.value = G.time;
        this.grade.uniforms.hurt.value = 0; this.grade.uniforms.thermal.value = 0; this.bloom.strength = 0.4;
        this.composer.render();
        this.mainPass.scene = G.scene; this.mainPass.camera = G.camera; this.vmPass.enabled = true; this.bloom.strength = 0.34;
      } else r.render(Menu.scene, Menu.cam);
      return;
    }
    const thermal = thermalOn;
    if (useComposer) {
      this.grade.uniforms.time.value = G.time % 100;
      this.grade.uniforms.hurt.value = Player.alive ? clamp((1 - Player.health / 100 - 0.55) * 1.2, 0, 0.5) * 0.35 : 0.5;
      this.grade.uniforms.thermal.value = thermal ? 1 : 0;
      const sp = G.camera.position.clone().addScaledVector(SkySys.sunDir, 800).project(G.camera), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(G.camera.quaternion);
      this.grade.uniforms.sunUv.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5); this.grade.uniforms.sunCol.value.copy(SkySys.sun.color);
      this.grade.uniforms.rays.value = this.usePost ? clamp(fwd.dot(SkySys.sunDir) * 1.6, 0, 1) * (SkySys.key === 'overcast' ? 0.3 : 1) : 0;
      this.vmPass.enabled = !!(Player.vmRoot && Player.vmRoot.visible);
      this.composer.render();
    } else {
      r.render(G.scene, G.camera);
      if (Player.vmRoot && Player.vmRoot.visible) { r.autoClear = false; r.clearDepth(); r.render(G.vmScene, G.vmCam); r.autoClear = true; }
    }
  },

  // frame-time measurement with automatic resolution scaling
  measure(raw) {
    this.fpsAcc += raw; this.fpsN++;
    if (this.fpsAcc >= 1) {
      G.fps = Math.round(this.fpsN / this.fpsAcc); const avg = this.fpsAcc / this.fpsN; this.fpsAcc = 0; this.fpsN = 0;
      if (Settings.get('quality') === 'auto' && G.state === 'playing') {
        this.adaptT++;
        if (G.fps < 46 && Grass3D.shrink()) this.adaptT = 0;                                              // first trim the radius of the grass, then give up whole quality levels
        else if (G.fps < 38 && this.qualityKey === 'ultra') { this.autoKey = 'high'; this.applyQuality(); this.adaptT = 0; }
        else if (G.fps < 38 && G.drawScale > 0.75) { G.drawScale = Math.max(0.7, G.drawScale - 0.1); this.onResize(); this.adaptT = 0; }
        else if (G.fps < 38 && this.qualityKey === 'high') { this.autoKey = 'med'; G.drawScale = 0.9; this.applyQuality(); this.adaptT = 0; }
        else if (G.fps < 38 && G.drawScale > 0.55) { G.drawScale = Math.max(0.55, G.drawScale - 0.1); this.onResize(); this.adaptT = 0; }
        else if (G.fps < 30 && G.drawScale <= 0.6 && this.usePost) { this.usePost = false; this.adaptT = 0; }
        else if (G.fps > 57 && G.drawScale < 1 && this.adaptT > 4) { G.drawScale = Math.min(1, G.drawScale + 0.05); this.onResize(); this.adaptT = 0; }
        else if (G.fps > 57 && this.adaptT > 6 && Grass3D.grow()) this.adaptT = 0;
      }
    }
  }
};

window.startGame = () => Game.init();
