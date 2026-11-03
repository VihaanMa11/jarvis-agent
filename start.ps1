# ==============================================================================
# JARVIS Agent Server Launcher (PowerShell / Windows)
# ==============================================================================

Push-Location $PSScriptRoot
try {
    Write-Host "🚀 Launching JARVIS Mission Control Server on port 9119..." -ForegroundColor Cyan
    python run_agent.py gateway --host 0.0.0.0 --port 9119
} finally {
    Pop-Location
}
