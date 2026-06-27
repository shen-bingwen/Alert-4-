param(
  [string]$HostValue = "0.0.0.0",
  [string]$PortValue = "8788"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$foregroundScript = Join-Path $scriptDir "run_dingtou_server_foreground.ps1"

$process = Start-Process -FilePath "powershell.exe" `
  -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $foregroundScript,
    "-HostValue",
    $HostValue,
    "-PortValue",
    $PortValue
  ) `
  -WorkingDirectory $scriptDir `
  -WindowStyle Normal `
  -PassThru

Write-Output $process.Id
