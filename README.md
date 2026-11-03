# 🤖 JARVIS Agent Server

Autonomous executive AI server backend designed for Hermes Agent and the **JARVIS Desktop Floating Orb & Mission Control Dashboard**.

Runs the Hermes agent gateway on port `9119`, provides real-time multi-agent execution, client messaging radar (Telegram, Discord, Slack, WhatsApp), client-side wake word streaming, and scheduled autonomous routines.

---

## 🚀 Quick Server Deployment (1-Click)

On your Ubuntu, Debian, macOS, or WSL server:

```bash
git clone https://github.com/YOUR_USERNAME/jarvis-agent.git
cd jarvis-agent
chmod +x setup.sh start.sh
./setup.sh
```

The setup script automatically:
1. Installs Python 3.11+, `uv`, audio libraries (`ffmpeg`, `portaudio`), and dependencies.
2. Clones and configures `hermes-agent`.
3. Sets up `~/.hermes/config.yaml` with client wake capture and the JARVIS executive voice persona.
4. Generates `.env` for your API keys.

---

## 🔑 Configure Secrets

Edit `.env` with your API keys:
```bash
nano ~/.hermes/.env
```
Fill in your keys:
```env
# Primary LLM Keys
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."

# Client Radar Adapters (Optional)
TELEGRAM_BOT_TOKEN="123456:ABC-..."
SLACK_BOT_TOKEN="xoxb-..."
DISCORD_BOT_TOKEN="..."
```

---

## 🏃 Running JARVIS Server

### Interactive Mode:
```bash
./start.sh
```
This runs `hermes dashboard --tui --host 0.0.0.0 --port 9119`.

### 24/7 Background Daemon (systemd):
To keep JARVIS running continuously in the background on Linux:
```bash
sudo cp jarvis-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jarvis-agent
```

Check status:
```bash
sudo systemctl status jarvis-agent
journalctl -u jarvis-agent -f
```

---

## 🌐 Connecting from Hermes Desktop

1. Launch your **Hermes Desktop app**.
2. Go to **Settings → Gateway Connection**:
   - URL: `http://<YOUR_SERVER_IP>:9119`
   - Token: (found in `~/.hermes/.env` or leave blank if local)
3. Your floating **JARVIS Orb** and **Mission Control Dashboard** (`/jarvis`) will now connect to this server!
