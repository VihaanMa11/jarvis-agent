# JARVIS Desktop Mode & Mission Control Guide

Welcome to the **JARVIS Floating Orb & Mission Control Dashboard** for Hermes Agent Desktop!

This setup transforms Hermes Desktop into an always-on, always-listening desktop companion connected to your Hermes Agent server (`hermes dashboard --tui` on port `9119`).

---

## 🌟 Key Features

1. **Floating Always-On-Top Orb**:
   - Frameless, transparent, 96x96 HUD orb in the top-right corner of your screen.
   - Non-activating window (does not steal focus from your IDE or browser).
   - Arc-reactor CSS/SVG animations reacting in real time to voice activity:
     - **Idle**: Cyan breathing core (`#00f0ff` @ 35% opacity).
     - **Listening**: Concentric pulsing reactor rings reacting to microphone amplitude.
     - **Thinking**: Dual rotating amber/cyan segmented rings while tools or subagents run.
     - **Speaking**: Pulsing gold/orange waveform while Hermes speaks via TTS.
   - **Click & Drag**:
     - **Left-Click**: Toggles voice conversation on/off. If Hermes is talking, immediately **barges in** and silences playback so you can speak.
     - **Double-Click or Right-Click**: Opens the **JARVIS Mission Control Dashboard** (`/jarvis`).
     - **Drag**: Left-mouse drag on the orb moves it anywhere on your desktop.

2. **Global Voice Hotkey**:
   - Press **`Ctrl+Shift+Space`** (or `Cmd+Shift+Space` on macOS) from any app to activate or pause active voice listening.

3. **Background Persistence & System Tray**:
   - Closing the main window with `X` hides it into the System Tray instead of terminating the app.
   - Background throttling is disabled so WebSockets (`/api/ws`), audio playback, and mic capture continue without lag.
   - Enhanced System Tray menu:
     - *Show / Hide Hermes Dashboard*
     - *Open JARVIS Mission Control*
     - *Toggle JARVIS Floating Orb*
     - *Toggle Active Listening (Ctrl+Shift+Space)*
     - *Quit Hermes*

4. **JARVIS Mission Control Dashboard (`/jarvis`)**:
   - **HUD Vitals**: Real-time gateway ping, active LLM model, and token budget.
   - **Morning Protocol**: One-click 60-second spoken briefing synthesizing overnight bot progress, urgent client messages, and today's priority tasks.
   - **Universal Voice Console**: Persistent input bar to speak or type commands that dispatch work across bots.
   - **Active Agent & Bot Fleet Matrix**: Live cards for all subagents with 1-click session jump.
   - **Ongoing Projects & Git Ship Station**: Track milestones, git branch, and uncommitted diffs with 1-click deploy/push.
   - **Action Center ("What I Have To Do")**: Central queue of questions (`clarify.request`) and permissions (`sudo`) blocking your agents with 1-click approvals.
   - **Client Projects & Communications Radar**: Inbound feed across Telegram, Discord, Slack, and WhatsApp with SLA urgency timers (>30m wait alerts) and 1-click draft response approvals.
   - **Scheduled Autonomous Routines (Cron)**: View upcoming background routines with manual "Run Now" triggers.
   - **Artifacts Showcase**: One-click export of generated diffs, reports, and diagrams.
   - **Hardware Vitals & Memory Bank**: Live inspection of CPU/RAM/VRAM and persistent long-term memories (`MEMORY.md`).

---

## 🛠️ Server Setup

Run the setup helper on your server:
```bash
bash scripts/jarvis-server-setup.sh
```

Or manually configure `~/.hermes/config.yaml`:
```yaml
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
  - When running tools, summarize the action and outcome crisply.
  - Maintain a calm, deferential, yet sharp British executive tone.
```

Launch the gateway:
```bash
hermes dashboard --tui --port 9119
```

---

## 🖥️ Running Hermes Desktop

In `apps/desktop`:
```bash
npm run dev
```

The floating JARVIS orb will appear in the top-right corner, ready to listen to your voice or launch Mission Control!
