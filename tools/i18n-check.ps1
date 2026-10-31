# Lists translation keys that are used in the code (or in the other language files) but missing from a language dictionary.
# Usage: powershell -File tools\i18n-check.ps1 [-Lang he] [-Max 80]
param([string]$Lang = 'en', [int]$Max = 120)
$root = Split-Path -Parent $PSScriptRoot
$prefixes = 'ach|board|ch|ctl|diff|duel|eff|equip|item|locker|map|mission|mode|play|profile|set|shop|tab|toast|tut|ui|view|wallet|friends|social|net|online|hud|hint|zone|use|msg|prompt|feed|bike|banner|weapon|wmode|rarity|sight|ammo|throw|tod|poi|skin|load|pause|end|lobby|party|invite|chat|lang|party|pad|cat'
$files = Get-ChildItem -Recurse -File -Include *.js,*.html (Join-Path $root 'src'), (Join-Path $root 'index.html') | Where-Object { $_.FullName -notmatch '\\lang\\' }
$quote = '[''"`]'
$re = [regex]($quote + '((?:' + $prefixes + ')\.[\w.\-]*[\w\-])' + $quote)
$used = @{}
foreach ($f in $files) {
  $txt = [System.IO.File]::ReadAllText($f.FullName)
  foreach ($m in $re.Matches($txt)) { $used[$m.Groups[1].Value] = $f.Name }
}
# keys with dynamic suffixes are checked through their generators below
$dyn = New-Object System.Collections.Generic.List[string]
foreach ($t in 'play','locker','shop','challenges','board','friends','controls','settings') { $dyn.Add("tab.$t") }
foreach ($a in 'move','look','fire','aim','jump','crouch','sprint','reload','interact','slots','nade','heal','shield','view','map','pause') { $dyn.Add("ctl.$a") }
foreach ($a in 'all','special','done') { $dyn.Add("ch.f.$a") }
foreach ($k in 'br','duel','online') { $dyn.Add("mode.$k"); $dyn.Add("mode.$k.d") }
$ids = [System.IO.File]::ReadAllText((Join-Path $root 'src\core\catalog.js'))
foreach ($m in [regex]::Matches($ids, "\{ id: '(\w+)', stat: '\w+', (?:kind: '\w+', )?goals:")) { $dyn.Add('ach.' + $m.Groups[1].Value + '.n'); $dyn.Add('ach.' + $m.Groups[1].Value + '.d') }
foreach ($m in [regex]::Matches($ids, "\{ id: '(\w+)', stat: '\w+', (?:kind: '\w+', )?g:")) { $dyn.Add('mission.' + $m.Groups[1].Value) }
foreach ($m in [regex]::Matches($ids, "\{ id: '(\w+)', type: '(?:br|duel)'")) { $dyn.Add('map.' + $m.Groups[1].Value); $dyn.Add('map.' + $m.Groups[1].Value + '.d') }
$sk = [System.IO.File]::ReadAllText((Join-Path $root 'src\entities\skins.js'))
foreach ($m in [regex]::Matches($sk, "id: '(\w+)'")) { $dyn.Add('skin.' + $m.Groups[1].Value) }
foreach ($d in $dyn) { if (-not $used.ContainsKey($d)) { $used[$d] = '(generated)' } }
$dictFile = Join-Path $root "src\core\lang\$Lang.js"
$dict = [System.IO.File]::ReadAllText($dictFile)
$have = @{}
foreach ($m in [regex]::Matches($dict, "'([\w.\-]+)'\s*:")) { $have[$m.Groups[1].Value] = 1 }
$en = [System.IO.File]::ReadAllText((Join-Path $root 'src\core\lang\en.js'))
$enKeys = @{}
foreach ($m in [regex]::Matches($en, "'([\w.\-]+)'\s*:")) { $enKeys[$m.Groups[1].Value] = 1 }
$all = @{}; foreach ($k in $used.Keys) { $all[$k] = $used[$k] }; if ($Lang -ne 'en') { foreach ($k in $enKeys.Keys) { $all[$k] = 'en.js' } }
$missing = $all.Keys | Where-Object { -not $have.ContainsKey($_) -and -not $_.EndsWith('.') } | Sort-Object
Write-Output ("{0}: {1} keys needed, {2} defined, {3} missing" -f $Lang, $all.Count, $have.Count, @($missing).Count)
$missing | Select-Object -First $Max | ForEach-Object { "$_  <- $($all[$_])" }
