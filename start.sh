#!/usr/bin/env bash
set -euo pipefail

HERMES_REPO_DIR="${HOME}/hermes-agent"
if [ ! -d "${HERMES_REPO_DIR}" ]; then
  # If running in local clone
  if [ -d "../hermes-agent" ]; then
    HERMES_REPO_DIR="$(cd ../hermes-agent && pwd)"
  else
    echo "❌ hermes-agent directory not found. Run ./setup.sh first."
    exit 1
  fi
fi

cd "${HERMES_REPO_DIR}"
if [ -f "activate" ]; then
  source ./activate
fi

echo "🚀 Launching JARVIS Mission Control Server on port 9119..."
python3 run_agent.py gateway --host 0.0.0.0 --port 9119 || python3 -m gateway.run --host 0.0.0.0 --port 9119 || hermes dashboard --tui --host 0.0.0.0 --port 9119
