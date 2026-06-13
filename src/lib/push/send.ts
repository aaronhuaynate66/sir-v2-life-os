// SIR V2 — Envío de Web Push (server). Configura VAPID desde env y manda a las
// suscripciones del usuario; poda las que el navegador ya descartó (404/410).
import webpush from 'web-push'

type ServerSupabase = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

let configured = false
/** Configura VAPID una vez. false si faltan las env (push deshabilitado). */
export function vapidReady(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) return false
  if (!configured) {
    webpush.setVapidDetails(subject, pub, priv)
    configured = true
  }
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

interface PushRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Envía `payload` a TODAS las suscripciones del usuario. Devuelve cuántas se
 *  enviaron y cuántas se podaron (expiradas). configured=false si falta VAPID. */
export async function sendPushToUser(
  supabase: ServerSupabase,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number; configured: boolean }> {
  if (!vapidReady()) return { sent: 0, pruned: 0, configured: false }
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
  const rows = (data ?? []) as PushRow[]
  let sent = 0
  let pruned = 0
  for (const r of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        JSON.stringify(payload),
      )
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', r.id)
        pruned++
      }
    }
  }
  return { sent, pruned, configured: true }
}
