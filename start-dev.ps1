Param(
  [switch]$Install
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Get-EnvValue {
  Param(
    [string]$EnvPath,
    [string]$Key,
    [string]$Fallback
  )

  if (-not (Test-Path $EnvPath)) {
    return $Fallback
  }

  $line = Get-Content $EnvPath | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) {
    return $Fallback
  }

  $value = $line.Split('=', 2)[1].Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Fallback
  }

  return $value
}

function Ensure-EnvFile {
  Param(
    [string]$Path,
    [string]$ExamplePath
  )

  if (Test-Path $Path) {
    return
  }

  if (Test-Path $ExamplePath) {
    Copy-Item $ExamplePath $Path
    Write-Host "Created $Path from template."
  }
}

function Ensure-Command {
  Param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Ensure-Dependencies {
  Param([string]$ProjectDir)

  $nodeModules = Join-Path $ProjectDir 'node_modules'
  if (Test-Path $nodeModules) {
    return
  }

  Write-Host "Installing dependencies in $ProjectDir ..."
  npm install --prefix $ProjectDir
}

Ensure-Command 'node'
Ensure-Command 'npm'

$serverEnv = Join-Path $root 'server\.env'
$clientEnv = Join-Path $root 'client\.env'
Ensure-EnvFile -Path $serverEnv -ExamplePath (Join-Path $root 'server\.env.example')
Ensure-EnvFile -Path $clientEnv -ExamplePath (Join-Path $root 'client\.env.example')

if ($Install) {
  Ensure-Dependencies -ProjectDir (Join-Path $root 'server')
  Ensure-Dependencies -ProjectDir (Join-Path $root 'client')
}

$serverPort = Get-EnvValue -EnvPath $serverEnv -Key 'DOCJIN_SERVER_PORT' -Fallback '3001'
$clientPort = Get-EnvValue -EnvPath $clientEnv -Key 'VITE_DEV_SERVER_PORT' -Fallback '5178'
$clientHost = Get-EnvValue -EnvPath $clientEnv -Key 'VITE_DEV_SERVER_HOST' -Fallback '127.0.0.1'

$serverLog = Join-Path $root 'server.dev.log'
$clientLog = Join-Path $root 'client.dev.log'

$serverCmd = "npm run dev --prefix server > `"$serverLog`" 2>&1"
$clientCmd = "npm run dev --prefix client > `"$clientLog`" 2>&1"

$serverProc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $serverCmd -WorkingDirectory $root -PassThru
$clientProc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $clientCmd -WorkingDirectory $root -PassThru

$pidPath = Join-Path $root '.dev-pids.json'
$pidData = @{
  startedAt = (Get-Date).ToString('s')
  serverCmdPid = $serverProc.Id
  clientCmdPid = $clientProc.Id
} | ConvertTo-Json
Set-Content -Path $pidPath -Value $pidData -Encoding UTF8

Start-Sleep -Seconds 2

Write-Host ''
Write-Host 'Docjin dev services started.'
Write-Host "Frontend: http://$clientHost`:$clientPort"
Write-Host "Backend:  http://127.0.0.1:$serverPort"
Write-Host "Logs: $clientLog, $serverLog"
Write-Host "PIDs file: $pidPath"
Write-Host ''
Write-Host 'Tip: use Ctrl+C only in this terminal; services continue in background.'
