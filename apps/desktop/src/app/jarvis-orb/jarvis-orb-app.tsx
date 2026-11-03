import './jarvis-orb.css'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { JarvisVoiceState } from '@/global'

export function JarvisOrbApp() {
  const [voiceState, setVoiceState] = useState<JarvisVoiceState>('idle')
  const [audioLevel, setAudioLevel] = useState<number>(0)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const hasMovedRef = useRef(false)

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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only primary mouse button or Alt-click initiates drag
    if (e.button === 0) {
      isDraggingRef.current = true
      hasMovedRef.current = false
      dragStartRef.current = { x: e.screenX, y: e.screenY }
    }
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) {
        return
      }

      const dx = e.screenX - dragStartRef.current.x
      const dy = e.screenY - dragStartRef.current.y

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMovedRef.current = true
        window.jarvisBridge?.moveOrb(dx, dy)
        dragStartRef.current = { x: e.screenX, y: e.screenY }
      }
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      dragStartRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    // If the user was dragging the orb, do not toggle voice
    if (hasMovedRef.current) {
      hasMovedRef.current = false
      return
    }

    window.jarvisBridge?.toggleVoice()
  }, [])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
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
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      title="JARVIS Orb (Click: Toggle Voice, Double Click / Right Click: Open Dashboard, Drag to reposition)"
    >
      <div className="jarvis-orb-outer-ring" />

      <svg className="jarvis-reactor-svg" viewBox="0 0 100 100">
        <defs>
          <radialGradient id="reactor-glow" cx="50%" cy="50%" r="50%">
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
        <g stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1.5" fill="none">
          <line x1="50" y1="12" x2="50" y2="20" />
          <line x1="50" y1="80" x2="50" y2="88" />
          <line x1="12" y1="50" x2="20" y2="50" />
          <line x1="80" y1="50" x2="88" y2="50" />
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
