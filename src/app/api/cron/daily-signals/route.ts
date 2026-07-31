// SIR V2 — GET /api/cron/daily-signals
//
// ═══ POR QUÉ EXISTE ══════════════════════════════════════════════════════════
//
// Aaron, 31-jul-2026: *"por qué no tengo ninguna alerta de cómo viene mi relación
// con Diana si mis últimas conversaciones tan hasta las webas… pero sobre todo por
// qué SIR no es proactivo"*.
//
// El Índice de Afecto Expresado ya estaba construido (#924), surfaceado (#932) y en
// el chat (#963). Lo que faltaba no era el motor: era que **alguien lo corriera**.
// `person_daily_signals` solo la escribían el import manual de un export de
// WhatsApp y `/api/forecast` (o sea: cuando Aaron abre el panel). **No había cron.**
//
// Resultado medido el 31-jul: Diana con 820 filas de señales y la más nueva del
// **8-jul** — 23 días congelada, mientras el reader traía mensajes todos los días.
// El mes entero del deterioro no estaba medido, así que no había con qué alertar.
//
// Esto lo cierra: una pasada diaria que pone al día las señales (incluido el afecto)
// de las personas con conversación reciente. Con la serie fresca, las superficies
// que YA existen (la card de afecto, el clima afectivo en el chat de SIR) dejan de
// mirar un mes viejo.
//
// Auth: CRON_SECRET (mismo patrón que los otros crons).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { reportApiError } from '@/lib/observability/reportApiError'
import { planTopUpSignals } from '@/lib/forecast-conductual/topUpSignals'
import { limaDayKey } from '@/lib/dates/limaDay'
import type { ChatMessage } from '@/lib/forecast-conductual/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Ventana de conversación que se mira. Cubre el arranque en frío de una persona
 *  nueva y da margen para días que el reader trajo con retraso. */
const VENTANA_DIAS = 35
/** Tope de mensajes por persona en la pasada: es un cron, no un backfill. El
 *  histórico completo lo reconstruye `/api/forecast` cuando se abre el panel. */
const MAX_MSGS_POR_PERSONA = 8_000

export async function GET(req: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase envs missing' }, { status: 500 })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const nowIso = new Date().toISOString()
  const hoy = limaDayKey(nowIso) ?? nowIso.slice(0, 10)
  // `sent_at` guarda hora de PARED de Lima (ver `chat-messages/append`), así que el
  // corte se calcula sobre el día de Lima y NO sobre UTC: mezclarlos corría la
  // ventana 5 h y podía dejar afuera la conversación de anoche.
  const desde = new Date(Date.parse(`${hoy}T00:00:00Z`) - VENTANA_DIAS * 86_400_000)
    .toISOString().slice(0, 10)

  try {
    // 1. Personas con conversación en la ventana. Se piden solo los person_id y se
    //    deduplican en memoria: PostgREST no hace DISTINCT y traer el id es barato.
    const conActividad = new Set<string>()
    const pares = new Map<string, string>() // personId → userId
    const PAGE = 1000
    for (let from = 0; from < 20_000; from += PAGE) {
      const { data, error } = await admin
        .from('chat_messages').select('user_id, person_id')
        .gte('sent_at', desde).not('person_id', 'is', null)
        .range(from, from + PAGE - 1)
      // PostgREST no lanza: el error viene en `.error` (trampa recurrente del repo).
      if (error) { reportApiError(new Error(error.message), { route: 'cron/daily-signals', step: 'scan' }); break }
      const rows = (data ?? []) as Array<{ user_id: string; person_id: string }>
      for (const r of rows) { conActividad.add(r.person_id); pares.set(r.person_id, r.user_id) }
      if (rows.length < PAGE) break
    }

    let personas = 0, filas = 0
    for (const personId of conActividad) {
      const userId = pares.get(personId)
      if (!userId) continue
      personas++

      // 2. Qué días ya están guardados (solo la ventana: el resto no se toca).
      const { data: sigRows } = await admin
        .from('person_daily_signals').select('date')
        .eq('user_id', userId).eq('person_id', personId).gte('date', desde).limit(200)
      const storedDates = ((sigRows ?? []) as Array<{ date: string }>).map((r) => r.date)

      // 3. Mensajes de la ventana. Filtrados por fecha a propósito: bajar el hilo
      //    completo (74k con Diana) por persona y por día es lo que haría timeout.
      const { data: msgRows } = await admin
        .from('chat_messages').select('sender, sent_at, content, is_media')
        .eq('user_id', userId).eq('person_id', personId)
        .gte('sent_at', desde).not('sent_at', 'is', null)
        .order('sent_at', { ascending: true }).limit(MAX_MSGS_POR_PERSONA)
      const messages: ChatMessage[] = ((msgRows ?? []) as Array<{ sender: string | null; sent_at: string; content: string | null; is_media: boolean | null }>)
        .filter((r) => typeof r.sent_at === 'string' && r.sent_at.length >= 10)
        .map((r) => ({
          at: r.sent_at,
          author: r.sender === 'user' ? 'user' : 'other',
          text: r.content ?? '',
          kind: r.is_media ? 'media' : 'text',
        }))
      if (messages.length === 0) continue

      const { rows } = planTopUpSignals({ userId, personId, messages, storedDates, hoy, nowIso })
      if (rows.length === 0) continue
      const { error } = await admin.from('person_daily_signals').upsert(rows, { onConflict: 'id' })
      if (error) { reportApiError(new Error(error.message), { route: 'cron/daily-signals', step: 'upsert' }); continue }
      filas += rows.length
    }

    return NextResponse.json({ personas, filas, desde, hoy })
  } catch (e) {
    reportApiError(e, { route: 'cron/daily-signals' })
    return NextResponse.json({ error: 'Fallo poniendo al día las señales' }, { status: 500 })
  }
}
