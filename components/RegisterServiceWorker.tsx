'use client'

import { useEffect } from 'react'

// Registers /sw.js unconditionally on load. This used to only happen
// inside enablePush() — meaning a normal visitor with notifications off
// never had a service worker running at all, which stops Chrome's install
// prompt (beforeinstallprompt) from firing no matter how correct the
// manifest is. Installability and push are separate concerns; both need
// the SW active, so this runs regardless of push being enabled.
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration can fail on http (non-localhost) or unsupported
      // browsers — nothing actionable to show the user for this.
    })
  }, [])

  return null
}
