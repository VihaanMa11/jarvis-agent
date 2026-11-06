import { type BrowserWindow, ipcMain } from 'electron'

import type { JarvisOrbController, JarvisVoiceStateData } from './jarvis-orb-window'

export interface JarvisOrbIpcDeps {
  getMainWindow: () => BrowserWindow | null
  getOrbController: () => JarvisOrbController
  activateMainWindow: (targetRoute?: string) => void
  log: (message: string) => void
}

export function registerJarvisOrbIpc({
  getMainWindow,
  getOrbController,
  activateMainWindow,
  log
}: JarvisOrbIpcDeps) {
  // Orb requests voice toggle -> forward to Main Window. The voice conversation
  // lives in the main renderer, so if the window was closed to the tray we must
  // bring one up and deliver the toggle once it can receive IPC — otherwise the
  // click silently no-ops.
  ipcMain.on('hermes:jarvis:toggle-voice', () => {
    const deliver = (win: BrowserWindow | null) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('hermes:jarvis:toggle-voice')
      }
    }

    const mainWin = getMainWindow()

    if (mainWin && !mainWin.isDestroyed()) {
      deliver(mainWin)

      return
    }

    activateMainWindow()

    const created = getMainWindow()

    if (!created || created.isDestroyed()) {
      log('[jarvis-orb] toggle-voice dropped: no main window available')

      return
    }

    if (created.webContents.isLoading()) {
      created.webContents.once('did-finish-load', () => deliver(created))
    } else {
      deliver(created)
    }
  })

  // Orb requests opening / bringing to foreground main window (e.g. double click or right click)
  ipcMain.on('hermes:jarvis:open-main-window', (_event, targetRoute?: string) => {
    activateMainWindow(targetRoute || '/jarvis')
    const mainWin = getMainWindow()

    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('hermes:jarvis:open-route', targetRoute || '/jarvis')
    }
  })

  // Main window reports voice state -> forward to Orb
  ipcMain.on('hermes:jarvis:voice-state', (_event, data: JarvisVoiceStateData) => {
    const orb = getOrbController()
    orb.sendVoiceState(data)
  })

  // Orb dragged -> move orb window. The renderer only signals start/move/end;
  // the actual position comes from main sampling the native cursor (see
  // jarvis-orb-window.ts beginDrag/dragTo).
  ipcMain.on('hermes:jarvis:begin-drag', () => {
    getOrbController().beginDrag()
  })

  ipcMain.on('hermes:jarvis:drag-move', () => {
    getOrbController().dragTo()
  })

  ipcMain.on('hermes:jarvis:end-drag', () => {
    getOrbController().endDrag()
  })

  // Orb dragged -> move orb window (legacy delta path, kept for compatibility)
  ipcMain.on('hermes:jarvis:move-orb', (_event, payload: { deltaX: number; deltaY: number }) => {
    if (payload && typeof payload.deltaX === 'number' && typeof payload.deltaY === 'number') {
      getOrbController().move(payload.deltaX, payload.deltaY)
    }
  })

  // Orb mounted -> request initial voice state
  ipcMain.handle('hermes:jarvis:get-initial-state', () => {
    return getOrbController().getCachedState()
  })

  // Toggle orb visibility from renderer or menu
  ipcMain.on('hermes:jarvis:toggle-orb', () => {
    getOrbController().toggle()
  })
}
