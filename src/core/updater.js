// Keeps the game up to date, in the browser and when it is installed as an app (phone, tablet or computer).
// Three things tell it that a new version has been put on the server:
//   1. version.json (a few bytes, always fetched fresh): the page asks for it shortly after the start, every 20 minutes, when the player comes back to the tab / app and when the connection returns;
//   2. the browser's own check of sw.js, which is run on every launch of an installed app (boot.js turns the replacement of the service worker into the event "lss-sw-change");
//   3. the "Check for updates" button in Settings > About.
// A new version never interrupts a match: it is loaded (the page reloads, the cached files are replaced) the moment the lobby is on screen.
// Releasing = raising the version number (tools/release.ps1 does it everywhere) and putting the folder on the server.
const Updater = {
  current: '', latest: '', pending: false, status: 'idle', lastCheck: 0, reloading: false,

  start() {
    this.current = window.GAME_VERSION || '';
    const dev = /^(localhost|127\.|\[::1\])/.test(location.hostname) && !/[?&]sw=1/.test(location.search);
    window.addEventListener('lss-sw-change', () => this.found(this.latest || '?'));
    if (dev) return;                                                 // the dev server serves whatever is on disk: nothing to update
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - this.lastCheck > 60e3) this.check(); });
    window.addEventListener('online', () => this.check());
    setInterval(() => this.check(), 20 * 60e3);
    setTimeout(() => this.check(), 6000);
    setInterval(() => this.tick(), 1500);
  },

  // true when the game runs as an installed app (the install buttons then have nothing to do)
  installed() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || (window.matchMedia && matchMedia('(display-mode: fullscreen)').matches) || navigator.standalone === true; },

  async check() {
    this.lastCheck = Date.now(); this.status = 'checking';
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) reg.update().catch(() => { /* offline */ });
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json(); this.latest = String(j.version || '');
      if (this.latest && this.latest !== this.current) { this.found(this.latest); return 'new'; }
      this.status = 'latest'; return 'latest';
    } catch (e) { this.status = 'offline'; return 'offline'; }
  },

  found(v) { this.latest = v; this.pending = true; this.status = 'new'; this.tick(); },

  // a new version is waiting: load it as soon as the lobby is showing (never in a match, and never more than twice in a minute, in case the server still hands out the old files)
  tick() {
    if (!this.pending || this.reloading || typeof G === 'undefined' || G.state !== 'menu') return;
    let tries = []; try { tries = JSON.parse(sessionStorage.getItem('lss-upd') || '[]').filter(t => Date.now() - t < 60e3); } catch (e) { /* no storage */ }
    if (tries.length >= 2) return;
    tries.push(Date.now()); try { sessionStorage.setItem('lss-upd', JSON.stringify(tries)); } catch (e) { /* no storage */ }
    this.reloading = true;
    if (typeof HUD !== 'undefined' && HUD.toast) HUD.toast(I18n.t('upd.toast'), '', 0x5fd14a);
    setTimeout(() => location.reload(), 1400);
  },

  // the button in Settings > About: returns the key of the message to show
  async manual() {
    const s = await this.check();
    if (s === 'new') return { key: 'about.updating' };
    return { key: s === 'latest' ? 'about.latest' : 'about.offline' };
  }
};
