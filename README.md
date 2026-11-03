# 🤖 JARVIS Agent — Complete Autonomous Executive AI & Server

Standalone, fully self-contained deployment repository for **JARVIS Agent** powered by Hermes Agent core, featuring the **JARVIS Desktop Floating Orb**, **Mission Control Dashboard**, and **Autonomous 24/7 Server Gateway**.

---

## ⚡ 1-Click Server Quickstart (Linux / Ubuntu / WSL / macOS)

This repository includes the entire Hermes Agent core pre-bundled. To deploy on your cloud server or local machine:

```bash
# 1. Clone your repo
git clone https://github.com/<YOUR_USERNAME>/jarvis-agent.git
cd jarvis-agent

# 2. Make scripts executable and run 1-click setup
chmod +x setup.sh start.sh
./setup.sh

# 3. Add your LLM keys
nano ~/.hermes/.env

# 4. Start the JARVIS server
./start.sh
```

---

## 🔑 Configure API Secrets (`~/.hermes/.env`)

Edit your environment file:
```bash
nano ~/.hermes/.env
```
Fill in your keys:
```env
# Primary LLM API Keys
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."

# Client Radar Inbound Adapters (Optional)
TELEGRAM_BOT_TOKEN="123456:ABC-..."
SLACK_BOT_TOKEN="xoxb-..."
DISCORD_BOT_TOKEN="..."

# Server Gateway Security Token (Optional, leave blank for local or VPN network)
HERMES_GATEWAY_TOKEN=""
```

---

## 🏃 Running the Server

### Interactive Mode:
```bash
./start.sh
```
Runs the gateway on `0.0.0.0:9119`.

### Windows (PowerShell):
```powershell
.\start.ps1
```

### 24/7 Background Daemon (systemd on Linux):
```bash
sudo cp jarvis-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jarvis-agent
```
To view logs in real time:
```bash
journalctl -u jarvis-agent -f
```

---

## 🖥️ Running Hermes Desktop with JARVIS Floating Orb

To run the desktop application with the **JARVIS Floating Arc-Reactor Orb** and **Mission Control Dashboard**:

```bash
# From the root of jarvis-agent:
npm --prefix apps/desktop run dev
```

### Controls & Features:
- **Floating Orb**: Always-on-top, draggable, reacting to voice levels.
- **Voice / Barge-in**: Left-click orb or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd>.
- **JARVIS Mission Control**: Double-click the orb or click **JARVIS** in the desktop sidebar (`#/jarvis`).
- **Connect Desktop to Remote Server**: Go to **Settings → Gateway Connection** and enter `http://<SERVER_IP>:9119`.
