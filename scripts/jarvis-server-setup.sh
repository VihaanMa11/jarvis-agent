#!/usr/bin/env bash
# ==============================================================================
# JARVIS Remote Server Setup Script for Hermes Agent
# Configures wake word, client capture, and JARVIS executive persona.
# ==============================================================================

set -euo pipefail

HERMES_DIR="${HOME}/.hermes"
CONFIG_FILE="${HERMES_DIR}/config.yaml"

echo "🤖 Configuring Hermes Agent server for JARVIS Desktop Mode..."
mkdir -p "${HERMES_DIR}"

if [ ! -f "${CONFIG_FILE}" ]; then
  cat <<'EOF' > "${CONFIG_FILE}"
# Hermes Agent Configuration
wake_word:
  enabled: true
  capture: client
  provider: sherpa-onnx

voice:
  voice_chat_mode: chained

custom_instructions: |
  You are JARVIS, an advanced, highly capable, concise, and courteous AI assistant.
  - When communicating via voice, respond in 1 to 3 concise, spoken sentences.
  - Never read markdown syntax, backticks, asterisks, bullet points, or raw code blocks aloud.
  - When running tools, summarize the action and outcome crisply ("Done, sir. The build passed with no errors.").
  - Maintain a calm, deferential, yet sharp British executive tone ("Right away, sir.", "All systems are operational.").
EOF
  echo "✅ Created new ${CONFIG_FILE} with JARVIS configuration."
else
  # Update existing config.yaml if needed
  python3 - <<'EOF'
import yaml
import os

config_path = os.path.expanduser("~/.hermes/config.yaml")
data = {}
if os.path.exists(config_path):
    with open(config_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

data.setdefault("wake_word", {})
data["wake_word"]["enabled"] = True
data["wake_word"]["capture"] = "client"

jarvis_instructions = (
    "You are JARVIS, an advanced, highly capable, concise, and courteous AI assistant.\n"
    "- When communicating via voice, respond in 1 to 3 concise, spoken sentences.\n"
    "- Never read markdown syntax, backticks, asterisks, bullet points, or raw code blocks aloud.\n"
    "- When running tools, summarize the action and outcome crisply.\n"
    "- Maintain a calm, deferential, yet sharp British executive tone."
)
data["custom_instructions"] = jarvis_instructions

with open(config_path, "w", encoding="utf-8") as f:
    yaml.safe_dump(data, f, default_flow_style=False, sort_keys=False)

print("✅ Updated ~/.hermes/config.yaml with JARVIS persona and client wake settings.")
EOF
fi

echo ""
echo "🚀 To launch the Hermes server for your Desktop JARVIS Orb:"
echo "   hermes dashboard --tui --port 9119"
echo ""
echo "Your Hermes Desktop app will now connect seamlessly."
