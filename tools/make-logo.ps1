# Draws the Last Squad Standing logo: assets/brand/*.svg (hand-built vector shapes, the lettering is made of paths so it looks the same on every device and needs no font),
# then renders the app icons / favicons / share picture to PNG with the Edge (or Chrome) that is already on the machine (headless screenshot, nothing is installed or downloaded).
#   powershell -File tools\make-logo.ps1            (writes the SVGs and the PNGs)
#   powershell -File tools\make-logo.ps1 -NoPng     (SVGs only)
param([switch]$NoPng)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$brand = Join-Path $root 'assets\brand'; $icons = Join-Path $root 'assets\icons'
New-Item -ItemType Directory -Force -Path $brand | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
$inv = [Globalization.CultureInfo]::InvariantCulture
function N($v) { [string]::Format($inv, '{0:0.##}', [double]$v) }

# ---------- lettering: every letter is a stroked polyline in a box 100 high (the stroke is added by the group that uses it) ----------
$glyph = [ordered]@{
  L = @('M11 11 V89 H58', 62)
  A = @('M9 89 L27 17 H49 L67 89 M22 62 H54', 76)
  S = @('M60 24 V21 L50 11 H21 L9 23 V37 L21 49 H46 L59 61 V77 L47 89 H15 L5 79', 66)
  T = @('M2 11 H66 M34 11 V89', 68)
  Q = @('M20 11 H50 L62 23 V77 L50 89 H20 L8 77 V23 Z M44 66 L68 96', 72)
  U = @('M11 11 V75 L25 89 H45 L59 75 V11', 70)
  D = @('M11 11 V89 H36 L60 65 V35 L36 11 Z', 70)
  N = @('M11 89 V11 L59 89 V11', 70)
  I = @('M11 11 V89', 22)
  G = @('M60 29 L48 11 H21 L9 23 V77 L21 89 H47 L60 76 V53 H34', 70)
}
$defs = New-Object Text.StringBuilder
foreach ($k in $glyph.Keys) { [void]$defs.AppendLine("<path id=`"g$k`" d=`"$($glyph[$k][0])`"/>") }
function Word($name, $text, $gap) {
  $x = 0; $sb = New-Object Text.StringBuilder; [void]$sb.AppendLine("<g id=`"w$name`">")
  foreach ($ch in $text.ToCharArray()) { [void]$sb.AppendLine("  <use href=`"#g$ch`" x=`"$(N $x)`"/>"); $x += $glyph["$ch"][1] + $gap }
  [void]$sb.AppendLine('</g>'); return @{ svg = $sb.ToString(); w = $x - $gap }
}
$wSquad = Word 'SQUAD' 'SQUAD' 14; $wStanding = Word 'STANDING' 'STANDING' 21; $wLast = Word 'LAST' 'LAST' 16

$paint = @'
<linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="0" y1="-2" x2="0" y2="102"><stop offset="0" stop-color="#fff7c4"/><stop offset=".32" stop-color="#ffd54a"/><stop offset=".68" stop-color="#f6a51a"/><stop offset="1" stop-color="#c76a08"/></linearGradient>
<linearGradient id="ice" gradientUnits="userSpaceOnUse" x1="0" y1="-2" x2="0" y2="102"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bff3ff"/><stop offset="1" stop-color="#55c4ff"/></linearGradient>
<linearGradient id="cy" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100"><stop offset="0" stop-color="#b9fbff"/><stop offset="1" stop-color="#35d3f5"/></linearGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
'@

# the body of every word as a mask, so that the light and shade lines stay inside the letters
$masks = @"
<mask id="mkLAST" maskUnits="userSpaceOnUse" x="-80" y="-60" width="700" height="220"><use href="#wLAST" fill="none" stroke="#fff" stroke-width="22" stroke-linejoin="miter" stroke-miterlimit="3"/></mask>
<mask id="mkSQUAD" maskUnits="userSpaceOnUse" x="-80" y="-60" width="700" height="220"><use href="#wSQUAD" fill="none" stroke="#fff" stroke-width="24" stroke-linejoin="miter" stroke-miterlimit="3"/></mask>
<mask id="mkSTANDING" maskUnits="userSpaceOnUse" x="-80" y="-60" width="900" height="220"><use href="#wSTANDING" fill="none" stroke="#fff" stroke-width="24" stroke-linejoin="miter" stroke-miterlimit="3"/></mask>
"@
# a word with its shadow, dark outline, body and two light edges; (x, y) = top left of the letters, s = scale, body = paint
function WordArt($id, $x, $y, $s, $body, $weight) {
  $o = $weight + 16; $sh = $weight + 22; $mk = 'mk' + $id.Substring(1)
  return @"
<g transform="translate($(N $x) $(N $y)) skewX(-9) scale($(N $s))" fill="none" stroke-linejoin="miter" stroke-miterlimit="3">
  <use href="#$id" stroke="#02041a" stroke-opacity=".6" stroke-width="$sh" transform="translate(0 9)" filter="url(#soft)"/>
  <use href="#$id" stroke="#070b30" stroke-width="$o"/>
  <use href="#$id" stroke="$body" stroke-width="$weight"/>
  <g mask="url(#$mk)"><use href="#$id" stroke="#ffffff" stroke-opacity=".6" stroke-width="3.5" transform="translate(-5 -6)"/><use href="#$id" stroke="#2a0d00" stroke-opacity=".28" stroke-width="3.5" transform="translate(6 7)"/></g>
</g>
"@
}

# ---------- the crest: a shield with a gold rim, a reticle and a star ----------
$star = 'M120 94 L128.52 116.27 L152.34 117.49 L133.79 132.48 L139.99 155.51 L120 142.5 L100.01 155.51 L106.21 132.48 L87.66 117.49 L111.48 116.27 Z'
$shield = 'M120 8 L214 40 L214 128 C214 184 172 226 120 252 C68 226 26 184 26 128 L26 40 Z'
$crestDefs = @'
<linearGradient id="rimG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".35" stop-color="#ffc83a"/><stop offset=".75" stop-color="#e08a12"/><stop offset="1" stop-color="#8a4a08"/></linearGradient>
<linearGradient id="rim2G" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a5a0c"/><stop offset=".5" stop-color="#6a3406"/><stop offset="1" stop-color="#d98b13"/></linearGradient>
<radialGradient id="faceG" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="#3a3fb0"/><stop offset=".45" stop-color="#1a1f6a"/><stop offset="1" stop-color="#080b2a"/></radialGradient>
<linearGradient id="starG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbd0"/><stop offset=".45" stop-color="#ffd54a"/><stop offset="1" stop-color="#ee9a10"/></linearGradient>
<linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c8fdff"/><stop offset="1" stop-color="#27bfe8"/></linearGradient>
<clipPath id="faceClip"><path d="M120 22 L202 50 L202 127 C202 177 166 214 120 238 C74 214 38 177 38 127 L38 50 Z"/></clipPath>
'@
function Crest() {
  return @"
<g id="crest">
  <path d="$shield" fill="#02041a" opacity=".55" transform="translate(0 8)" filter="url(#soft)"/>
  <path d="$shield" fill="url(#rimG)"/>
  <path d="M120 16 L206 45 L206 127 C206 180 168 219 120 243 C72 219 34 180 34 127 L34 45 Z" fill="url(#rim2G)"/>
  <path d="M120 22 L202 50 L202 127 C202 177 166 214 120 238 C74 214 38 177 38 127 L38 50 Z" fill="url(#faceG)"/>
  <g clip-path="url(#faceClip)">
    <path d="M30 40 L130 6 L30 150 Z" fill="#ffffff" opacity=".07"/>
    <ellipse cx="120" cy="128" rx="74" ry="74" fill="#35f0ff" opacity=".10" filter="url(#glow)"/>
  </g>
  <path d="M120 22 L202 50 L202 127 C202 177 166 214 120 238 C74 214 38 177 38 127 L38 50 Z" fill="none" stroke="#35f0ff" stroke-opacity=".55" stroke-width="2"/>
  <g fill="none" stroke="url(#ringG)" stroke-width="6.5" stroke-linecap="butt">
    <path d="M177.78 133.05 A58 58 0 0 1 125.05 185.78"/><path d="M114.95 185.78 A58 58 0 0 1 62.22 133.05"/>
    <path d="M62.22 122.95 A58 58 0 0 1 114.95 70.22"/><path d="M125.05 70.22 A58 58 0 0 1 177.78 122.95"/>
    <path d="M120 54 V78 M186 128 H162 M120 202 V178 M54 128 H78"/>
  </g>
  <path d="$star" fill="#ffc83a" opacity=".55" filter="url(#glow)"/>
  <path d="$star" fill="url(#starG)" stroke="#9a5a0c" stroke-width="2" stroke-linejoin="round"/>
  <path d="M120 94 L128.52 116.27 L120 128 L111.48 116.27 Z M120 128 L133.79 132.48 L139.99 155.51 Z M120 128 L106.21 132.48 L100.01 155.51 Z" fill="#fff" opacity=".28"/>
  <g fill="none" stroke="#ffd54a" stroke-width="5.5" stroke-linejoin="miter">
    <path d="M92 203 L120 217 L148 203"/><path d="M100 218 L120 228 L140 218" opacity=".85"/>
  </g>
</g>
"@
}

# ---------- files ----------
function Svg($w, $h, $inner, $extraDefs) { return "<svg xmlns=`"http://www.w3.org/2000/svg`" xmlns:xlink=`"http://www.w3.org/1999/xlink`" width=`"$w`" height=`"$h`" viewBox=`"0 0 $w $h`"><defs>`n$extraDefs</defs>`n$inner`n</svg>`n" }
$allDefs = $paint + $crestDefs

# 1. the crest alone (240 x 260)
$emblem = Svg 240 260 (Crest) $allDefs
[IO.File]::WriteAllText((Join-Path $brand 'emblem.svg'), $emblem, $utf8)

# 2. the stacked lockup: crest on the left, LAST / SQUAD / STANDING on the right
$sq = $wSquad.w; $bodyX = 262; $sqW = $sq * 1.0 + 16
$lastS = 0.42; $lastW = $wLast.w * $lastS; $stS = $sqW / ($wStanding.w + 24) * 0.97
$lockInner = @"
<g transform="translate(0 4)">$(Crest)</g>
<g transform="translate($bodyX 0)">
  <g stroke="url(#cy)" stroke-width="3" stroke-linecap="round"><path d="M10 26 H$(N (($sqW - $lastW) / 2 - 16))" opacity=".9"/><path d="M$(N (($sqW + $lastW) / 2 + 16)) 26 H$(N ($sqW - 6))" opacity=".9"/></g>
$(WordArt 'wLAST' (($sqW - $lastW) / 2 + 6) 6 $lastS 'url(#cy)' 22)
$(WordArt 'wSQUAD' 12 68 1.0 'url(#gold)' 24)
$(WordArt 'wSTANDING' 14 196 $stS 'url(#ice)' 24)
</g>
"@
$lockup = Svg ($bodyX + [int]$sqW + 24) 276 ($lockInner) ($allDefs + $defs.ToString() + $wSquad.svg + $wStanding.svg + $wLast.svg + $masks)
[IO.File]::WriteAllText((Join-Path $brand 'logo.svg'), $lockup, $utf8)

# 3. app icons: the crest on a deep blue tile (rounded for "any", full square for "maskable" and the iPhone)
$tileDefs = $allDefs + '<radialGradient id="tile" cx=".5" cy=".3" r=".9"><stop offset="0" stop-color="#2b2f8f"/><stop offset=".55" stop-color="#101550"/><stop offset="1" stop-color="#060926"/></radialGradient><linearGradient id="tileShine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>'
function Tile($size, $round, $k) {
  $s = $size / 512.0; $cw = 240 * $k * $s; $ch = 260 * $k * $s; $tx = ($size - $cw) / 2; $ty = ($size - $ch) / 2 + 6 * $s
  $r = if ($round) { 112 * $s } else { 0 }
  return Svg $size $size @"
<rect width="$size" height="$size" rx="$(N $r)" fill="url(#tile)"/>
<rect width="$size" height="$size" rx="$(N $r)" fill="url(#tileShine)"/>
<ellipse cx="$(N ($size / 2))" cy="$(N ($size * 0.52))" rx="$(N ($size * 0.36))" ry="$(N ($size * 0.36))" fill="#35f0ff" opacity=".13" filter="url(#glow)"/>
<g transform="translate($(N $tx) $(N $ty)) scale($(N ($k * $s)))">$(Crest)</g>
"@ $tileDefs
}
[IO.File]::WriteAllText((Join-Path $brand 'icon.svg'), (Tile 512 $true 1.62), $utf8)
[IO.File]::WriteAllText((Join-Path $brand 'icon-maskable.svg'), (Tile 512 $false 1.12), $utf8)

# 4. the picture that shows when the link is shared (1200 x 630)
$ogDefs = $allDefs + $defs.ToString() + $wSquad.svg + $wStanding.svg + $wLast.svg + $masks + '<linearGradient id="ogbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070b2e"/><stop offset=".5" stop-color="#2a1262"/><stop offset="1" stop-color="#0a1038"/></linearGradient><radialGradient id="ogglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#35f0ff" stop-opacity=".28"/><stop offset="1" stop-color="#35f0ff" stop-opacity="0"/></radialGradient>'
$og = Svg 1200 630 @"
<rect width="1200" height="630" fill="url(#ogbg)"/>
<ellipse cx="410" cy="300" rx="420" ry="300" fill="url(#ogglow)"/>
<g stroke="#ffffff" stroke-opacity=".05" stroke-width="2"><path d="M0 520 L1200 380 M0 580 L1200 440 M0 120 L1200 -20"/></g>
<g transform="translate(150 92) scale(1.28)">$($lockInner)</g>
<text x="600" y="565" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="600" fill="#cfe9ff" fill-opacity=".92" letter-spacing="1">Parachute in. Loot up. Be the last squad standing.</text>
<text x="600" y="605" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="600" fill="#ffd54a" fill-opacity=".92" letter-spacing="2">Created by DCeator</text>
"@ $ogDefs
[IO.File]::WriteAllText((Join-Path $brand 'og-image.svg'), $og, $utf8)
Write-Host 'SVG files written to' $brand

# ---------- PNG files, drawn by the browser that is already on this machine ----------
if ($NoPng) { return }
$browser = @('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Google\Chrome\Application\chrome.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Warning 'No Edge / Chrome found: the PNG files were not made'; return }
$tmp = Join-Path $env:TEMP 'lss-logo'; if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }; New-Item -ItemType Directory -Force -Path $tmp | Out-Null
function Shot($svgFile, $w, $h, $dest, $transparent = $true) {
  $html = Join-Path $tmp ([IO.Path]::GetFileNameWithoutExtension($dest) + '.html'); $png = Join-Path $tmp ([IO.Path]::GetFileName($dest))
  $uri = 'file:///' + ($svgFile -replace '\\', '/')
  [IO.File]::WriteAllText($html, "<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:transparent}img{display:block;width:${w}px;height:${h}px}</style><img src=`"$uri`">", $utf8)
  $a = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', "--screenshot=$png", "--window-size=$w,$h")
  if ($transparent) { $a += '--default-background-color=00000000' }
  $a += ('file:///' + ($html -replace '\\', '/'))
  & $browser $a | Out-Null
  $sw = [Diagnostics.Stopwatch]::StartNew(); while (-not (Test-Path $png) -and $sw.Elapsed.TotalSeconds -lt 20) { Start-Sleep -Milliseconds 200 }
  if (Test-Path $png) { Copy-Item $png $dest -Force; Write-Host ('  {0}  {1}x{2}' -f (Split-Path $dest -Leaf), $w, $h) } else { Write-Warning "no picture for $dest" }
}
$i = Join-Path $brand 'icon.svg'; $m = Join-Path $brand 'icon-maskable.svg'; $e = Join-Path $brand 'emblem.svg'
Shot $i 512 512 (Join-Path $icons 'icon-512.png'); Shot $i 192 192 (Join-Path $icons 'icon-192.png')
Shot $m 512 512 (Join-Path $icons 'icon-maskable-512.png') $false; Shot $m 180 180 (Join-Path $icons 'apple-touch-icon.png') $false
Shot $e 32 35 (Join-Path $icons 'favicon-32.png'); Shot $e 96 104 (Join-Path $icons 'favicon-96.png')
Shot (Join-Path $brand 'logo.svg') 1024 ([int][math]::Round(1024 * 276 / ($bodyX + [int]$sqW + 24))) (Join-Path $brand 'logo.png')
Shot (Join-Path $brand 'og-image.svg') 1200 630 (Join-Path $brand 'og-image.png') $false
Remove-Item $tmp -Recurse -Force
