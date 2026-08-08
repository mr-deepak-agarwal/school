'use client'

import { useEffect, useState } from 'react'
import { pushSupported, currentPushSubscription, enablePush, disablePush } from '@/lib/push'

export default function NotificationToggle({ teacherId }: { teacherId: string }) {
  const [supported, setSupported] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSupported(pushSupported())
    currentPushSubscription().then((sub) => setEnabled(!!sub))
  }, [])

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      if (enabled) {
        await disablePush(teacherId)
        setEnabled(false)
      } else {
        await enablePush(teacherId)
        setEnabled(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
    setBusy(false)
  }

  if (!supported) return null

  return (
    <div className="relative">
      <button
        onClick={toggle}
        disabled={busy}
        title={enabled ? 'Notifications on for this device — click to turn off' : 'Get notified here when you\u2019re assigned a substitution'}
        className="btn-ghost btn-sm"
      >
        <span aria-hidden>{enabled ? '\ud83d\udd14' : '\ud83d\udd15'}</span>
        <span className="hidden sm:inline">{busy ? '\u2026' : enabled ? 'Alerts on' : 'Enable alerts'}</span>
      </button>
      {error && (
        <p className="absolute right-0 top-full mt-1 w-56 rounded-md border border-[var(--danger)] bg-[var(--danger-bg)] p-2 text-xs text-[var(--danger)] shadow-[var(--shadow-sm)]">
          {error}
        </p>
      )}
    </div>
  )
}
