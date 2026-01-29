param(
    [string[]]$GpsArgs = @("--dummy"),
    [string[]]$TileArgs = @()
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Test-PortListening {
    param([int]$Port)
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -gt 0
}

$tileScript = Join-Path $root "MapServer\OpenTopoFlaskServer.py"
$webScript = Join-Path $root "GNSserver\web_main.py"

# Start the tile server (Flask) if not already listening on 5000.
if (-not (Test-PortListening -Port 5000)) {
    Start-Process -FilePath "python" -WorkingDirectory $root -ArgumentList @($tileScript) + $TileArgs
}

# Start the NavScope web UI server if not already listening on 8000.
if (-not (Test-PortListening -Port 8000)) {
    Start-Process -FilePath "python" -WorkingDirectory $root -ArgumentList @($webScript) + $GpsArgs
}

Start-Sleep -Seconds 1
Start-Process "http://127.0.0.1:8000"
