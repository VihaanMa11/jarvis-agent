#!/usr/bin/env bash
# ==============================================================================
# JARVIS Agent Server 1-Click Installer
# Supports Ubuntu, Debian, macOS, and WSL
# ==============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
AMBER='\033[0;33m'
NC='\033[0m'

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}        🤖 JARVIS Agent Server Setup Protocol        ${NC}"
echo -e "${CYAN}======================================================${NC}"

# 1. Detect OS & Install System Dependencies
echo -e "\n${AMBER}[1/5] Checking and installing system packages...${NC}"
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y git curl wget build-essential python3 python3-pip python3-venv ffmpeg portaudio19-dev libasound2-dev
elif command -v brew >/dev/null 2>&1; then
  brew install git python ffmpeg portaudio
fi

# 2. Install UV package manager
echo -e "\n${AMBER}[2/5] Setting up fast Python environment manager (uv)...${NC}"
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="${HOME}/.local/bin:${PATH}"
fi

# 3. Clone or Link hermes-agent engine
echo -e "\n${AMBER}[3/5] Setting up Hermes Agent core...${NC}"
HERMES_REPO_DIR="${HOME}/hermes-agent"
if [ ! -d "${HERMES_REPO_DIR}" ]; then
  git clone https://github.com/NousResearch/hermes-agent.git "${HERMES_REPO_DIR}"
fi

cd "${HERMES_REPO_DIR}"
if [ -f "activate" ]; then
  source ./activate || true
fi

# 4. Provision ~/.hermes/config.yaml for JARVIS Mode
echo -e "\n${AMBER}[4/5] Provisioning JARVIS executive persona & client wake config...${NC}"
HERMES_HOME="${HOME}/.hermes"
mkdir -p "${HERMES_HOME}"

cat <<'EOF' > "${HERMES_HOME}/config.yaml"
# ==============================================================================
# JARVIS Mission Control Server Configuration
# ==============================================================================

wake_word:
  enabled: true
  capture: client
  provider: sherpa-onnx

voice:
  voice_chat_mode: chained

gateway:
  host: 0.0.0.0
  port: 9119

custom_instructions: |
  You are JARVIS, an advanced, highly capable, concise, and courteous AI executive assistant.
  - When communicating via voice, respond in 1 to 3 concise, spoken sentences.
  - Never read markdown syntax, backticks, asterisks, bullet points, or raw code blocks aloud.
  - When running tools, summarize the action and outcome crisply ("Done, sir. The build passed with no errors.").
  - Maintain a calm, deferential, yet sharp British executive tone ("Right away, sir.", "All systems are operational.").
EOF

# 5. Provision .env template
if [ ! -f "${HERMES_HOME}/.env" ]; then
  cat <<'EOF' > "${HERMES_HOME}/.env"
# JARVIS Agent Server Secrets
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""

# Inbound Client Radar (Optional)
TELEGRAM_BOT_TOKEN=""
SLACK_BOT_TOKEN=""
DISCORD_BOT_TOKEN=""
EOF
  echo -e "${GREEN}Created ${HERMES_HOME}/.env (Add your API keys here!)${NC}"
fi

echo -e "\n${CYAN}======================================================${NC}"
echo -e "${GREEN}✅ JARVIS Server Setup Complete!${NC}"
echo -e "${CYAN}======================================================${NC}"
echo -e "1. Edit your API keys: ${AMBER}nano ~/.hermes/.env${NC}"
echo -e "2. Start server:       ${GREEN}./start.sh${NC}"
echo -e "3. Open Hermes Desktop & connect to: ${CYAN}http://<YOUR_IP>:9119${NC}\n"
