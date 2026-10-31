import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

window.THREE = THREE;
window.FX = { EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass, FXAAShader, mergeGeometries };

// Load order matters only for top-level declarations (classes and Object.assign extensions).
const SCRIPTS = [
  'core/brand', 'core/utils', 'core/settings', 'core/events', 'core/catalog', 'core/i18n', 'core/lang/en', 'core/lang/he', 'core/lang/es', 'core/lang/fr', 'core/lang/de', 'core/lang/ru', 'core/lang/pt', 'core/lang/tr', 'core/lang/ar', 'core/profile', 'core/skill', 'core/updater', 'ui/input',
  'engine/audio', 'engine/textures', 'engine/sky', 'engine/fastenv', 'engine/terrain', 'engine/models', 'engine/fx',
  'world/nature', 'world/trees', 'world/structures', 'world/structures2', 'world/structures3', 'world/assets', 'world/grass3d',
  'entities/character', 'entities/skins', 'entities/suit', 'entities/gear', 'entities/qrig', 'entities/weapons', 'entities/projectiles', 'entities/loot', 'world/supply',
  'entities/player', 'entities/player2', 'entities/vehicles', 'entities/bots', 'entities/botai', 'entities/zone',
  'world/themes', 'modes/duel', 'modes/tutorial',
  'ui/hud', 'ui/menu', 'ui/thumbs', 'ui/shop', 'ui/progress', 'net/online', 'net/p2p', 'net/matchmaking', 'ui/social', 'main'
];

const fill = document.getElementById('loadFill'), text = document.getElementById('loadText');

const VERSION = '4.4.0', ASSET_REV = 'a0ce6bcf6', DEV = /^(localhost|127\.|\[::1\])/.test(location.hostname);       // ASSET_REV changes only when a file under assets/ does (tools/release.ps1 sets both)
// the number is never shown to players (not in the title, the loading screen, the lobby or About): it only drives the updates (version.json, sw.js, src/core/updater.js); bump it for every release (tools/release.ps1)
window.GAME_VERSION = VERSION;                                   // (the name, the title and the console banner come from src/core/brand.js, the first script loaded)
window.ASSET_VER = DEV ? Date.now() : ASSET_REV;                // the ?v= of the models, textures and skies: a new version of the game keeps them (and the copies players already have) unless the files changed
// the browser offers "install as an app" (once; keep the offer until the lobby has a button for it)
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__installEv = e; window.dispatchEvent(new Event('lss-install')); });
window.addEventListener('appinstalled', () => { window.__installEv = null; window.dispatchEvent(new Event('lss-install')); });
// the service worker makes the game installable and playable offline; a new sw.js (a new version on the server) replaces it at once and src/core/updater.js reloads into the new version when the lobby is showing
if ('serviceWorker' in navigator && (!DEV || /[?&]sw=1/.test(location.search))) {                                      // dev server: always fetch fresh code
  const had = !!navigator.serviceWorker.controller;                                                                   // a first install is not an update
  navigator.serviceWorker.register('sw.js').catch(() => { /* an app that cannot be installed still plays */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) window.dispatchEvent(new Event('lss-sw-change')); });
}

function load(name) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `src/${name}.js?v=${DEV ? Date.now() : VERSION}`;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + name + '.js'));
    document.body.appendChild(s);
  });
}

(async () => {
  try {
    for (let i = 0; i < SCRIPTS.length; i++) {
      text.textContent = `Loading code (${i + 1}/${SCRIPTS.length})`;
      fill.style.width = (i / SCRIPTS.length * 40) + '%';
      await load(SCRIPTS[i]);
    }
    await window.startGame();
  } catch (e) {
    console.error(e);
    text.textContent = 'Load error: ' + e.message;
    text.style.color = '#ff7a7a';
  }
})();
