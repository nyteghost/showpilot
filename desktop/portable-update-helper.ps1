# ShowPilot portable update helper. This file is copied from the installed app
# into the user's private local data folder. It never runs with admin rights.
# Mode Stage extracts a validated ZIP while ShowPilot is still running.
# Mode Install swaps adjacent directories after ShowPilot closes and retains the
# previous application folder for rollback. No work data or backups are deleted.
param(
  [Parameter(Mandatory=$true)][ValidateSet('Stage','Install')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$InstallDir,
  [Parameter(Mandatory=$true)][string]$StageDir,
  [string]$ArchivePath = '',
  [string]$BackupDir = '',
  [int]$AppProcessId = 0,
  [string]$LogPath = ''
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Write-UpdateLog([string]$message) {
  if (-not $LogPath) { return }
  try { Add-Content -LiteralPath $LogPath -Value ("$(Get-Date -Format o) "+$message) -Encoding UTF8 } catch {}
}
function Safe-Root([string]$folder) {
  return [System.IO.Path]::GetFullPath($folder).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}
function Require-SiblingDirectories {
  $installRoot=Safe-Root $InstallDir
  $stagingRoot=Safe-Root $StageDir
  $parent=[System.IO.Path]::GetDirectoryName($installRoot)
  if (-not $parent -or
      -not [string]::Equals([System.IO.Path]::GetDirectoryName($stagingRoot),$parent,[StringComparison]::OrdinalIgnoreCase) -or
      -not [System.IO.Path]::GetFileName($stagingRoot).StartsWith('.showpilot-next-',[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Update staging must be a dedicated sibling of the ShowPilot installation.'
  }
  if ($Mode -eq 'Install') {
    $backupRoot=Safe-Root $BackupDir
    if (-not [string]::Equals([System.IO.Path]::GetDirectoryName($backupRoot),$parent,[StringComparison]::OrdinalIgnoreCase) -or
        -not [System.IO.Path]::GetFileName($backupRoot).StartsWith('.showpilot-previous-',[StringComparison]::OrdinalIgnoreCase)) {
      throw 'Update backup must be a dedicated sibling of the ShowPilot installation.'
    }
  }
}
function Require-Executable([string]$root) {
  $exe=Join-Path $root 'ShowPilot.exe'
  $appBundle=Join-Path $root 'resources\app.asar'
  if (-not (Test-Path -LiteralPath $exe -PathType Leaf) -or
      -not (Test-Path -LiteralPath $appBundle -PathType Leaf) -or
      (Get-Item -LiteralPath $exe).Length -lt 100000 -or
      (Get-Item -LiteralPath $appBundle).Length -lt 10000) {
    throw 'Extracted package is not a complete ShowPilot Windows portable build.'
  }
}
function Stage-Zip {
  if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) { throw 'Downloaded ZIP is missing.' }
  if (-not (Test-Path -LiteralPath $StageDir -PathType Container)) { throw 'Update staging directory is missing.' }
  $root=(Safe-Root $StageDir)+[System.IO.Path]::DirectorySeparatorChar
  $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $archive=[System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
  try {
    if ($archive.Entries.Count -gt 12000) { throw 'ZIP contains too many entries.' }
    [long]$total=0
    foreach ($entry in $archive.Entries) {
      $raw=$entry.FullName.Replace('\','/')
      if ([string]::IsNullOrWhiteSpace($raw)) { throw 'ZIP contains an empty path.' }
      if ($raw.StartsWith('/') -or $raw.Contains(':') -or
          $raw.Split('/') -contains '..' -or $raw.Split('/') -contains '.' -or
          $raw.Contains([char]0)) { throw 'ZIP contains an unsafe path.' }
      $isFolder=$raw.EndsWith('/')
      $name=$raw.TrimEnd('/')
      $parts=$name.Split('/')
      if ($parts | Where-Object { -not $_ -or $_.EndsWith(' ') -or $_.EndsWith('.') }) {
        throw 'ZIP contains an ambiguous Windows filename.'
      }
      if (-not $seen.Add($name)) { throw 'ZIP contains conflicting entry paths.' }
      $unixType=($entry.ExternalAttributes -shr 16) -band 0xF000
      if ($unixType -eq 0xA000 -or ($entry.ExternalAttributes -band 0x400) -ne 0) {
        throw 'ZIP contains a symbolic link or reparse point.'
      }
      $destination=[System.IO.Path]::GetFullPath((Join-Path $StageDir $name.Replace('/',[System.IO.Path]::DirectorySeparatorChar)))
      if (-not $destination.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'ZIP entry escapes its staging directory.'
      }
      if ($isFolder) {
        [System.IO.Directory]::CreateDirectory($destination) | Out-Null
        continue
      }
      if ($entry.Length -lt 0 -or $entry.Length -gt 1073741824) { throw 'ZIP file is too large.' }
      if ($entry.CompressedLength -eq 0 -and $entry.Length -gt 0) { throw 'Invalid ZIP compression size.' }
      if ($entry.CompressedLength -gt 0 -and $entry.Length / $entry.CompressedLength -gt 600) {
        throw 'ZIP expansion ratio exceeds safety limit.'
      }
      $total += $entry.Length
      if ($total -gt 2147483648) { throw 'ZIP expands beyond 2 GB.' }
      [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($destination)) | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination,$false)
    }
  } finally { $archive.Dispose() }
  Require-Executable $StageDir
  Write-UpdateLog 'Staged ZIP passed path, size and executable checks.'
}
function Install-Zip {
  if (-not $BackupDir -or -not $AppProcessId) { throw 'Missing restart information.' }
  if (-not (Test-Path -LiteralPath $InstallDir -PathType Container)) { throw 'Original installation was not found.' }
  if (Test-Path -LiteralPath $BackupDir) { throw 'Previous-version backup destination already exists.' }
  Require-Executable $StageDir
  # Wait for the old executable to release Windows file locks. The helper's
  # working directory is outside the app, so it does not hold the old folder open.
  $closed=$false
  for ($i=0;$i -lt 120;$i++) {
    if (-not (Get-Process -Id $AppProcessId -ErrorAction SilentlyContinue)) { $closed=$true;break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $closed) { throw 'ShowPilot did not exit; no files were replaced.' }
  $movedOld=$false
  $installedNew=$false
  try {
    for ($i=0;$i -lt 20;$i++) {
      try {
        [System.IO.Directory]::Move($InstallDir,$BackupDir)
        $movedOld=$true
        break
      } catch {
        if ($i -eq 19) { throw }
        Start-Sleep -Milliseconds 500
      }
    }
    [System.IO.Directory]::Move($StageDir,$InstallDir)
    $installedNew=$true
    Require-Executable $InstallDir
    $appProcess=Start-Process -FilePath (Join-Path $InstallDir 'ShowPilot.exe') -WorkingDirectory $InstallDir -PassThru
    Start-Sleep -Seconds 4
    $appProcess.Refresh()
    if ($appProcess.HasExited) { throw 'Updated ShowPilot exited immediately after launch.' }
    Write-UpdateLog 'New version started. Previous executable folder retained for manual rollback.'
  } catch {
    Write-UpdateLog ('New-version launch/swap failed: '+$_.Exception.Message)
    if ($movedOld) {
      if ($installedNew -and (Test-Path -LiteralPath $InstallDir)) {
        $failedDir=$StageDir+'-failed'
        try {[System.IO.Directory]::Move($InstallDir,$failedDir)}catch{}
      }
      if (-not (Test-Path -LiteralPath $InstallDir) -and (Test-Path -LiteralPath $BackupDir)) {
        try {
          [System.IO.Directory]::Move($BackupDir,$InstallDir)
          Start-Process -FilePath (Join-Path $InstallDir 'ShowPilot.exe') -WorkingDirectory $InstallDir | Out-Null
          Write-UpdateLog 'Rolled back and restarted the previous ShowPilot version.'
        } catch {Write-UpdateLog ('Rollback failed: '+$_.Exception.Message)}
      }
    }
    throw
  }
}
try {
  Require-SiblingDirectories
  if ($Mode -eq 'Stage') { Stage-Zip } else { Install-Zip }
  exit 0
} catch {
  Write-UpdateLog ('Update '+$Mode+' failed: '+$_.Exception.Message)
  Write-Error $_.Exception.Message
  exit 1
}
