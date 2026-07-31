// SIR V2 — Poner al día `person_daily_signals` (incluido el IAE) desde el sustrato.
//
// ═══ EL HUECO, Y ES CARO ══════════════════════════════════════════════════════
//
// Aaron, 31-jul-2026: *"por qué no tengo ninguna alerta de cómo viene mi relación
// con Diana si mis últimas conversaciones tan hasta las webas"*.
//
// El Índice de Afecto Expresado (IAE) **ya estaba construido** (#924), surfaceado
// (#932) y metido en el chat de SIR (#963). No faltaba el motor. Lo que estaba
// roto era la FRESCURA:
//
//   · `person_daily_signals` de Diana: **820 filas, 624 con afecto, y la más nueva
//     del 8-jul-2026**. Medido el 31-jul → **23 días congelada.**
//   · Los únicos que escriben esa tabla son `/api/capture/whatsapp-export` (un
//     import a mano) y `/api/forecast`. **No hay cron.**
//   · Y `/api/forecast` tiene el candado: `if (sigRows.length >= 10)` usa las filas
//     guardadas TAL CUAL. Con 820 filas nunca vuelve a mirar el sustrato. El
//     backfill de afecto solo salta si TODAS vienen en null, y ella tiene 624 con
//     valor → tampoco corre.
//
// O sea: **un caché sin invalidación.** Pasado el décimo día, la serie de una
// persona se congela para siempre y los mensajes que trae el reader todos los días
// no producen una sola señal. Todo el mes del deterioro —el pico de 252 mensajes
// del 24-jul, el incidente del 27, la pelea del 30— quedó SIN MEDIR.
//
// Es el mismo hilo de [[auditoria-oportunidades-2026-07-21]]: SIR computa más de lo
// que surfacea. Acá ni siquiera computaba: tenía la data y no la miraba.
//
// ═══ QUÉ HACE ════════════════════════════════════════════════════════════════
//
// Recalcula SOLO los días que hacen falta, no los 820. El criterio es el sustrato:
// si hay mensajes de un día que no tiene fila (o que la tiene desactualizada dentro
// de la ventana de recálculo), ese día se recalcula. Un día ya cerrado y viejo no
// se vuelve a tocar — es trabajo idéntico y repetido.
//
// PURO: cero red, cero DB. El "hoy" y los mensajes se inyectan.

import { buildDailySignals } from './dailySignals'
import type { ChatMessage, DailySignal } from './types'

/**
 * Días recientes que SIEMPRE se recalculan, incluso si ya tienen fila.
 *
 * Por qué no solo "los días sin fila": el día de HOY (y el de ayer, por el corte de
 * medianoche y por los mensajes que el reader trae con retraso) se completa a lo
 * largo de la jornada. Si se lo diera por cerrado con la primera pasada, el día de
 * la pelea quedaría medido con los tres mensajes de la mañana.
 */
export const VENTANA_RECALCULO_DIAS = 3

/** Fila lista para upsert en `person_daily_signals`. */
export interface SignalRow {
  id: string
  user_id: string
  person_id: string
  date: string
  message_count: number
  avg_len: number
  somatic: number
  friction: number
  withdrawal: number
  sensitivity: number
  actions: number
  composite: number
  affection: number
  positivity_ratio: number
  updated_at: string
}

export interface TopUpInput {
  userId: string
  personId: string
  /** Mensajes del sustrato (chat_messages ya mapeados). */
  messages: ChatMessage[]
  /** Fechas 'YYYY-MM-DD' que YA tienen fila guardada. */
  storedDates: Iterable<string>
  /** 'YYYY-MM-DD' de hoy en Lima. */
  hoy: string
  /** ISO para `updated_at` (se inyecta para que sea determinístico en tests). */
  nowIso: string
}

export interface TopUpResult {
  /** Filas a escribir. Vacío si no hay nada que poner al día. */
  rows: SignalRow[]
  /** Serie completa recalculada del sustrato (para reusar sin recomputar). */
  serie: DailySignal[]
  /** Día más nuevo con mensajes en el sustrato. null si no hay mensajes. */
  ultimoDiaConMensajes: string | null
  /** Día más nuevo que ya estaba guardado. null si no había ninguno. */
  ultimoDiaGuardado: string | null
}

const DAY_MS = 86_400_000

/** Días calendario entre dos 'YYYY-MM-DD'. null si alguna no parsea. */
function diasEntre(desde: string, hasta: string): number | null {
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / DAY_MS)
}

/**
 * Decide qué días recalcular y devuelve las filas. PURA.
 *
 * Un día entra si: (a) tiene mensajes en el sustrato y NO tiene fila guardada, o
 * (b) tiene mensajes y cae dentro de `VENTANA_RECALCULO_DIAS` (todavía se está
 * completando). Los días viejos que ya tienen fila se dejan quietos.
 */
export function planTopUpSignals(input: TopUpInput): TopUpResult {
  const { userId, personId, messages, hoy, nowIso } = input
  const stored = new Set(input.storedDates)

  const serie = buildDailySignals(messages ?? [])
  // Máximo explícito y no `serie[serie.length - 1]`: `buildDailySignals` agrupa en
  // un Map, así que el orden de salida sigue el de los MENSAJES, y nadie garantiza
  // que el sustrato venga ordenado ascendente. Con un solo mensaje viejo al final
  // del arreglo, el "último día" saldría mal y el atajo de `necesitaTopUp` decidiría
  // al revés.
  let ultimoDiaConMensajes: string | null = null
  for (const s of serie) if (ultimoDiaConMensajes === null || s.date > ultimoDiaConMensajes) ultimoDiaConMensajes = s.date
  let ultimoDiaGuardado: string | null = null
  for (const d of stored) if (ultimoDiaGuardado === null || d > ultimoDiaGuardado) ultimoDiaGuardado = d

  const rows: SignalRow[] = []
  for (const s of serie) {
    const edad = diasEntre(s.date, hoy)
    // Un día del FUTURO (edad < 0) no se escribe: sería data imposible, y ya hubo
    // desfases de hora de 5 h en este sustrato (ver `chat-messages/append`).
    if (edad === null || edad < 0) continue
    const reciente = edad < VENTANA_RECALCULO_DIAS
    if (!reciente && stored.has(s.date)) continue
    rows.push({
      id: `sig:${personId}:${s.date}`,
      user_id: userId, person_id: personId, date: s.date,
      message_count: s.messageCount, avg_len: s.avgLen,
      somatic: s.somatic, friction: s.friction, withdrawal: s.withdrawal,
      sensitivity: s.sensitivity, actions: s.actions, composite: s.composite,
      affection: s.affection, positivity_ratio: s.positivityRatio,
      updated_at: nowIso,
    })
  }

  return { rows, serie, ultimoDiaConMensajes, ultimoDiaGuardado }
}

/**
 * ¿Vale la pena ir al sustrato? PURA y baratísima.
 *
 * Se llama ANTES de bajar decenas de miles de mensajes: si lo guardado ya llega al
 * último día con actividad, no hay nada que poner al día. Sin este atajo, abrir el
 * panel se traería 50k mensajes cada vez.
 */
export function necesitaTopUp(ultimoDiaGuardado: string | null, ultimoDiaConActividad: string | null): boolean {
  if (!ultimoDiaConActividad) return false
  if (!ultimoDiaGuardado) return true
  // Se compara como texto: 'YYYY-MM-DD' ordena igual lexicográfica que cronológicamente.
  return ultimoDiaGuardado < ultimoDiaConActividad
}
