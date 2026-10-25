import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

window.THREE = THREE;
window.FX = { EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass, mergeGeometries };

// Load order matters only for top-level declarations (classes and Object.assign extensions).
const SCRIPTS = [
  'core/utils', 'core/settings', 'core/events', 'core/catalog', 'core/i18n', 'core/lang/en', 'core/lang/he', 'core/lang/es', 'core/lang/fr', 'core/lang/de', 'core/lang/ru', 'core/lang/pt', 'core/lang/tr', 'core/lang/ar', 'core/profile', 'ui/input',
  'engine/audio', 'engine/textures', 'engine/sky', 'engine/terrain', 'engine/models', 'engine/fx',
  'world/nature', 'world/structures', 'world/structures2', 'world/structures3',
  'entities/character', 'entities/skins', 'entities/weapons', 'entities/projectiles', 'entities/loot', 'world/supply',
  'entities/player', 'entities/player2', 'entities/vehicles', 'entities/bots', 'entities/botai', 'entities/zone',
  'world/themes', 'modes/duel', 'modes/tutorial',
  'ui/hud', 'ui/menu', 'ui/shop', 'ui/progress', 'net/online', 'net/p2p', 'ui/social', 'main'
];

const fill = document.getElementById('loadFill'), text = document.getElementById('loadText');

const VERSION = '3.1.0', DEV = /^(localhost|127\.|\[::1\])/.test(location.hostname);       // dev server: always fetch fresh code

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
