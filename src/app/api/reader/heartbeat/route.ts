// SIR V2 — POST /api/reader/heartbeat
//
// La extensión reporta, cada ~10 minutos y por CANAL, que sigue viva. Sirve para
// distinguir "no pasó nada" de "el canal está muerto" — dos cosas que hasta ahora
// se veían idénticas desde el server.
//
// POR QUÉ EXISTE (fallo real, 22→29 jul 2026): el reader de WhatsApp Web traía los
// mensajes de Aaron con latencia de segundos, se cortó el 22-jul, y nadie lo notó
// hasta que él preguntó el 29 por qué no estaban sus conversaciones con Diana.
// Siete días ciego, y encima Instagram siguió andando todo ese tiempo — así que
// desde afuera el reader parecía sano. Sin latido, el silencio no se puede leer.
//
// Auth: MISMO token que el resto del reader (x-reader-token / Bearer).
// Cliente service-role con user_id explícito (patrón del repo: los loaders no se
// auto-scopean).
//
// Body: { channel: 'whatsapp'|'instagram'|..., status?: 'ok'|'logged_out'|string,
//         detail?: string }

import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { reportApiError } from '@/lib/observability/reportApiError'
import { normalizarProbe, elegirParaEntregar, type Comando } from '@/lib/reader/comandos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

/** Canales que aceptamos. Uno desconocido se rechaza para no llenar la tabla de
 *  basura por un typo en la extensión. */
const CANALES = new Set(['whatsapp', 'instagram', 'linkedin', 'teams', 'outlook'])

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function readToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim()
  return req.headers.get('x-reader-token')?.trim() || null
}

async function resolveUserId(admin: SupabaseClient): Promise<string | null> {
  const explicit = (process.env.READER_INGEST_USER_ID || process.env.HEALTH_INGEST_USER_ID)?.trim()
  if (explicit) return explicit
  const { data } = await admin.from('profiles').select('id').limit(2)
  const rows = (data ?? []) as Array<{ id: string }>
  return rows.length === 1 ? rows[0].id : null
}

export async function POST(req: NextRequest) {
  const expected = process.env.READER_INGEST_TOKEN?.trim()
  if (!expected) return NextResponse.json({ error: 'READER_INGEST_TOKEN no configurado' }, { status: 503 })
  const got = readToken(req)
  if (!got || !safeEqual(got, expected)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const b = (body ?? {}) as {
    channel?: unknown; status?: unknown; detail?: unknown
    extVersion?: unknown; lastError?: unknown; sentCount?: unknown; probe?: unknown
    result?: unknown
  }

  const channel = typeof b.channel === 'string' ? b.channel.trim().toLowerCase() : ''
  if (!CANALES.has(channel)) {
    return NextResponse.json({ error: `canal desconocido: ${channel || '(vacío)'}` }, { status: 400 })
  }
  const status = typeof b.status === 'string' && b.status.trim() ? b.status.trim().slice(0, 60) : 'ok'
  const detail = typeof b.detail === 'string' ? b.detail.slice(0, 300) : null
  // Mig 0181 — lo que el latido NUNCA mandaba y por eso el reader pudo estar caído
  // 4 días diciendo 'ok': la versión de la extensión, su último error, cuánto dice
  // haber mandado, y el diagnóstico del lector (¿cargó la librería del Store?
  // ¿cuántos chats ve?). "Pestaña abierta" y "lector leyendo" eran indistinguibles.
  const extVersion = typeof b.extVersion === 'string' ? b.extVersion.slice(0, 40) : null
  const lastError = typeof b.lastError === 'string' && b.lastError ? b.lastError.slice(0, 300) : null
  const sentCount = typeof b.sentCount === 'number' && Number.isFinite(b.sentCount)
    ? Math.max(0, Math.floor(b.sentCount)) : null
  const probe = normalizarProbe(b.probe)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 })
  const admin = createClient(url, key, { auth: { persistSession: false } })

  try {
    const userId = await resolveUserId(admin)
    if (!userId) return NextResponse.json({ error: 'no pude resolver el usuario' }, { status: 500 })

    const now = new Date().toISOString()
    // Una fila por (usuario, canal): es un ESTADO presente, no un histórico. Un
    // latido cada 10 min serían ~150 filas/día por canal para responder siempre la
    // misma pregunta ("¿está vivo ahora?").
    const { error } = await admin.from('reader_heartbeats').upsert({
      user_id: userId, channel, last_beat_at: now, status, detail, updated_at: now,
      ...(extVersion !== null ? { ext_version: extVersion } : {}),
      ...(sentCount !== null ? { sent_count: sentCount } : {}),
      // `last_error` y `probe` se escriben SIEMPRE, incluso en null: si el error se
      // resolvió, la fila tiene que dejar de mostrarlo. Un error pegado para siempre
      // es tan inútil como no tenerlo.
      last_error: lastError,
      probe: probe as unknown as Record<string, unknown> | null,
    }, { onConflict: 'user_id,channel' })
    // PostgREST no lanza: el error viene en `.error` (trampa de #947).
    if (error) throw new Error(error.message)

    // ── RESULTADO de un comando anterior ─────────────────────────────────────
    // La extensión reporta acá lo que ejecutó. Se cierra el ciclo del comando:
    // 'entregado' → 'ok' | 'error'. Sin esto no se puede distinguir "nunca lo
    // recibió" de "lo recibió y falló", que es la ambigüedad que costó los 4 días.
    const res = b.result as { id?: unknown; ok?: unknown; detalle?: unknown } | undefined
    if (res && typeof res.id === 'string' && res.id) {
      try {
        await admin.from('reader_commands').update({
          status: res.ok === true ? 'ok' : 'error',
          done_at: now,
          result: typeof res.detalle === 'string' ? res.detalle.slice(0, 500) : null,
        }).eq('id', res.id).eq('user_id', userId)
      } catch { /* fail-soft: perder el acuse no puede tumbar el latido */ }
    }

    // ── COMANDOS PENDIENTES en la RESPUESTA ──────────────────────────────────
    // Acá vive el "manejo remoto" que pidió Aaron. Esta respuesta se descartaba por
    // completo en `background.js`; ahora lleva las órdenes. Cero polling, cero
    // permisos nuevos, cero requests extra: es la misma llamada de siempre.
    let comandos: Comando[] = []
    try {
      const { data: pend } = await admin
        .from('reader_commands')
        .select('id, kind, params')
        .eq('user_id', userId).eq('channel', channel).eq('status', 'pendiente')
        .order('created_at', { ascending: true })
        .limit(5)
      comandos = elegirParaEntregar(((pend ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        kind: r.kind as Comando['kind'],
        params: (r.params ?? {}) as Comando['params'],
      })))
      if (comandos.length > 0) {
        await admin.from('reader_commands')
          .update({ status: 'entregado', delivered_at: now })
          .in('id', comandos.map((c) => c.id))
      }
    } catch {
      // Tabla no propagada todavía (ventana de deploy) → el latido sigue sirviendo.
      comandos = []
    }

    return NextResponse.json({ ok: true, channel, status, comandos })
  } catch (e) {
    reportApiError(e, { route: 'reader/heartbeat', channel })
    return NextResponse.json({ error: 'no pude registrar el latido' }, { status: 500 })
  }
}
