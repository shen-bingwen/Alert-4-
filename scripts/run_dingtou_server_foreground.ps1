param(
  [string]$HostValue = "0.0.0.0",
  [string]$PortValue = "8788"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$appDir = Join-Path $rootDir "app"

$env:DCA_HOST = $HostValue
$env:DCA_PORT = $PortValue

$node = (Get-Command node -ErrorAction Stop).Source

Write-Host "正在启动 4% 定投提醒工具..."
Write-Host "Host: $HostValue"
Write-Host "Port: $PortValue"
Write-Host ""

Set-Location $appDir
& $node "server.js"
