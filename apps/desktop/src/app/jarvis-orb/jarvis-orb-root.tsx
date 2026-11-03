import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ErrorBoundary } from '@/components/error-boundary'
import { JarvisOrbApp } from './jarvis-orb-app'

export function mountJarvisOrb(): void {
  const style = document.createElement('style')
  style.textContent = 'html,body,#root{background:transparent !important;overflow:hidden;margin:0;padding:0;width:100%;height:100%;user-select:none;}'
  document.head.appendChild(style)

  const root = document.getElementById('root')
  if (!root) {
    return
  }

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary label="jarvis-orb">
        <JarvisOrbApp />
      </ErrorBoundary>
    </StrictMode>
  )
}
