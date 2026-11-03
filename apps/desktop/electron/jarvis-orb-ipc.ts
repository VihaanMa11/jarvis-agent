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
  // Orb requests voice toggle -> forward to Main Window
  ipcMain.on('hermes:jarvis:toggle-voice', () => {
    const mainWin = getMainWindow()
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('hermes:jarvis:toggle-voice')
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

  // Orb dragged -> move orb window
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
