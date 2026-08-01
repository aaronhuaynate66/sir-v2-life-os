// SIR V2 — GET /api/cron/reminders-due
//
// Respaldo diario (vercel.json: 0 11 * * * ≈ 6am Lima) para app CERRADA. El
// camino primario es el watcher client-side /api/reminders/fire-due (app abierta).
// LIMITACIÓN (plan Hobby): con la app cerrada, un recordatorio con hora solo se
// pushea en el próximo tick diario, no a su hora exacta. Busca reminders con
// due_at <= now, done_at IS NULL, notified_at IS NULL. Por cada uno:
//   1. Dispara push notification al user (best-effort).
//   2. Marca notified_at para no re-disparar.
// Auth: CRON_SECRET.

import { NextResponse, type NextRequest } from 'next/server'
import { filasOFalla } from '@/lib/cron/consulta'
import { puedeMarcarseAvisado, resumenDeEntrega, type Entrega } from '@/lib/push/entrega'
import { reportApiError } from '@/lib/observability/reportApiError'
import { createClient } from '@supabase/supabase-js'
import { pushToUser } from '@/lib/push/notify'
import { isTelegramConfigured, sendTelegramMessage } from '@/lib/telegram/client'
import { textoRecordatorio } from '@/lib/push/cuandoVence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase envs missing' }, { status: 500 })

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const nowMs = Date.now()

  // ═══ MIRA HACIA ADELANTE, NO SOLO HACIA ATRÁS ═════════════════════════════
  //
  // Antes la consulta era `due_at <= now` y con un cron DIARIO eso llega tarde:
  // cualquier recordatorio que venza entre dos corridas se avisa hasta 23 h después
  // de su hora. Para algo con hora fija es fatal.
  //
  // Caso REAL, encontrado el 31-jul-2026 y a 7 días de ocurrir: su examen médico del
  // IPD para el Mundial, el **7-ago a las 8:10 am**, cargado con `due_at` 12:00 UTC
  // (07:00 Lima). El cron corre 11:00 UTC → ese día `due_at` **todavía no había
  // vencido** y no disparaba; la corrida siguiente era el **8-ago, un día DESPUÉS
  // del examen.** Nunca se lo iba a avisar.
  //
  // Y el aviso del mismo día ya era inútil: el examen pide **ayuno de 8 h** (empieza
  // la noche anterior), **Anexo 2 impreso** y un **formulario psicológico previo**.
  //
  // 36 h de anticipación: alcanza para que algo de mañana temprano se avise HOY, con
  // la noche de por medio. Es una sola notificación (`notified_at` la cierra), así
  // que el texto tiene que decir CUÁNDO es — si no, "recordatorio: examen 8:10am"
  // leído un día antes se entiende como si fuera hoy.
  const LOOKAHEAD_HORAS = 36
  const hasta = new Date(nowMs + LOOKAHEAD_HORAS * 3_600_000).toISOString()

  // `filasOFalla`, no `data ?? []`: si esta consulta falla, PostgREST no lanza y
  // `rows` queda vacío, así que el cron responde **200 con `processed: 0`** — se ve
  // idéntico a "hoy no vence nada". Y lo que vence acá son cosas como el examen del
  // IPD del 7-ago a las 8:10 con 8 h de ayuno: un aviso perdido en silencio no se
  // recupera al día siguiente. Ahora un fallo se ve como fallo. [[postgrest-columna-inexistente]]
  const rows = filasOFalla<{ id: string; user_id: string; text: string; related_person_id: string | null; due_at: string | null }>(
    await supabase.from('reminders')
      .select('id, user_id, text, related_person_id, due_at')
      .lte('due_at', hasta).is('done_at', null).is('notified_at', null).limit(50),
    'recordatorios que vencen',
  )
  // Cero con la consulta OK sí es legítimo: hoy no vence nada.
  if (rows.length === 0) return NextResponse.json({ processed: 0 })

  // Traer person slug para deep-link.
  const pids = [...new Set(rows.map((r) => r.related_person_id).filter((v): v is string => v != null))]
  const slugById = new Map<string, string | null>()
  if (pids.length > 0) {
    const { data: peopleRaw } = await supabase.from('people').select('id, slug').in('id', pids)
    for (const p of ((peopleRaw ?? []) as Array<{ id: string; slug: string | null }>)) slugById.set(p.id, p.slug)
  }

  // Entrega TAMBIÉN por Telegram al dueño (el Web Push depende de VAPID, que
  // puede no estar configurado; Telegram está vivo). Mismo patrón que morning-push.
  const tgReady = isTelegramConfigured()
  const tgOwnerId = process.env.TELEGRAM_OWNER_USER_ID?.trim() || null
  const tgChat = process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim() || null

  // ═══ `notified_at` SIGNIFICA "SE LE DIJO", NO "SE INTENTÓ DECIRLE" ══════════
  //
  // Antes se marcaba SIEMPRE. La intención era no repetir el aviso, pero el efecto
  // era que **un aviso que no llegó se cerraba para siempre**. Y no había forma de
  // saberlo: `pushToUser` devuelve `{ sent, failed }` y se lo llamaba con `void`,
  // y el envío de Telegram vivía en un `catch {}` que se comía el error.
  //
  // Medido el 1-ago-2026: la ÚNICA suscripción de Web Push es de Apple y es del
  // 13-jun (esas caducan). Si esa falla y Telegram tropieza, el recordatorio del
  // examen del IPD del 7-ago —8:10 am, ayuno de 8 h, Anexo 2 impreso— quedaba
  // marcado como avisado y el examen se pasaba en silencio.
  //
  // Ahora: si ningún canal entregó, se deja ABIERTO y mañana se reintenta.
  // Reintentar es molesto; perder el examen que habilita el Mundial no tiene
  // arreglo. [[fechas-clave-de-aaron]]
  let notified = 0
  let sinEntregar = 0
  for (const r of rows) {
    const slug = r.related_person_id ? slugById.get(r.related_person_id) : null
    const cuerpo = textoRecordatorio(r.text, r.due_at, nowMs)
    const entregas: Entrega[] = []

    try {
      const res = await pushToUser(r.user_id, {
        title: 'SIR · Recordatorio',
        body: cuerpo,
        url: slug ? `/relaciones/${slug}` : '/panel',
        tag: `reminder-${r.id}`,
        requireInteraction: false,
      })
      entregas.push({
        canal: 'web-push',
        entregado: res.sent > 0,
        ...(res.sent > 0 ? {} : { detalle: `sent=0 failed=${res.failed} disabled=${res.disabled}` }),
      })
    } catch (e) {
      entregas.push({ canal: 'web-push', entregado: false, detalle: String(e).slice(0, 100) })
    }

    if (tgReady && tgChat && tgOwnerId && r.user_id === tgOwnerId) {
      try {
        await sendTelegramMessage(Number(tgChat), `⏰ Recordatorio: ${cuerpo}`)
        entregas.push({ canal: 'telegram', entregado: true })
      } catch (e) {
        entregas.push({ canal: 'telegram', entregado: false, detalle: String(e).slice(0, 100) })
      }
    }

    const resumen = resumenDeEntrega(entregas)
    if (resumen) reportApiError(new Error(`reminder ${r.id}: ${resumen}`), { route: 'cron/reminders-due' })

    if (puedeMarcarseAvisado(entregas)) {
      await supabase.from('reminders').update({ notified_at: new Date().toISOString() }).eq('id', r.id)
      notified++
    } else {
      // Queda abierto a propósito: el próximo tick lo reintenta.
      sinEntregar++
    }
  }

  return NextResponse.json({ processed: rows.length, notified, sinEntregar })
}
