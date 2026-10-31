# Tests the update mechanism end to end: opens the game from a local copy of the project that is served on port 8083 (the real Edge, headless, driven over the DevTools protocol), releases a new version in that copy and checks that the page updates itself.
# How: copy the project to a temp folder, serve it (powershell -File <folder above the project>\_serve.ps1 -Root <copy> -Port 8083), then:  powershell -File tools\test-update.ps1 -Site <copy> -Release <copy>\tools\release.ps1
param([string]$Site, [string]$Url = 'http://localhost:8083/index.html?sw=1', [string]$NewVersion = '4.3.0', [string]$Release)
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ud = Join-Path $env:TEMP 'lss-edge-cdp'; if (Test-Path $ud) { Remove-Item $ud -Recurse -Force }
$ep = Start-Process -FilePath $edge -ArgumentList @('--headless=new', '--remote-debugging-port=9333', "--user-data-dir=$ud", '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', 'about:blank') -PassThru
try {
  $tg = $null; for ($i = 0; $i -lt 30 -and -not $tg; $i++) { Start-Sleep -Milliseconds 500; try { $tg = (Invoke-RestMethod 'http://localhost:9333/json' -TimeoutSec 3) | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 } catch { } }
  $ws = New-Object Net.WebSockets.ClientWebSocket; $ws.ConnectAsync([Uri]$tg.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
  $script:id = 0
  function Recv() { $buf = New-Object byte[] 262144; $sb = New-Object Text.StringBuilder; do { $seg = New-Object ArraySegment[byte] (, $buf); $r = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None).Result; [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)) } while (-not $r.EndOfMessage); return $sb.ToString() }
  function Cdp($method, $params = @{}) {
    $script:id++; $my = $script:id; $msg = @{ id = $my; method = $method; params = $params } | ConvertTo-Json -Depth 8 -Compress
    $b = [Text.Encoding]::UTF8.GetBytes($msg); $ws.SendAsync((New-Object ArraySegment[byte] (, $b)), 'Text', $true, [Threading.CancellationToken]::None).Wait()
    while ($true) { $t = Recv; $o = $t | ConvertFrom-Json; if ($o.id -eq $my) { return $o } }
  }
  function Ev($expr) { $r = Cdp 'Runtime.evaluate' @{ expression = $expr; awaitPromise = $true; returnByValue = $true }; if ($r.result.exceptionDetails) { return 'EXC ' + $r.result.exceptionDetails.text + ' ' + $r.result.exceptionDetails.exception.description } return ($r.result.result.value | ConvertTo-Json -Compress -Depth 6) }
  function WaitMenu($sec) { for ($i = 0; $i -lt $sec; $i++) { Start-Sleep -Seconds 1; $v = Ev "(typeof G !== 'undefined' && G.state === 'menu' && typeof Updater !== 'undefined' && Updater.current) || ''"; if ($v -and $v -ne '""' -and $v -notlike 'EXC*') { return $v } } return 'timeout' }
  [void](Cdp 'Runtime.enable'); [void](Cdp 'Page.enable')
  [void](Cdp 'Page.navigate' @{ url = $Url })
  'A. first load, game ready: ' + (WaitMenu 150)
  'A. state: ' + (Ev "(async()=>({ver: window.GAME_VERSION, title: document.title, ctl: !!navigator.serviceWorker.controller, caches: await caches.keys(), swCtl: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL}))()")
  Start-Sleep -Seconds 4
  'A2. after the worker took over: ' + (Ev "(async()=>({ctl: !!navigator.serviceWorker.controller, caches: await caches.keys(), shell: (await (await caches.open('lss-v' + window.GAME_VERSION.replace(/\.0$/, ''))).keys()).length}))()")
  'B. releasing ' + $NewVersion + ' on the server...'
  & powershell -NoProfile -File $Release -Version $NewVersion | Select-Object -Last 1
  'C. check: ' + (Ev "Updater.check()")
  Start-Sleep -Seconds 1
  'C. pending: ' + (Ev "({pending: Updater.pending, latest: Updater.latest, status: Updater.status})")
  'D. waiting for the page to reload itself (lobby is showing)...'
  Start-Sleep -Seconds 6
  'D. game ready again: ' + (WaitMenu 150)
  'D. state: ' + (Ev "(async()=>({ver: window.GAME_VERSION, title: document.title, caches: await caches.keys(), pending: Updater.pending, ctl: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL}))()")
  'E. second check (must say latest): ' + (Ev "Updater.check()")
} finally { try { $ws.Dispose() } catch { }; Stop-Process -Id $ep.Id -Force -ErrorAction SilentlyContinue; Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-6) -and $_.CommandLine -like '*lss-edge-cdp*' } | Stop-Process -Force -ErrorAction SilentlyContinue }
