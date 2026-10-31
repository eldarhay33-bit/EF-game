// Service worker: lets the game be installed (phone, tablet, computer) and start without a network after the first visit, and brings new versions in by itself.
// - The pages, scripts and styles (the "shell") are fetched fresh whenever there is a connection (so an update arrives at once) and kept for when there is none.
// - The big files (models, textures, skies, the three.js files from the CDN) are kept the first time they are loaded and served from there. They live in a cache named after ASSET_REV, a code that changes only
//   when something under assets/ has changed, so a new version of the game does not make everybody download 60 MB again; the old copies go away when the code changes.
// VERSION, ASSET_REV and CACHE are written by tools/release.ps1 (together with src/boot.js and version.json). A changed sw.js is what makes the browser install the new worker.
const VERSION = '4.4.0', ASSET_REV = 'a0ce6bcf6';
const CACHE = 'lss-v4.4', ASSETS = 'lss-assets-' + ASSET_REV;
const SHELL = ['./', 'index.html', 'css/main.css', 'css/v3.css', 'css/phone.css', 'manifest.webmanifest', 'assets/icons/icon-192.png', 'assets/brand/logo.svg', 'assets/brand/emblem.svg'];
const HEAVY = /\/assets\/(models|sky|tex)\/|\/assets\/models\.json|cdn\.jsdelivr\.net|gstatic\.com/;

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting())); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== ASSETS) await caches.delete(k);                  // the shell of older versions, and the big files of an older assets code
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url), same = u.origin === location.origin, heavy = HEAVY.test(u.host + u.pathname);
  if (same && /\/version\.json$/.test(u.pathname)) return;                                              // the update check always goes to the server
  if (!same && !heavy) return;
  if (heavy) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) { const copy = res.clone(); caches.open(ASSETS).then(c => c.put(r, copy)); } return res; })));
    return;
  }
  e.respondWith(fetch(r, { cache: 'no-cache' }).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; }).catch(() => caches.match(r).then(hit => hit || caches.match('index.html'))));
});
