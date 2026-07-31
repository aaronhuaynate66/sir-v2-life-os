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
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, fetchGoogleCalendarEvents, type NewGoogleEvent } from './oauth/google'
import { huerfanosParaAdoptar, huerfanosParaBorrar } from './huerfanos'
import { rangoHorarioDeNota, tituloCorto } from './horaDeNota'

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
  /** Ya tenían `gcal_event_id`: se reempujaron para mantener Google al día. */
  yaEstaban: number
  /** Cuántos de esos se actualizaron OK en Google. */
  actualizados: number
  /** Filas que recuperaron su gcal_event_id mirando lo que Google ya tenía. */
  adoptados: number
  /** Duplicados huérfanos eliminados de Google. */
  borrados: number
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
 * Arma el evento de Google desde la fila. PURA salvo el parseo de la nota.
 *
 * ═══ LA HORA, QUE ESTABA ENTERRADA EN EL TEXTO ═══════════════════════════════
 *
 * Aaron, con una captura de su calendario: *"mira cómo se ve en el calendario la
 * agenda de la hora, no quiero ni imaginar cómo se ve dentro del calendario de SIR"*.
 *
 * Todo subía como **"todo el día"** porque `personal_events.event_date` es un DATE
 * sin hora — así que su cita del maxilofacial (4:00 pm) y su examen del IPD (8:10 am)
 * salían como banderitas en la franja de arriba, sin poder ubicarlas en el día. Y de
 * paso Google le ponía el recordatorio por defecto a las 23:30 del día anterior, que
 * para un examen con ayuno es inútil. **La hora SÍ estaba: enterrada en la nota.**
 *
 * Si la nota trae hora se manda un evento CRONOMETRADO (Google ya lo soportaba con
 * `dateTime` + `timeZone`, default America/Lima); si no, se queda de día completo,
 * que es lo honesto. Un rango de varios días (`end_date`) se respeta como all-day.
 * El título se acorta porque el chip de la vista semanal lo cortaba a la mitad.
 */
export function eventoParaGoogle(row: PersonalEventSyncRow): NewGoogleEvent {
  const fecha = (row.event_date as string).slice(0, 10)
  const rango = rangoHorarioDeNota(fecha, row.note)
  const base = { title: tituloCorto(row.title as string), description: descripcionParaGoogle(row.note) }
  if (rango && !row.end_date) {
    return { ...base, start: rango.startISO, end: rango.endISO, allDay: false }
  }
  return { ...base, start: fecha, end: row.end_date ? row.end_date.slice(0, 10) : undefined, allDay: row.all_day !== false }
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
  const out: SyncResult = { creados: 0, yaEstaban: 0, actualizados: 0, adoptados: 0, borrados: 0, fallidos: 0, sinConexion: false, errores: [] }

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
  // Los que YA están en Google se REEMPUJAN, no se ignoran. Sin esto, Google se queda
  // con la versión del día que se creó: corregir una hora, un título o la nota en SIR
  // no llegaba nunca al calendario que Aaron mira. Pasó en vivo — los 15 eventos se
  // subieron como "todo el día" y al arreglar el parseo de la hora había que
  // actualizarlos uno por uno a mano.
  const yaEnGoogle = filas.filter((r) => r.title && r.event_date && r.gcal_event_id)
  out.yaEstaban = yaEnGoogle.length
  if (pendientes.length === 0 && yaEnGoogle.length === 0) return out

  // El token se pide UNA vez para todos: pedirlo por evento haría N refreshes.
  const fresh = await ensureFreshGoogleToken(supabase as never, userId)
  if (!fresh) { out.sinConexion = true; return out }

  // ═══ ANTES DE TOCAR NADA: reconciliar con lo que Google TIENE ══════════════
  //
  // Aaron, 31-jul-2026, con captura: el viernes 7 tenía DOS eventos del mismo examen
  // (la banderita vieja y el cronometrado) con UNA sola fila en `personal_events`.
  //
  // El huérfano nace del hueco que este archivo ya documentaba: si el UPDATE del
  // `gcal_event_id` falla después de crear el evento, SIR pierde la referencia y la
  // corrida siguiente crea otro. El primero queda huérfano y **ningún update lo va a
  // corregir nunca** — se queda "todo el día" para siempre.
  //
  // Se ADOPTA antes de crear (conserva los recordatorios que él le haya puesto en
  // Google) y se BORRA solo el duplicado confirmado. Ver `huerfanos.ts` para el
  // criterio conservador. Fail-soft: si listar Google falla, se sigue sin reconciliar.
  try {
    const desde = new Date(Date.parse(`${desdeYmd(VENTANA_PASADA_DIAS, nowMs)}T00:00:00Z`)).toISOString()
    const hasta = new Date(nowMs + 400 * 86_400_000).toISOString()
    const enGoogle = (await fetchGoogleCalendarEvents(fresh.token, desde, hasta, 250))
      .map((e) => ({ id: e.id, title: e.title, start: e.start }))
    const administrados = filas
      .filter((r) => r.title && r.event_date)
      .map((r) => ({ title: r.title as string, date: String(r.event_date).slice(0, 10), gcalEventId: r.gcal_event_id }))

    // 1. ADOPTAR: la fila perdió su referencia pero el evento sí existe allá.
    for (const a of huerfanosParaAdoptar(enGoogle, administrados)) {
      const fila = pendientes.find((r) => String(r.event_date).slice(0, 10) === a.date && r.title === a.adminTitle)
      if (!fila) continue
      const { error: adErr } = await supabase.from('personal_events')
        .update({ gcal_event_id: a.gcalEventId }).eq('user_id', userId).eq('id', fila.id)
      if (adErr) { out.errores.push(`adoptar ${fila.id}: ${adErr.message}`); continue }
      fila.gcal_event_id = a.gcalEventId // deja de ser pendiente: abajo se actualiza
      yaEnGoogle.push(fila)
      out.adoptados++
    }

    // 2. BORRAR los duplicados confirmados.
    for (const h of huerfanosParaBorrar(enGoogle, administrados)) {
      try {
        await deleteGoogleEvent(fresh.token, h.id)
        out.borrados++
        out.errores.push(`borrado duplicado ${h.date} "${h.title.slice(0, 40)}" — ${h.motivo}`)
      } catch (e) {
        out.errores.push(`borrar ${h.id}: ${e instanceof Error ? e.message.slice(0, 100) : 'error'}`)
      }
    }
  } catch (e) {
    out.errores.push(`reconciliar con Google: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}`)
  }

  // Los adoptados ya no van por el camino de creación.
  const porCrear = pendientes.filter((r) => !r.gcal_event_id)

  for (const r of yaEnGoogle) {
    try {
      await updateGoogleEvent(fresh.token, r.gcal_event_id as string, eventoParaGoogle(r))
      out.actualizados++
    } catch (e) {
      // Un evento borrado a mano en Google devuelve 404/410. NO se cuenta como fallo
      // duro ni se limpia el `gcal_event_id`: si Aaron lo borró a propósito, volver a
      // crearlo sería pelearse con él.
      out.errores.push(`update ${r.id}: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}`)
    }
  }

  for (const r of porCrear) {
    try {
      const created = await createGoogleEvent(fresh.token, {
        ...eventoParaGoogle(r),
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
    const created = await createGoogleEvent(fresh.token, eventoParaGoogle(row))
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
    await updateGoogleEvent(fresh.token, row.gcal_event_id, eventoParaGoogle(row))
    return true
  } catch {
    return false
  }
}
