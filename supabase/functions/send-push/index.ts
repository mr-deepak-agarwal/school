// Supabase Edge Function: send-push
//
// Sends a web push notification to every device a given teacher has
// enabled alerts on. Called from the app right after a substitution is
// assigned (see SubstitutionsTab.tsx), passing the substitute teacher's id
// and the notification text.
//
// Deploy:
//   supabase functions deploy send-push
//
// Secrets it needs (set once with `supabase secrets set`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  — from `npx web-push generate-vapid-keys`
//   VAPID_SUBJECT                        — "mailto:you@yourschool.org"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// the Supabase runtime — no need to set those yourself.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:deepakagarwalsrc@gmail.com'

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: { teacherId?: string; title?: string; body?: string; url?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { teacherId, title, body: message, url } = body
  if (!teacherId || !title || !message) {
    return new Response('teacherId, title, and body are required', { status: 400 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, subscription')
    .eq('teacher_id', teacherId)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, note: 'No devices subscribed for this teacher.' }), { status: 200 })
  }

  const payload = JSON.stringify({ title, body: message, url: url ?? '/' })

  const results = await Promise.allSettled(
    subs.map((row) => webpush.sendNotification(row.subscription, payload))
  )

  // Endpoints the push service says are gone (410/404) are dead — drop them
  // so we stop retrying a device that's uninstalled the app / revoked
  // permission, rather than accumulating errors on every future send.
  const deadIds: number[] = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const statusCode = (r.reason as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) deadIds.push(subs[i].id)
    }
  })
  if (deadIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', deadIds)
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return new Response(JSON.stringify({ sent, total: subs.length, prunedDeadDevices: deadIds.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
