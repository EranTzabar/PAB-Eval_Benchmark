# Start PAB-Eval backend (FastAPI) and web UI (Next.js) in this terminal.
# Backend runs in the background; web UI runs in the foreground. Ctrl+C stops both.
# Usage:
#   .\start-dev.ps1
#   .\start-dev.ps1 -Port 8005
# Port: -Port wins, else PAB_PORT in pab-eval/.env, else 8001.

param(
    [int]$Port
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$BackendDir = Join-Path $Root "pab-eval"
$WebDir = Join-Path $Root "pab-eval-web"

if (-not (Test-Path $BackendDir)) {
    Write-Error "Backend folder not found: $BackendDir"
}
if (-not (Test-Path $WebDir)) {
    Write-Error "Web folder not found: $WebDir"
}

function Get-PabPortFromEnvFile {
    $envFile = Join-Path $BackendDir ".env"
    if (-not (Test-Path $envFile)) { return 8001 }
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*PAB_PORT\s*=\s*(\d+)') {
            return [int]$Matches[1]
        }
    }
    return 8001
}

if (-not $PSBoundParameters.ContainsKey("Port")) {
    $Port = Get-PabPortFromEnvFile
}

$env:PAB_PORT = "$Port"
$env:NEXT_PUBLIC_PAB_API_URL = "http://127.0.0.1:$Port"

function Start-BackendProcess {
    if (Get-Command python -ErrorAction SilentlyContinue) {
        return Start-Process -FilePath "python" -ArgumentList "main.py" -WorkingDirectory $BackendDir -PassThru -NoNewWindow
    }
    if (Get-Command py -ErrorAction SilentlyContinue) {
        return Start-Process -FilePath "py" -ArgumentList "-3.10", "main.py" -WorkingDirectory $BackendDir -PassThru -NoNewWindow
    }
    throw "Python not found. Install Python 3.10+ and ensure it is on PATH."
}

function Stop-BackendProcess {
    param($Process)
    if ($null -eq $Process) { return }
    if (-not $Process.HasExited) {
        Write-Host "`nStopping API (pid $($Process.Id))..." -ForegroundColor Yellow
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
}

$backend = $null
try {
    Write-Host "Starting PAB-Eval API in background (http://127.0.0.1:$Port)..." -ForegroundColor Cyan
    $backend = Start-BackendProcess
    Start-Sleep -Seconds 2

    if ($backend.HasExited) {
        throw "API exited immediately (exit code $($backend.ExitCode)). Check pab-eval/.env and run from repo root."
    }

    Write-Host "Starting PAB-Eval web UI (http://localhost:3005)..." -ForegroundColor Cyan
    Write-Host "Press Ctrl+C to stop both servers.`n" -ForegroundColor DarkGray

    Push-Location $WebDir
    npm run dev
}
finally {
    Pop-Location -ErrorAction SilentlyContinue
    Stop-BackendProcess -Process $backend
}
