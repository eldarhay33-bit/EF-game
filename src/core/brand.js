// The game's name, logo and texts in ONE place. To rename the game or change its logo: edit the values below, put the new pictures where "logo", "emblem", "ogImage" and "icons" point
// (assets/brand, assets/icons) and run  powershell -File tools\apply-brand.ps1  -- it copies the name, the texts and the picture paths into the three files that cannot read this one
// (index.html, manifest.webmanifest, sw.js). Everything between the braces must stay valid JSON: the tool reads it as data. More in docs/REBRAND.md.
// Not part of the brand, never rename them (every saved profile and every online id would be lost): the "lss-" names of the saved data and of the peer ids.
const BRAND = {
  "name": "Last Squad Standing",
  "short": "LSS",
  "wordmark": ["LAST", "SQUAD", "STANDING"],
  "author": "DCeator",
  "description": "Last Squad Standing: a free battle royale that runs in your browser and installs as an app. Parachute in, loot up, ride and be the last squad standing.",
  "share": "A free battle royale in your browser. Parachute in, loot up and be the last squad standing. Created by DCeator.",
  "themeColor": "#070a16",
  "logo": "assets/brand/logo.svg",
  "emblem": "assets/brand/emblem.svg",
  "ogImage": "assets/brand/og-image.png",
  "icons": { "favicon": "assets/icons/favicon-32.png", "small": "assets/icons/icon-192.png", "large": "assets/icons/icon-512.png", "maskable": "assets/icons/icon-maskable-512.png", "apple": "assets/icons/apple-touch-icon.png" }
};

document.title = BRAND.name;
console.log('%c' + BRAND.name + '%c  created by ' + BRAND.author + (/[?&]ver\b/.test(location.search) || /^(localhost|127\.|\[::1\])/.test(location.hostname) ? '  (build ' + window.GAME_VERSION + ')' : ''), 'font:800 14px sans-serif;color:#f3c64a', 'font:12px sans-serif;color:#9fb0c0');
