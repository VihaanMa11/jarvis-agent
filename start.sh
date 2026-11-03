#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_DIR}"

if [ -f "activate" ]; then
  source ./activate
fi

echo "🚀 Launching JARVIS Mission Control Server on port 9119..."
python3 run_agent.py gateway --host 0.0.0.0 --port 9119 || python3 -m gateway.run --host 0.0.0.0 --port 9119 || hermes dashboard --tui --host 0.0.0.0 --port 9119
