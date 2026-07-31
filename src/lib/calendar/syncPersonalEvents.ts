// SIR V2 — Sincronizar `personal_events` → Google Calendar. AUTOMÁTICO.
//
// ═══ POR QUÉ EXISTE ══════════════════════════════════════════════════════════
//
// Aaron, 31-jul-2026: *"me hiciste crear toda la integración con Google para tener
// dónde meter los eventos, así que empieza a hacer que funcione y de una vez para
// ayer"*. Y antes, dos veces: *"¿por qué sigo sin ver en mi calendario el matrimonio
// de Laura?"*.
//
// La integración estaba **completa y conectada** (`calendar_connections` con
// provider 'google', refresh token vivo) y existían `ensureFreshGoogleToken`,
// `createGoogleEvent` y `updateGoogleEvent`. Lo único que había era
// `POST /api/personal-events/[id]/push-to-google`: **una acción MANUAL, evento por
// evento, con sesión de navegador.** Nadie la corría nunca.
//
// Resultado: la boda del 1-ago cargada el 28-jul con `gcal_event_id: null`, y el
// calendario que él mira en el celular vacío. **No faltaba integración: faltaba que
// algo la llamara.** Es el patrón que salió seis veces ese día — ver la memoria
// `arreglar-la-superficie-que-el-nombro`.
//
// Este módulo es lo que la llama: desde el cron diario y desde el POST que crea un
// evento, para que suba solo y no dependa de que alguien se acuerde.

import type { SupabaseClient } from '@supabase/supabase-js'

import { ensureFreshGoogleToken } from './oauth/session'
import { createGoogleEvent, updateGoogleEvent } from './oauth/google'

/** Días hacia atrás que igual se suben (un evento de ayer sigue siendo historia útil). */
export const VENTANA_PASADA_DIAS = 7
/** Tope por corrida: es un cron, no un backfill infinito. */
export const MAX_POR_CORRIDA = 60

export interface PersonalEventSyncRow {
  id: string
  title: string | null
  event_date: string | null
  end_date: string | null
  all_day: boolean | null
  note: string | null
  gcal_event_id: string | null
  updated_at?: string | null
}

export interface SyncResult {
  /** Eventos creados en Google. */
  creados: number
  /** Ya tenían `gcal_event_id` → no se tocaron. */
  yaEstaban: number
  /** Fallaron (la razón va en `errores`). */
  fallidos: number
  /** Sin conexión de Google → no se intentó nada. */
  sinConexion: boolean
  errores: string[]
}

/** 'YYYY-MM-DD' de hace N días en hora de Lima (UTC-5). PURA salvo por el reloj. */
function desdeYmd(dias: number, nowMs: number): string {
  return new Date(nowMs - 5 * 3_600_000 - dias * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Qué texto va como descripción del evento en Google. PURA.
 *
 * La nota de SIR es el valor real del evento (la lista de qué pedir en la cita, con
 * quién va, qué llevar). Se manda completa: Google no tiene problema con prosa larga
 * y es justo lo que Aaron necesita ver al abrir el evento en el celular.
 */
export function descripcionParaGoogle(note: string | null | undefined): string | undefined {
  const s = (note ?? '').trim()
  if (!s) return undefined
  return `${s}\n\n— cargado por SIR`
}

/**
 * Sube a Google Calendar todo `personal_events` que aún no esté allá. IDEMPOTENTE:
 * un evento con `gcal_event_id` no se vuelve a crear.
 *
 * Fail-soft por evento: si uno falla (título raro, evento borrado en Google), los
 * demás siguen. Devuelve el conteo para que el llamador lo reporte.
 */
export async function syncPendingPersonalEvents(
  supabase: SupabaseClient,
  userId: string,
  opts: { nowMs?: number; limit?: number } = {},
): Promise<SyncResult> {
  const nowMs = opts.nowMs ?? Date.now()
  const limit = opts.limit ?? MAX_POR_CORRIDA
  const out: SyncResult = { creados: 0, yaEstaban: 0, fallidos: 0, sinConexion: false, errores: [] }

  const { data, error } = await supabase
    .from('personal_events')
    .select('id, title, event_date, end_date, all_day, note, gcal_event_id, updated_at')
    .eq('user_id', userId)
    .gte('event_date', desdeYmd(VENTANA_PASADA_DIAS, nowMs))
    .order('event_date', { ascending: true })
    .limit(limit)
  // PostgREST no lanza: el error viene en `.error` (trampa recurrente del repo).
  if (error) { out.errores.push(`leer personal_events: ${error.message}`); return out }

  const filas = (data ?? []) as PersonalEventSyncRow[]
  const pendientes = filas.filter((r) => r.title && r.event_date && !r.gcal_event_id)
  out.yaEstaban = filas.filter((r) => r.gcal_event_id).length
  if (pendientes.length === 0) return out

  // El token se pide UNA vez para todos: pedirlo por evento haría N refreshes.
  const fresh = await ensureFreshGoogleToken(supabase as never, userId)
  if (!fresh) { out.sinConexion = true; return out }

  for (const r of pendientes) {
    try {
      const created = await createGoogleEvent(fresh.token, {
        title: r.title as string,
        start: (r.event_date as string).slice(0, 10),
        end: r.end_date ? r.end_date.slice(0, 10) : undefined,
        allDay: r.all_day !== false,
        description: descripcionParaGoogle(r.note),
      })
      const { error: upErr } = await supabase
        .from('personal_events')
        .update({ gcal_event_id: created.id, updated_at: new Date(nowMs).toISOString() })
        .eq('user_id', userId).eq('id', r.id)
      // Si el UPDATE falla, el evento YA está en Google: marcarlo como fallido haría
      // que la próxima corrida lo duplique. Se cuenta como creado y se anota el error.
      if (upErr) out.errores.push(`marcar ${r.id}: ${upErr.message}`)
      out.creados++
    } catch (e) {
      out.fallidos++
      out.errores.push(`${r.id}: ${e instanceof Error ? e.message.slice(0, 140) : 'error'}`)
    }
  }
  return out
}

/**
 * Sube UN evento recién creado, en el mismo request. Devuelve el id de Google o null.
 *
 * Se usa desde el POST de `/api/personal-events` para que un plan cargado desde la
 * app aparezca en Google **de inmediato**, sin esperar al cron. Fail-soft: si Google
 * falla, el evento queda guardado en SIR y el cron lo reintenta.
 */
export async function pushOnePersonalEvent(
  supabase: SupabaseClient,
  userId: string,
  row: PersonalEventSyncRow,
): Promise<string | null> {
  if (!row?.title || !row?.event_date || row.gcal_event_id) return null
  try {
    const fresh = await ensureFreshGoogleToken(supabase as never, userId)
    if (!fresh) return null
    const created = await createGoogleEvent(fresh.token, {
      title: row.title,
      start: row.event_date.slice(0, 10),
      end: row.end_date ? row.end_date.slice(0, 10) : undefined,
      allDay: row.all_day !== false,
      description: descripcionParaGoogle(row.note),
    })
    await supabase.from('personal_events')
      .update({ gcal_event_id: created.id, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('id', row.id)
    return created.id
  } catch {
    return null // el cron lo reintenta
  }
}

/**
 * Reempuja a Google un evento que YA está allá, cuando cambió en SIR. Devuelve si
 * actualizó. Fail-soft.
 *
 * Sin esto, corregir la hora o la nota de un evento en SIR dejaba Google desfasado —
 * y el que Aaron mira en el celular es Google.
 */
export async function updateOnePersonalEvent(
  supabase: SupabaseClient,
  userId: string,
  row: PersonalEventSyncRow,
): Promise<boolean> {
  if (!row?.title || !row?.event_date || !row.gcal_event_id) return false
  try {
    const fresh = await ensureFreshGoogleToken(supabase as never, userId)
    if (!fresh) return false
    await updateGoogleEvent(fresh.token, row.gcal_event_id, {
      title: row.title,
      start: row.event_date.slice(0, 10),
      end: row.end_date ? row.end_date.slice(0, 10) : undefined,
      allDay: row.all_day !== false,
      description: descripcionParaGoogle(row.note),
    })
    return true
  } catch {
    return false
  }
}
