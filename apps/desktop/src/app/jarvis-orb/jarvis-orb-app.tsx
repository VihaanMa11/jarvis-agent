import './jarvis-orb.css'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { JarvisVoiceState } from '@/global'

// How far the cursor must travel before a press counts as a drag rather than a
// click. Generous enough that a slightly shaky click still toggles voice.
const DRAG_THRESHOLD_PX = 5

// A double-click should open the dashboard, not toggle voice twice first.
const CLICK_DELAY_MS = 180

export function JarvisOrbApp() {
  const [voiceState, setVoiceState] = useState<JarvisVoiceState>('idle')
  const [audioLevel, setAudioLevel] = useState<number>(0)
  const pressRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const clickTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const bridge = window.jarvisBridge

    if (!bridge) {
      return
    }

    void bridge.getInitialState?.().then(init => {
      if (init) {
        setVoiceState(init.state || 'idle')
        setAudioLevel(init.audioLevel || 0)
      }
    })

    const unsubscribe = bridge.onVoiceStateChange(payload => {
      if (payload) {
        setVoiceState(payload.state)
        setAudioLevel(payload.audioLevel || 0)
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  useEffect(
    () => () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current)
      }
    },
    []
  )

  const toggleVoice = useCallback(() => {
    window.jarvisBridge?.toggleVoice()
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) {
      return
    }

    pressRef.current = { x: e.screenX, y: e.screenY }
    draggingRef.current = false

    // Capture so pointer events keep flowing to us even once the cursor
    // outruns this tiny 96px window during a drag. Without capture the stream
    // dies the moment the pointer leaves the window and the drag stalls.
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // Capture can be rejected; the drag still works while the cursor is over the orb.
    }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const press = pressRef.current

    if (!press) {
      return
    }

    if (!draggingRef.current) {
      const dx = e.screenX - press.x
      const dy = e.screenY - press.y

      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
        return
      }

      draggingRef.current = true
      // Main samples the native cursor and parks the window under it.
      window.jarvisBridge?.beginOrbDrag()
    }

    window.jarvisBridge?.dragOrb()
  }, [])

  const finishPress = useCallback((e: React.PointerEvent) => {
    const wasDragging = draggingRef.current
    pressRef.current = null
    draggingRef.current = false

    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      // Pointer id may already be invalid.
    }

    return wasDragging
  }, [])

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (finishPress(e)) {
        window.jarvisBridge?.endOrbDrag()

        return
      }

      // Delay the single-click action so a double-click opens the dashboard
      // instead of toggling voice on first.
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current)
      }

      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null
        toggleVoice()
      }, CLICK_DELAY_MS)
    },
    [finishPress, toggleVoice]
  )

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (finishPress(e)) {
        window.jarvisBridge?.endOrbDrag()
      }
    },
    [finishPress]
  )

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()

    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }

    window.jarvisBridge?.openMainWindow('/jarvis')
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    window.jarvisBridge?.openMainWindow('/jarvis')
  }, [])

  // Dynamic scale from audio amplitude during active listening
  const dynamicScale = voiceState === 'listening' ? 1 + Math.min(0.35, (audioLevel || 0) * 0.8) : 1

  return (
    <div
      className={`jarvis-orb-container state-${voiceState}`}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title="JARVIS Orb (Click: Toggle Voice, Double Click / Right Click: Open Dashboard, Drag to reposition)"
    >
      <div className="jarvis-orb-outer-ring" />

      <svg className="jarvis-reactor-svg" viewBox="0 0 100 100">
        <defs>
          <radialGradient cx="50%" cy="50%" id="reactor-glow" r="50%">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="1" />
            <stop offset="60%" stopColor="#0099ff" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0044ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer segmented ring */}
        <circle className="ring-outer" cx="50" cy="50" r="42" />

        {/* Middle decorative ring */}
        <circle className="ring-middle" cx="50" cy="50" r="32" />

        {/* Inner geometric guide */}
        <circle className="ring-inner" cx="50" cy="50" r="22" />

        {/* Reactor Tri-Arc accents */}
        <g fill="none" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1.5">
          <line x1="50" x2="50" y1="12" y2="20" />
          <line x1="50" x2="50" y1="80" y2="88" />
          <line x1="12" x2="20" y1="50" y2="50" />
          <line x1="80" x2="88" y1="50" y2="50" />
        </g>

        {/* Core glowing element with dynamic audio scale */}
        <circle
          className="reactor-core"
          cx="50"
          cy="50"
          r="14"
          style={{ transform: `scale(${dynamicScale})` }}
        />
      </svg>
    </div>
  )
}
