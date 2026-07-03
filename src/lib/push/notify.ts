// SIR V2 — Enviar Web Push notifications al server-side.
//
// Usa web-push con VAPID keys (env `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
// `VAPID_SUBJECT`). Toma la lista de subscripciones activas del usuario y
// manda push a cada una. Si el push service devuelve 410 Gone marca la
// subscription como disabled para no reintentar.

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

let configured = false
function configure(): boolean {
  if (configured) return true
  const pub = process.env.VAPID_PUBLIC_KEY?.trim()
  const priv = process.env.VAPID_PRIVATE_KEY?.trim()
  const subj = process.env.VAPID_SUBJECT?.trim() || 'mailto:ahuaynate@grupohng.com'
  if (!pub || !priv) return false
  webpush.setVapidDetails(subj, pub, priv)
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  requireInteraction?: boolean
}

interface SubRow { id: string; endpoint: string; p256dh: string; auth: string }

/** Manda un push a TODAS las subs activas de un usuario. Best-effort. Devuelve
 *  cuántas subs recibieron y cuántas fallaron. */
export async function pushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number; disabled: number }> {
  if (!configure()) return { sent: 0, failed: 0, disabled: 0 }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { sent: 0, failed: 0, disabled: 0 }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId).is('disabled_at', null).limit(20)
  const subs = ((data ?? []) as SubRow[])
  if (subs.length === 0) return { sent: 0, failed: 0, disabled: 0 }

  const body = JSON.stringify(payload)
  let sent = 0, failed = 0, disabled = 0
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      }, body)
      sent++
      void supabase.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', s.id)
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 0
      failed++
      if (status === 404 || status === 410) {
        disabled++
        void supabase.from('push_subscriptions').update({ disabled_at: new Date().toISOString(), last_failure_at: new Date().toISOString() }).eq('id', s.id)
      } else {
        void supabase.from('push_subscriptions').update({ last_failure_at: new Date().toISOString() }).eq('id', s.id)
      }
    }
  }))
  return { sent, failed, disabled }
}
