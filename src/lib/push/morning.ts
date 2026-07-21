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
  /** Títulos de tareas que vencen hoy (no hechas). */
  dueTasks?: string[]
  /** El foco del día (ancla del año o próximo paso de un objetivo clave). */
  focus?: string
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
  /** Cuerpo para la NOTIFICACIÓN del navegador: capado a MAX_BODY (un push
   *  calmo, no un volcado; el OS lo trunca visualmente de todas formas). */
  body: string
  /** Cuerpo COMPLETO, sin capar. Para canales que no necesitan el corte (brief
   *  de Telegram, límite 4096) → ahí se lee todo sin "…" a mitad de línea. */
  bodyFull: string
}

const MAX_PARTS = 3
const MAX_BODY = 220

function birthdayPhrase(b: MorningBirthday): string {
  const when = b.days === 0 ? 'cumple hoy' : b.days === 1 ? 'cumple mañana' : `cumple en ${b.days} días`
  return `${b.name} ${when}`
}

/** Arma el push de la mañana. Siempre devuelve algo (mensaje amable si no hay
 *  nada urgente) — el usuario eligió recibirlo a diario. */
export function buildMorningPush(input: MorningInput): MorningPush {
  const parts: string[] = []

  // 0. SEMANA EN FOCO (mudanza / hitos ≤7d): al frente, es lo que importa esta
  //    semana. Prioridad sobre cumpleaños porque el countdown se vive en tiempo real.
  if (input.weekFocus) {
    parts.push(input.weekFocus)
  }

  // 0.5. ALERTA DE METRICA DURA (peso Mundial, etc.): si esta fuera de rango
  //    hoy, importa para el dia. Antes que cumpleanos porque es accionable.
  if (input.metricAlert && parts.length < MAX_PARTS) {
    parts.push(input.metricAlert)
  }

  // 1. Gente y fechas (lo más humano primero). Los aniversarios/fechas
  //    especiales van ANTES que los cumpleaños: un aniversario HOY pesa más que
  //    un cumple en 5 días (ya vienen filtrados a la ventana + ordenados).
  for (const d of (input.importantDates ?? []).slice(0, 2)) {
    if (parts.length >= MAX_PARTS) break
    parts.push(d)
  }
  for (const b of (input.birthdays ?? []).slice(0, 2)) {
    if (parts.length >= MAX_PARTS) break
    parts.push(birthdayPhrase(b))
  }

  // 1.5 A quién cuidar hoy (vínculo más urgente de "Reconectar"). Va después de
  //     las fechas (un cumple HOY es puntual) pero antes de tareas/foco: cuidar
  //     un vínculo que se enfría es el corazón relacional de SIR, no un pendiente.
  if (input.relationshipNudge && parts.length < MAX_PARTS) {
    parts.push(input.relationshipNudge)
  }

  // 1.6 Cerrar un lazo: un tema abierto que el chat ya resolvió. Va junto a lo
  //     relacional (es cuidar el vínculo cerrando algo que quedó colgado), antes
  //     que tareas/foco. Es el "SIR no cruza bien la info" hecho proactivo.
  if (input.momentResolution && parts.length < MAX_PARTS) {
    parts.push(input.momentResolution)
  }

  // 2. Tareas que vencen hoy.
  const due = input.dueTasks ?? []
  if (due.length > 0 && parts.length < MAX_PARTS) {
    if (due.length === 1) parts.push(`Hoy vence: ${due[0]}`)
    else parts.push(`${due.length} tareas para hoy (${due[0]}…)`)
  }

  // 2.5 Hábito a retomar (solo cosas notables, ej. racha rota — el cron ya
  //     filtra; a las 6am "te faltan hábitos" sería ruido obvio).
  if (input.habitNudge && parts.length < MAX_PARTS) {
    parts.push(input.habitNudge)
  }

  // 2.6 Señal del cuerpo (deuda de sueño) — cuidado, no reproche.
  if (input.bodySignal && parts.length < MAX_PARTS) {
    parts.push(input.bodySignal)
  }

  // 2.7 Vigilancia de laboratorio: un patrón de chequeos que YA se salió de rango
  //     (el cron lo manda solo semanal). No es agudo, por eso va bajo — después
  //     del cuerpo y antes del foco. Es "que no se quede al baúl", no una alarma.
  if (input.healthWatch && parts.length < MAX_PARTS) {
    parts.push(input.healthWatch)
  }

  // 3. Foco del día.
  if (input.focus && parts.length < MAX_PARTS) {
    parts.push(`Foco: ${input.focus}`)
  }

  // 4. Una señal, solo si todavía hay espacio.
  if (input.topSignal && parts.length < MAX_PARTS) {
    parts.push(`Atención: ${input.topSignal}`)
  }

  if (parts.length === 0) {
    const calm = 'Hoy no hay nada urgente. Espacio para lo que elijas.'
    return { title: 'Buenos días', body: calm, bodyFull: calm }
  }

  const bodyFull = parts.join(' · ')
  const body = bodyFull.length > MAX_BODY ? bodyFull.slice(0, MAX_BODY - 1).trimEnd() + '…' : bodyFull
  return { title: 'Tu día en SIR', body, bodyFull }
}
