<#
  Trims a GLB: keeps only the animations and / or meshes you name, drops the rest and compacts the binary data (nothing to install: it compiles tools\LodTool.cs on the fly).
  Made for animated character packs where every file carries 70+ animations: keep one animation file for everybody and strip the characters.

  powershell -File tools\prune-glb.ps1 -In Knight.glb -Out assets\models\chars\Knight.glb -KeepAnims none -KeepMeshes Knight_
  powershell -File tools\prune-glb.ps1 -In Knight.glb -Out assets\models\chars\anims.glb  -KeepAnims Idle,Running_A,Death_A -KeepMeshes none -DropMaterials

  -KeepAnims   all | none | comma separated clip names
  -KeepMeshes  all | none | comma separated name prefixes of the mesh nodes to keep (Knight_ keeps Knight_Body, Knight_Head ... and drops the swords and shields)
#>
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$KeepAnims = 'all',
  [string]$KeepMeshes = 'all',
  [switch]$DropMaterials
)
$ErrorActionPreference = 'Stop'
if (-not ('Lss.GlbPrune' -as [type])) {
  Add-Type -ReferencedAssemblies 'System.Web.Extensions' -TypeDefinition (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'LodTool.cs'))
}
$norm = { param($v) if ($v -eq 'all') { $null } elseif ($v -eq 'none') { '' } else { $v } }
$src = (Resolve-Path -LiteralPath $In).Path
New-Item -ItemType Directory -Force (Split-Path -Parent $Out) | Out-Null
Write-Output ([Lss.GlbPrune]::Run($src, [IO.Path]::GetFullPath($Out), (& $norm $KeepAnims), (& $norm $KeepMeshes), [bool]$DropMaterials))
