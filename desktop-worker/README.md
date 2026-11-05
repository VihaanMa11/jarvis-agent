# JARVIS — Desktop Worker (Local Mode)

This package sets up a **local Hermes worker** on your laptop so JARVIS (running
on the VPS) can control your **real** desktop apps — launch programs, click,
type, scroll, read the screen — the same way it already controls its virtual
desktop on the server.

## Why this exists

Hermes's `computer_use` tool drives **the machine Hermes runs on**. The VPS is
headless, so JARVIS drives a *virtual* desktop there. To drive your *real*
laptop desktop, a Hermes instance must run **on the laptop itself**. This
package is that instance — a "hands" worker that the VPS "brain" hands desktop
tasks to.

## Setup (run once, on the laptop)

1. Install Hermes on the laptop (Windows).
2. Enable computer use: `hermes tools enable computer_use`
   (or toggle it in the desktop app's tools list).
3. Copy this whole `desktop-worker/` folder to the laptop.
4. Start the worker (below).

## Start the worker

Windows (PowerShell), from inside the `desktop-worker/` folder:

```powershell
.\start-worker.ps1
```

macOS / Linux:

```bash
./start-worker.sh
```

The worker is a Hermes session with the `computer_use` toolset. The
instructions in `AGENTS.md` load automatically and tell it how to behave as a
desktop worker.

## Seamless handoff (VPS brain → laptop hands)

Two ways, simplest first:

### A. Desktop-app multi-connection (simplest)
The Hermes desktop app can connect to many instances at once. Connect it to
**both** the VPS (your main JARVIS) and the local worker. For normal work talk
to the VPS; for "do this on my desktop", switch to the worker. No extra code.

### B. Message bridge (automatic)
Connect both instances to the same messaging platform (e.g. Telegram). JARVIS
sends a task to the worker bot; the worker runs it with `computer_use` and
replies with the result and a screenshot.

## Notes

- `computer_use` is background-first: it won't steal your cursor or focus while
  you type in another window.
- The worker only runs while your laptop is on and the worker session is open.
  Close it to stop desktop control.
- Never let the worker near passwords, payment screens, or 2FA — it is told to
  stop and ask on those.
