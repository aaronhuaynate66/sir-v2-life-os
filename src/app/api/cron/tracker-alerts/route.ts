// SIR V2 — GET /api/cron/tracker-alerts
//
// Cron que evalúa los trackers en DB y manda EMAIL cuando se cumple una
// condición (precio ≤ umbral, faltan < N días) o un tracker queda viejo. Las
// alertas in-app no dependen de esto (se derivan en vivo en /seguimiento y
// /señales); este endpoint es SOLO la vía email.
//
// Auth: CRON_SECRET (Bearer), igual que weekly-summary. Si no está, rehúsa.
// Cliente service-role; iteramos trackers de todos los usuarios y mandamos al
// email de cada dueño (de auth.users), con fallback a TRACKER_ALERT_TO.
//
// Idempotencia: por tracker guardamos last_alert_kind + last_alert_at. Sólo
// mandamos si la alerta vigente DIFIERE de la última notificada (ver
// shouldSendEmail). Una lectura nueva resetea lastAlertKind (en el store), así
// que un re-cumplimiento vuelve a avisar.
//
// Fail-open: si no hay proveedor de email (RESEND_API_KEY), no manda nada y NO
// marca como notificado (para que mande cuando se configure). Si las tablas no
// existen aún (migración 0051 sin correr), devuelve ok con counts en 0.
//
// ACCIÓN MANUAL (env en Vercel): CRON_SECRET + SUPABASE_SERVICE_ROLE_KEY (ya
// debería estar). Opcional para email: RESEND_API_KEY, TRACKER_ALERT_FROM,
// APP_BASE_URL, TRACKER_ALERT_TO.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { trackerAdapter } from '@/lib/supabase/sync/adapters/trackers'
import { shouldSendEmail, buildEmailPayload } from '@/lib/trackers/notify'
import { sendEmail, isEmailConfigured, appBaseUrl } from '@/lib/email/send'
import type { Tracker } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TRACKER_SCAN_LIMIT = 5000

export async function GET(req: NextRequest) {
  // 1. Auth por CRON_SECRET.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET no configurada — el cron no corre sin protección.' },
      { status: 500 },
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Service-role client.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el server.' },
      { status: 500 },
    )
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const now = new Date()

  // 3. Leer trackers. Si la tabla no existe (0051 sin correr), no rompemos.
  const { data: rows, error: readError } = await admin
    .from('trackers')
    .select('*')
    .limit(TRACKER_SCAN_LIMIT)
  if (readError) {
    return NextResponse.json(
      { ok: true, note: 'tabla trackers no disponible (¿migración 0051 pendiente?)', detail: readError.message, sent: 0 },
      { status: 200 },
    )
  }

  const emailConfigured = isEmailConfigured()
  const baseUrl = appBaseUrl()
  const fallbackTo = process.env.TRACKER_ALERT_TO

  // Cache de emails por user_id (evita N llamadas a admin).
  const emailByUser = new Map<string, string | null>()
  async function emailFor(userId: string): Promise<string | null> {
    if (emailByUser.has(userId)) return emailByUser.get(userId) ?? null
    let email: string | null = fallbackTo ?? null
    try {
      const { data } = await admin.auth.admin.getUserById(userId)
      if (data?.user?.email) email = data.user.email
    } catch {
      // sin acceso → queda el fallback
    }
    emailByUser.set(userId, email)
    return email
  }

  let evaluated = 0
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const row of rows ?? []) {
    evaluated += 1
    const userId = row.user_id as string
    const tracker: Tracker = trackerAdapter.fromRow(row as Record<string, unknown>)

    const kind = shouldSendEmail(tracker, now)
    if (!kind) continue

    if (!emailConfigured) {
      skipped += 1
      continue
    }

    const to = await emailFor(userId)
    if (!to) {
      skipped += 1
      continue
    }

    const payload = buildEmailPayload(tracker, kind, baseUrl, now)
    const result = await sendEmail({ to, subject: payload.subject, text: payload.text, html: payload.html })

    if (result.sent) {
      sent += 1
      // Marcar como notificado (idempotencia). Si falla el update, lo reintenta
      // el próximo cron (a lo sumo un email repetido — aceptable).
      await admin
        .from('trackers')
        .update({ last_alert_kind: kind, last_alert_at: now.toISOString() })
        .eq('id', tracker.id)
    } else if ('skipped' in result && result.skipped) {
      skipped += 1
    } else {
      failed += 1
    }
  }

  return NextResponse.json(
    { ok: true, evaluated, sent, skipped, failed, emailConfigured, baseUrlSet: Boolean(baseUrl) },
    { status: 200 },
  )
}
