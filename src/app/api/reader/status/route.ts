// SIR V2 — GET /api/reader/status
//
// Estado de la ingesta del SIR Reader (extensión que lee WhatsApp/Teams/Outlook
// desde otra PC y postea a /api/reader/ingest). Responde "¿está entrando data,
// de qué, cuándo, y se cruzó con alguien?" — para no estar ciegos. User-scoped.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { diagnoseChannel, tieneDiagnostico } from '@/lib/reader/channelSilence'
import { lectorVivo, probeLine, normalizarProbe } from '@/lib/reader/comandos'
import { ultimaDataPorCanal, type ClienteMinimo } from '@/lib/reader/ultimaData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ThreadRow { platform: string; thread_name: string | null; last_ts: string | null; last_ingested_at: string | null }
interface ObsRow { observed_at: string | null; person_id: string | null; data: { platform?: string; source?: string; thread_name?: string; message_count?: number } | null }

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  // Hilos que el reader viene siguiendo (con su cursor incremental).
  const { data: threadsRaw } = await supabase
    .from('reader_threads')
    .select('platform, thread_name, last_ts, last_ingested_at')
    .eq('user_id', userId)
    .order('last_ingested_at', { ascending: false })
    .limit(200)
  const threads = (threadsRaw ?? []) as ThreadRow[]

  // Observaciones creadas por el reader (dm_conversation con source='reader').
  const { data: obsRaw } = await supabase
    .from('observations')
    .select('observed_at, person_id, data')
    .eq('user_id', userId)
    .eq('capture_type', 'dm_conversation')
    .order('observed_at', { ascending: false })
    .limit(500)
  const readerObs = ((obsRaw ?? []) as ObsRow[]).filter((o) => o.data?.source === 'reader')

  // Agregados por plataforma.
  const byPlatform: Record<string, { threads: number; observations: number; messages: number; matched: number; lastIngestAt: string | null }> = {}
  for (const t of threads) {
    const p = (byPlatform[t.platform] ??= { threads: 0, observations: 0, messages: 0, matched: 0, lastIngestAt: null })
    p.threads += 1
    if (t.last_ingested_at && (!p.lastIngestAt || t.last_ingested_at > p.lastIngestAt)) p.lastIngestAt = t.last_ingested_at
  }
  for (const o of readerObs) {
    const plat = o.data?.platform ?? 'desconocido'
    const p = (byPlatform[plat] ??= { threads: 0, observations: 0, messages: 0, matched: 0, lastIngestAt: null })
    p.observations += 1
    p.messages += o.data?.message_count ?? 0
    if (o.person_id) p.matched += 1
  }

  // Mensajes canónicos que el reader appendeó (source='reader') — total.
  //
  // `count: 'exact'` acá costaba ~20 s: obliga a Postgres a contar filas sobre
  // `chat_messages`, que pasa las 285.000, y esta página lo esperaba para pintar un
  // número que nadie compara al dígito. `planned` usa la estimación del planificador
  // y responde en milisegundos. Medido el 4-ago-2026, cuando el panel nuevo de
  // canales hizo notoria la demora.
  //
  // Se acepta que el número sea aproximado A PROPÓSITO, y la respuesta lo declara
  // (`readerChatMessagesAprox`) para que ninguna vista lo presente como exacto: un
  // número redondo presentado como preciso es peor que un número redondo.
  let readerChatMessages = 0
  try {
    const { count } = await supabase
      .from('chat_messages')
      .select('id', { count: 'planned', head: true })
      .eq('user_id', userId)
      .eq('source', 'reader')
    readerChatMessages = count ?? 0
  } catch { /* tabla puede no existir en algún entorno */ }

  // ═══ ESTADO DE CADA CANAL: el veredicto, no solo el conteo ══════════════════
  //
  // Aaron, 4-ago-2026, sobre la línea del brief que decía que Instagram corría sin
  // traer nada: *"no entiendo si sirve o no sirve, qué hacemos, se me ocurre crear
  // una sección de estatus en SIR que se sincronice con la extensión"*.
  //
  // Era la pieza que faltaba, y casi todo estaba escrito y HUÉRFANO:
  // `reader_heartbeats.probe` se escribía y no se leía en ningún lado, y
  // `lectorVivo`/`probeLine` —que distinguen "la pestaña está abierta" de "el
  // lector está leyendo"— solo aparecían en sus propios tests. Esta página
  // contaba mensajes ingeridos y NO consultaba `reader_heartbeats`, así que el
  // brief de Telegram y `/reader` contaban historias distintas con datos distintos.
  //
  // Ahora los dos usan el mismo veredicto: `diagnoseChannel`.
  let canales: Array<Record<string, unknown>> = []
  try {
    const [{ data: hbRaw }, dataPorCanal] = await Promise.all([
      supabase
        .from('reader_heartbeats')
        .select('channel, last_beat_at, last_data_at, status, detail, ext_version, sent_count, last_error, probe')
        .eq('user_id', userId)
        .order('last_beat_at', { ascending: false }),
      // La MISMA fuente de verdad que usa el brief. Sin esto, este panel decía
      // "Instagram nunca trajo nada" (porque `last_data_at` está en null) mientras
      // el brief decía "hace 4 días que no trae nada" — mismo día, misma base.
      ultimaDataPorCanal(supabase as unknown as ClienteMinimo, userId),
    ])
    const ahora = new Date()
    const filas = (hbRaw ?? []) as Array<Record<string, unknown>>
    // Un canal que trajo datos EXISTE aunque nunca haya latido: el latido refina el
    // diagnóstico, no es la condición para tenerlo.
    const nombres = new Set(filas.map((r) => String(r.channel ?? '')))
    for (const [c, iso] of Object.entries(dataPorCanal)) if (iso) nombres.add(c)
    const porCanal = new Map(filas.map((r) => [String(r.channel ?? ''), r]))

    canales = [...nombres].map((channel) => {
      const r = porCanal.get(channel) ?? {}
      const probe = normalizarProbe(r.probe)
      const lastDataAt = (r.last_data_at as string | null) ?? dataPorCanal[channel] ?? null
      const veredicto = diagnoseChannel({
        channel,
        lastHeartbeatAt: (r.last_beat_at as string | null) ?? null,
        lastDataAt,
        status: (r.status as string | null) ?? null,
      }, ahora)
      return {
        channel,
        lastBeatAt: r.last_beat_at ?? null,
        lastDataAt,
        status: r.status ?? null,
        detail: r.detail ?? null,
        extVersion: r.ext_version ?? null,
        sentCount: r.sent_count ?? null,
        lastError: r.last_error ?? null,
        // El veredicto compartido con el brief.
        kind: veredicto.kind,
        hoursSinceHeartbeat: veredicto.hoursSinceHeartbeat,
        daysSinceData: veredicto.daysSinceData,
        // Lo que estaba huérfano: ¿está LEYENDO, no solo abierto?
        // `null` = "no sé", nunca "sano por defecto".
        lectorVivo: lectorVivo(probe),
        probeLine: probeLine(channel, probe),
        // Y la verdad incómoda: para estos canales la pregunta no tiene respuesta.
        tieneDiagnostico: tieneDiagnostico(channel),
      }
    })
  } catch { /* 0175/0181 sin propagar → la página muestra el resto */ }

  const recent = readerObs.slice(0, 25).map((o) => ({
    observedAt: o.observed_at,
    platform: o.data?.platform ?? '?',
    threadName: o.data?.thread_name ?? '(sin nombre)',
    messageCount: o.data?.message_count ?? 0,
    matched: !!o.person_id,
  }))

  return NextResponse.json({
    canales,
    threads: threads.map((t) => ({
      platform: t.platform,
      threadName: t.thread_name ?? '(sin nombre)',
      lastIngestAt: t.last_ingested_at,
      lastMessageAt: t.last_ts,
    })),
    byPlatform,
    recent,
    totals: {
      threads: threads.length,
      readerObservations: readerObs.length,
      readerChatMessages,
      /** `true` porque el conteo es la estimación del planificador, no un conteo
       *  exacto (ver arriba). Quien lo muestre debe decir que es aproximado. */
      readerChatMessagesAprox: true,
    },
  })
}
