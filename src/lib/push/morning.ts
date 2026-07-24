// SIR V2 — Composición del push diario de la mañana (PURO).
//
// Filtro rector: UN solo push CALMO, no un volcado. La notificación es un
// empujón breve; el detalle vive en /panel (el briefing diario con IA). Por eso
// acá elegimos a lo sumo unas pocas señales y las decimos corto. Si no hay nada
// urgente, un mensaje amable que NO presiona.

export interface MorningBirthday {
  name: string
  /** Días hasta el cumple (0 = hoy). */
  days: number
}

export interface MorningInput {
  /** Cumpleaños próximos (≤ unos días), ya filtrados y ordenados por cercanía. */
  birthdays?: MorningBirthday[]
  /** Fechas especiales próximas (aniversarios, mensario…) ya formateadas y
   *  ordenadas por cercanía. Ej. "Aniversario mensual relación (13) · ¡Hoy!". */
  importantDates?: string[]
  /** A quién cuidar hoy: el vínculo más urgente de "Reconectar" (persona +
   *  razón, ya formado). SIR sabe a quién estás descuidando; esto lo dice sin
   *  que abras la app. Texto corto ya armado. */
  relationshipNudge?: string
  /** Cruce chat → tema abierto: un "momento/decisión" abierto que el chat
   *  reciente ya parece haber resuelto (el cron `moment-scan` lo precomputa).
   *  SIR sugiere cerrarlo; no cierra solo. Texto ya formado. */
  momentResolution?: string
  /** Buen momento para AVANZAR un objetivo con una persona: alguien ligado a un
   *  objetivo activo (con acción pendiente) muestra buen timing hoy (historia
   *  activa). El loop original del reader (Dayana/Marlab). Texto ya formado
   *  (ver lib/goals/timingNudge). */
  goalContactTiming?: string
  /** Títulos de tareas que vencen hoy (no hechas). */
  dueTasks?: string[]
  /** El foco del día (ancla del año o próximo paso de un objetivo clave). */
  focus?: string
  /** Nudge de OBJETIVO que necesita atención (norte estancado / meta en riesgo).
   *  Accionable; tiene prioridad sobre el `focus` genérico (que solo nombra el
   *  ancla). Texto ya formado (ver lib/push/goalNudge). */
  goalNudge?: string
  /** Una señal que merece atención hoy (texto corto). */
  topSignal?: string
  /** Nudge de hábito (ej. racha rota que vale recuperar). Texto ya formado. */
  habitNudge?: string
  /** Señal del cuerpo (ej. deuda de sueño). Texto ya formado. */
  bodySignal?: string
  /** Objetivo con targetDate cercano (≤7d). Texto ya formado ("Mudanza EN 3 DIAS"). */
  weekFocus?: string
  /** Alerta de metrica dura (peso Mundial fuera de categoria, etc.). Texto ya formado. */
  metricAlert?: string
  /** Vigilancia de laboratorio: patrón de chequeos consistente que ya salió de
   *  rango (idea de Aaron: no dejarlo "al baúl"). NO es agudo → prioridad baja y
   *  el cron lo manda throttled (semanal). Texto ya formado. */
  healthWatch?: string
}

export interface MorningPush {
  title: string
  /** Cuerpo para la NOTIFICACIÓN del navegador: las TOP MAX_PARTS_WEB señales,
   *  capado a MAX_BODY chars (un push calmo, no un volcado; el OS lo trunca
   *  visualmente de todas formas). */
  body: string
  /** Cuerpo para el CHAT (Telegram, límite 4096): hasta MAX_PARTS_FULL señales,
   *  sin cortar a mitad de línea. El coach computa ~14 señales; el push del
   *  navegador se queda calmo en pocas, pero en el chat se aprovechan más de las
   *  que igual ya se calcularon (decisión de Aaron 2026-07-23). */
  bodyFull: string
}

/** Notificación del navegador: pocas, calmas. */
const MAX_PARTS_WEB = 3
/** Chat (Telegram): más señales, sin volcar TODO (el detalle vive en /panel). */
const MAX_PARTS_FULL = 8
const MAX_BODY = 220

function birthdayPhrase(b: MorningBirthday): string {
  const when = b.days === 0 ? 'cumple hoy' : b.days === 1 ? 'cumple mañana' : `cumple en ${b.days} días`
  return `${b.name} ${when}`
}

/** Arma el push de la mañana. Siempre devuelve algo (mensaje amable si no hay
 *  nada urgente) — el usuario eligió recibirlo a diario.
 *
 *  El ORDEN de acumulación = prioridad. `body` toma las top MAX_PARTS_WEB;
 *  `bodyFull` (chat) toma hasta MAX_PARTS_FULL. */
export function buildMorningPush(input: MorningInput): MorningPush {
  const parts: string[] = []
  const add = (s: string | undefined | null) => {
    if (s && parts.length < MAX_PARTS_FULL) parts.push(s)
  }

  // 0. SEMANA EN FOCO (mudanza / hitos ≤7d) y 0.5 MÉTRICA DURA fuera de rango:
  //    lo urgente/time-sensitive del día, al frente.
  add(input.weekFocus)
  add(input.metricAlert)

  // 1. Aniversarios/fechas especiales: un aniversario HOY es time-critical (no se
  //    puede celebrar tarde) → se mantiene sobre lo relacional-no-urgente.
  for (const d of (input.importantDates ?? []).slice(0, 2)) add(d)

  // 1.5 EL CORAZÓN RELACIONAL, subido de prioridad (decisión de Aaron 2026-07-23):
  //     "a quién cuidar hoy" + "cerrar un lazo" + "buen momento × objetivo" ahora
  //     van ANTES que los cumpleaños (un cumple en N días no debe tapar el cuidado
  //     de un vínculo que se enfría hoy) → casi siempre entran al push.
  add(input.relationshipNudge)
  add(input.momentResolution)
  add(input.goalContactTiming)

  // 1.8 Cumpleaños próximos (después de lo relacional urgente).
  for (const b of (input.birthdays ?? []).slice(0, 2)) add(birthdayPhrase(b))

  // 2. Tareas que vencen hoy.
  const due = input.dueTasks ?? []
  if (due.length === 1) add(`Hoy vence: ${due[0]}`)
  else if (due.length > 1) add(`${due.length} tareas para hoy (${due[0]}…)`)

  // 2.5 Hábito a retomar · 2.6 señal del cuerpo · 2.7 vigilancia de laboratorio.
  add(input.habitNudge)
  add(input.bodySignal)
  add(input.healthWatch)

  // 2.8 OBJETIVO que necesita atención (accionable, antes del foco genérico).
  add(input.goalNudge)

  // 3. Foco del día. Se omite si ya hubo un nudge de objetivo (evita 2 líneas de
  //    meta en el mismo push).
  if (input.focus && !input.goalNudge) add(`Foco: ${input.focus}`)

  // 4. Una señal más.
  if (input.topSignal) add(`Atención: ${input.topSignal}`)

  if (parts.length === 0) {
    const calm = 'Hoy no hay nada urgente. Espacio para lo que elijas.'
    return { title: 'Buenos días', body: calm, bodyFull: calm }
  }

  const bodyFull = parts.join(' · ')
  const bodyShort = parts.slice(0, MAX_PARTS_WEB).join(' · ')
  const body = bodyShort.length > MAX_BODY ? bodyShort.slice(0, MAX_BODY - 1).trimEnd() + '…' : bodyShort
  return { title: 'Tu día en SIR', body, bodyFull }
}
