import { supabase } from './supabaseClient'

// Standard base64url -> Uint8Array conversion the Push API needs the VAPID
// public key in.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

// Registers the service worker (idempotent — safe to call every load),
// asks the browser for notification permission, subscribes, and saves the
// subscription against this teacher so the send-push edge function can
// find it later. Throws if permission is denied or VAPID key is missing,
// so callers should wrap this in a try/catch and show the error.
export async function enablePush(teacherId: string): Promise<void> {
  if (!pushSupported()) throw new Error('Push notifications aren\u2019t supported in this browser.')

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) throw new Error('Push isn\u2019t configured yet (missing VAPID public key).')

  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
  })

  const raw = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { teacher_id: teacherId, endpoint: raw.endpoint, subscription: raw },
    { onConflict: 'endpoint' }
  )
  if (error) throw error
}

export async function disablePush(teacherId: string): Promise<void> {
  const sub = await currentPushSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } else {
    // No live subscription object (e.g. different browser session) — just
    // clear anything saved for this teacher so stale endpoints don't linger.
    await supabase.from('push_subscriptions').delete().eq('teacher_id', teacherId)
  }
}
