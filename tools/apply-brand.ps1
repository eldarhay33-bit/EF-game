# Copies the game's name, texts and picture paths from src/core/brand.js (the one place to edit) into the files that cannot read it:
#   index.html (the block between <!--brand:head ...--> and <!--/brand:head-->, and the two logo pictures), manifest.webmanifest, sw.js (the list of files kept for the offline start).
#   powershell -File tools\apply-brand.ps1           (writes the files)
#   powershell -File tools\apply-brand.ps1 -Check    (only reports files that are out of step with brand.js; exit code 1 when there are any)
# tools\release.ps1 runs it first, so a release can never carry a name that differs between the page, the manifest and the game.
param([switch]$Check)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$utf8 = New-Object Text.UTF8Encoding($false)
$m = [regex]::Match([IO.File]::ReadAllText((Join-Path $root 'src\core\brand.js'), $utf8), 'const BRAND = (\{.*?\r?\n\});', 'Singleline')
if (-not $m.Success) { throw 'src/core/brand.js: the BRAND object was not found' }
$b = $m.Groups[1].Value | ConvertFrom-Json
foreach ($k in 'name', 'short', 'author', 'description', 'share', 'themeColor', 'logo', 'emblem', 'ogImage') { if (-not $b.$k) { throw "brand.js: '$k' is missing" } }
foreach ($k in 'favicon', 'small', 'large', 'maskable', 'apple') { if (-not $b.icons.$k) { throw "brand.js: icons.$k is missing" } }
foreach ($p in (@($b.logo, $b.emblem, $b.ogImage) + @($b.icons.PSObject.Properties | ForEach-Object { $_.Value }))) { if (-not (Test-Path -LiteralPath (Join-Path $root $p))) { throw "brand.js points at a picture that does not exist: $p" } }
function HtmlEnc($s) { [Net.WebUtility]::HtmlEncode([string]$s) }
function JsonStr($s) { '"' + ([string]$s).Replace('\', '\\').Replace('"', '\"') + '"' }
$drift = @()
function Put($rel, $old, $new, $nl) {
  $new = $new.Replace("`r`n", "`n").Replace("`n", $nl)
  if ($new -ceq $old) { return }
  $drift += $rel
  if (-not $Check) { [IO.File]::WriteAllText((Join-Path $root $rel), $new, $utf8); Write-Host ("  {0,-22} updated" -f $rel) }
  $script:drift = $drift
}

# ---------- index.html ----------
$f = Join-Path $root 'index.html'; $old = [IO.File]::ReadAllText($f, $utf8); $nl = if ($old.Contains("`r`n")) { "`r`n" } else { "`n" }
$block = @"
<!--brand:head (written by tools/apply-brand.ps1 from src/core/brand.js: edit that file, not these lines)-->
<title>$(HtmlEnc $b.name)</title>
<meta name="description" content="$(HtmlEnc $b.description)">
<meta name="author" content="$(HtmlEnc $b.author)">
<meta name="theme-color" content="$(HtmlEnc $b.themeColor)">
<link rel="icon" type="image/svg+xml" href="$(HtmlEnc $b.emblem)">
<link rel="icon" type="image/png" sizes="32x32" href="$(HtmlEnc $b.icons.favicon)">
<link rel="icon" type="image/png" sizes="192x192" href="$(HtmlEnc $b.icons.small)">
<link rel="apple-touch-icon" href="$(HtmlEnc $b.icons.apple)">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="$(HtmlEnc $b.short)">
<meta property="og:type" content="website">
<meta property="og:title" content="$(HtmlEnc $b.name)">
<meta property="og:description" content="$(HtmlEnc $b.share)">
<meta property="og:image" content="$(HtmlEnc $b.ogImage)">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="$(HtmlEnc $b.ogImage)">
<!--/brand:head-->
"@
$block = $block.TrimEnd().Replace("`r`n", "`n")
$re = '<!--brand:head.*?<!--/brand:head-->'
if (-not [regex]::IsMatch($old, $re, 'Singleline')) { throw 'index.html: the <!--brand:head--> markers are missing' }
$new = [regex]::Replace($old, $re, [Text.RegularExpressions.MatchEvaluator] { param($x) $block.Replace("`n", $nl) }, 'Singleline')
foreach ($cls in 'brandLogo', 'rotLogo') {
  $new = [regex]::Replace($new, '(class="' + $cls + '" src=")[^"]*(" alt=")[^"]*(")', [Text.RegularExpressions.MatchEvaluator] { param($x) $x.Groups[1].Value + (HtmlEnc $b.logo) + $x.Groups[2].Value + (HtmlEnc $b.name) + $x.Groups[3].Value })
}
Put 'index.html' $old $new $nl

# ---------- manifest.webmanifest ----------
$f = Join-Path $root 'manifest.webmanifest'; $old = [IO.File]::ReadAllText($f, $utf8); $nl = if ($old.Contains("`r`n")) { "`r`n" } else { "`n" }
$new = @"
{
  "id": "./",
  "name": $(JsonStr $b.name),
  "short_name": $(JsonStr $b.short),
  "description": $(JsonStr $b.share),
  "lang": "en",
  "dir": "ltr",
  "start_url": "./index.html",
  "scope": "./",
  "display": "fullscreen",
  "display_override": ["fullscreen", "standalone"],
  "orientation": "landscape",
  "background_color": $(JsonStr $b.themeColor),
  "theme_color": $(JsonStr $b.themeColor),
  "categories": ["games", "entertainment"],
  "icons": [
    { "src": $(JsonStr $b.icons.small), "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": $(JsonStr $b.icons.large), "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": $(JsonStr $b.icons.maskable), "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": $(JsonStr $b.emblem), "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}

"@
Put 'manifest.webmanifest' $old $new $nl

# ---------- sw.js ----------
$f = Join-Path $root 'sw.js'; $old = [IO.File]::ReadAllText($f, $utf8); $nl = if ($old.Contains("`r`n")) { "`r`n" } else { "`n" }
$shell = "const SHELL = ['./', 'index.html', 'css/main.css', 'css/v3.css', 'css/phone.css', 'manifest.webmanifest', '$($b.icons.small)', '$($b.logo)', '$($b.emblem)'];"
if (-not [regex]::IsMatch($old, 'const SHELL = \[[^\]]*\];')) { throw 'sw.js: the SHELL list was not found' }
$new = [regex]::Replace($old, 'const SHELL = \[[^\]]*\];', [Text.RegularExpressions.MatchEvaluator] { param($x) $shell })
Put 'sw.js' $old $new $nl

if ($drift.Count -eq 0) { Write-Host 'brand: index.html, manifest.webmanifest and sw.js already match src/core/brand.js' }
elseif ($Check) { Write-Host ('brand: out of step with src/core/brand.js: ' + ($drift -join ', ')); exit 1 }
