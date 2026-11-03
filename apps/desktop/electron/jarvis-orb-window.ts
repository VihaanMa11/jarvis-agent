import { pathToFileURL } from 'node:url'
import { BrowserWindow, screen } from 'electron'

export interface JarvisOrbWindowOptions {
  devServer?: string
  preloadPath: string
  rendererIndex: () => string
  log: (message: string) => void
  onToggleVoiceRequested?: () => void
  onOpenMainWindowRequested?: () => void
}

export interface JarvisVoiceStateData {
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
  audioLevel?: number
}

const ORB_SIZE = 96
const PADDING = 24

export function createJarvisOrbWindowController({
  devServer,
  preloadPath,
  rendererIndex,
  log,
  onToggleVoiceRequested,
  onOpenMainWindowRequested
}: JarvisOrbWindowOptions) {
  let window: BrowserWindow | null = null
  let cachedState: JarvisVoiceStateData = { state: 'idle', audioLevel: 0 }

  const resolveOrbUrl = () => {
    if (devServer) {
      const base = devServer.endsWith('/') ? devServer.slice(0, -1) : devServer
      return `${base}/?win=jarvis-orb#/`
    }
    return `${pathToFileURL(rendererIndex()).toString()}?win=jarvis-orb#/`
  }

  const defaultPosition = () => {
    try {
      const primary = screen.getPrimaryDisplay()
      const workArea = primary.workArea
      return {
        x: Math.round(workArea.x + workArea.width - ORB_SIZE - PADDING),
        y: Math.round(workArea.y + PADDING)
      }
    } catch {
      return { x: 100, y: 100 }
    }
  }

  const spawn = () => {
    if (window && !window.isDestroyed()) {
      return window
    }

    const pos = defaultPosition()

    window = new BrowserWindow({
      width: ORB_SIZE,
      height: ORB_SIZE,
      x: pos.x,
      y: pos.y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      focusable: false,
      show: false,
      backgroundColor: '#00000000',
      type: process.platform === 'darwin' ? 'panel' : undefined,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        devTools: true,
        backgroundThrottling: false
      }
    })

    window.setAlwaysOnTop(true, process.platform === 'darwin' ? 'floating' : 'screen-saver')
    window.setHiddenInMissionControl?.(true)

    try {
      window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
    } catch {
      // Best-effort across window managers
    }

    const orbUrl = resolveOrbUrl()
    void window.loadURL(orbUrl).catch(err => {
      log(`[jarvis-orb] loadURL failed: ${err}`)
    })

    window.once('ready-to-show', () => {
      if (window && !window.isDestroyed()) {
        window.showInactive()
        sendVoiceState(cachedState)
      }
    })

    window.on('closed', () => {
      window = null
    })

    return window
  }

  const sendVoiceState = (data: JarvisVoiceStateData) => {
    cachedState = data
    if (window && !window.isDestroyed()) {
      window.webContents.send('hermes:jarvis:voice-state', data)
    }
  }

  const move = (deltaX: number, deltaY: number) => {
    if (!window || window.isDestroyed()) {
      return
    }
    try {
      const [curX, curY] = window.getPosition()
      window.setPosition(Math.round(curX + deltaX), Math.round(curY + deltaY))
    } catch {
      // Best effort move
    }
  }

  const toggle = () => {
    if (!window || window.isDestroyed()) {
      spawn()
      return
    }
    if (window.isVisible()) {
      window.hide()
    } else {
      window.showInactive()
      sendVoiceState(cachedState)
    }
  }

  const show = () => {
    if (!window || window.isDestroyed()) {
      spawn()
    } else if (!window.isVisible()) {
      window.showInactive()
      sendVoiceState(cachedState)
    }
  }

  const hide = () => {
    if (window && !window.isDestroyed() && window.isVisible()) {
      window.hide()
    }
  }

  const close = () => {
    if (window && !window.isDestroyed()) {
      window.close()
      window = null
    }
  }

  return {
    spawn,
    show,
    hide,
    toggle,
    move,
    sendVoiceState,
    getCachedState: () => cachedState,
    getWindow: () => window,
    close
  }
}

export type JarvisOrbController = ReturnType<typeof createJarvisOrbWindowController>
