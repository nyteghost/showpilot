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
  [string]$ExpectedVersion = '',
  [string]$LogPath = '',
  [switch]$SmokeTestNoRelaunch
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Write-UpdateLog([string]$message) {
  if (-not $LogPath) { return }
  try { Add-Content -LiteralPath $LogPath -Value ("$(Get-Date -Format o) "+$message) -Encoding UTF8 } catch {}
}
function Write-UpdateResult([string]$status,[string]$message) {
  if (-not $LogPath) { return }
  try {
    $folder=[System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($LogPath))
    [System.IO.Directory]::CreateDirectory($folder) | Out-Null
    $target=Join-Path $folder 'last-update-result.json'
    $temp=$target+'.tmp'
    $payload=@{
      status=$status
      message=$message
      updated=(Get-Date -Format o)
      version=$ExpectedVersion
    } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($temp,$payload,[System.Text.Encoding]::UTF8)
    [System.IO.File]::Copy($temp,$target,$true)
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
  } catch { Write-UpdateLog ('Could not persist update result: '+$_.Exception.Message) }
}
function Running-ShowPilotProcesses {
  # Electron has a browser process, GPU process, renderer and utility children.
  # The previous helper only waited for the original PID, leaving children
  # holding executable/DLL locks on the old installation directory.
  $root=(Safe-Root $InstallDir)+[System.IO.Path]::DirectorySeparatorChar
  $list=@()
  foreach($proc in @(Get-Process -Name 'ShowPilot' -ErrorAction SilentlyContinue)) {
    try {
      $exe=$proc.Path
      if ($exe -and $exe.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) {
        $list+= $proc
      }
    } catch {}
  }
  return @($list)
}
function Wait-For-Old-App {
  Write-UpdateLog ('Waiting for all ShowPilot browser/GPU/renderer processes to exit (main PID '+$AppProcessId+').')
  for ($i=0;$i -lt 180;$i++) {
    $main=(Get-Process -Id $AppProcessId -ErrorAction SilentlyContinue)
    $children=@(Running-ShowPilotProcesses)
    if (-not $main -and $children.Count -eq 0) {
      Write-UpdateLog 'All original ShowPilot processes have exited.'
      return
    }
    Start-Sleep -Milliseconds 500
  }
  $remaining=@(Running-ShowPilotProcesses)
  $parentStillRunning=$null -ne (Get-Process -Id $AppProcessId -ErrorAction SilentlyContinue)
  Write-UpdateLog ('Timed out waiting: remaining app processes='+$remaining.Count+', original PID still present='+$parentStillRunning+'.')
  throw 'ShowPilot did not fully exit (browser/GPU/renderer process lock). No app folder was replaced. Close all ShowPilot windows and check the update log.'
}
function Launch-ShowPilot([string]$directory) {
  $exe=Join-Path $directory 'ShowPilot.exe'
  if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw ('Cannot find ShowPilot.exe for restart at '+$directory)
  }
  Write-UpdateLog 'Starting the newly installed ShowPilot.exe.'
  $appProcess=Start-Process -FilePath $exe -WorkingDirectory $directory -PassThru
  Start-Sleep -Seconds 4
  $appProcess.Refresh()
  # Electron can hand off to an existing instance and allow the initial
  # process to exit. Only consider it failed when no instance from the
  # freshly installed directory survives the hand-off.
  if ($appProcess.HasExited) {
    $active=@(Running-ShowPilotProcesses)
    if ($active.Count -eq 0) {
      throw ('ShowPilot exited immediately after relaunch (exit code '+$appProcess.ExitCode+').')
    }
    Write-UpdateLog ('Launcher handed off; '+$active.Count+' ShowPilot process(es) are running from the installed folder.')
  }
  return $appProcess
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
  # Only the isolated Windows CI smoke test may skip launching the extracted
  # executable. User-initiated updates always attempt a real relaunch.
  if ($SmokeTestNoRelaunch -and $env:SHOWPILOT_UPDATER_SMOKE_TEST -ne '1') {
    throw 'Update test mode is restricted to the build runner.'
  }
  if (-not $BackupDir -or -not $AppProcessId) { throw 'Missing restart information.' }
  if (-not (Test-Path -LiteralPath $InstallDir -PathType Container)) { throw 'Original installation was not found.' }
  if (Test-Path -LiteralPath $BackupDir) { throw 'Previous-version backup destination already exists.' }
  Require-Executable $StageDir
  Write-UpdateLog ('Install helper started and validated the new executable; expected version='+$ExpectedVersion+'.')
  $movedOld=$false
  $installedNew=$false
  try {
    Wait-For-Old-App
    for ($i=0;$i -lt 30;$i++) {
      try {
        [System.IO.Directory]::Move($InstallDir,$BackupDir)
        $movedOld=$true
        Write-UpdateLog 'Moved original app folder to previous-version backup.'
        break
      } catch {
        if ($i -eq 29) { throw }
        Start-Sleep -Milliseconds 500
      }
    }
    [System.IO.Directory]::Move($StageDir,$InstallDir)
    $installedNew=$true
    Write-UpdateLog 'Moved staged update into the application folder.'
    Require-Executable $InstallDir
    if ($SmokeTestNoRelaunch) {
      Write-UpdateLog 'CI smoke test: previous app preserved and new app swapped into place.'
      Write-UpdateResult 'success' 'CI updater swap smoke test passed.'
      return
    }
    $appProcess=Launch-ShowPilot $InstallDir
    Write-UpdateLog ('Updated ShowPilot relaunched as PID '+$appProcess.Id+'. Original app retained for rollback.')
    Write-UpdateResult 'success' 'ShowPilot update installed and launched successfully.'
  } catch {
    $failure=$_.Exception.Message
    Write-UpdateLog ('Install failed: '+$failure)
    $recovered=$false
    if ($movedOld) {
      # Never delete/overwrite a user directory. Restore the old app only
      # when the destination can be safely made vacant.
      if ($installedNew -and (Test-Path -LiteralPath $InstallDir)) {
        $failedDir=$StageDir+'-failed'
        try {
          [System.IO.Directory]::Move($InstallDir,$failedDir)
          Write-UpdateLog ('Moved failed update to '+$failedDir)
        } catch {
          Write-UpdateLog ('Could not isolate failed update: '+$_.Exception.Message)
        }
      }
      if (-not (Test-Path -LiteralPath $InstallDir) -and (Test-Path -LiteralPath $BackupDir)) {
        try {
          [System.IO.Directory]::Move($BackupDir,$InstallDir)
          $recovered=$true
          Write-UpdateLog 'Restored original executable folder after install failure.'
        } catch {
          Write-UpdateLog ('Could not restore original executable folder: '+$_.Exception.Message)
        }
      }
    } else {
      # Nothing was replaced. The user's previous version remains usable.
      $recovered=(Test-Path -LiteralPath $InstallDir -PathType Container)
    }
    Write-UpdateResult 'failed' ('Automatic update failed: '+$failure+
      $(if($recovered){' Original version was preserved.'}else{' Check the update log before restarting manually.'}))
    $existingApps=@(Running-ShowPilotProcesses)
    if ($recovered -and $existingApps.Count -eq 0 -and -not $SmokeTestNoRelaunch) {
      try {
        $old=Launch-ShowPilot $InstallDir
        Write-UpdateLog ('Restarted previous ShowPilot version as PID '+$old.Id+'.')
      } catch {
        Write-UpdateLog ('Unable to relaunch previous ShowPilot: '+$_.Exception.Message)
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
  if ($Mode -eq 'Install') { Write-UpdateResult 'failed' ('Automatic update could not finish: '+$_.Exception.Message) }
  Write-Error $_.Exception.Message
  exit 1
}
