# ==============================================================================
# JARVIS Agent Server Launcher (PowerShell / Windows)
# ==============================================================================

$HermesRepo = Join-Path $PSScriptRoot "..\hermes-agent"
if (-not (Test-Path $HermesRepo)) {
    Write-Host "❌ Could not find hermes-agent at $HermesRepo" -ForegroundColor Red
    exit 1
}

Push-Location $HermesRepo
try {
    Write-Host "🚀 Launching JARVIS Mission Control Server on port 9119..." -ForegroundColor Cyan
    python run_agent.py gateway --host 0.0.0.0 --port 9119
} finally {
    Pop-Location
}
