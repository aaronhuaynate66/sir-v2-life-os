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
}

export interface MorningPush {
  title: string
  body: string
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

  // 1. Gente y fechas (lo más humano primero).
  for (const b of (input.birthdays ?? []).slice(0, 2)) {
    if (parts.length >= MAX_PARTS) break
    parts.push(birthdayPhrase(b))
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

  // 3. Foco del día.
  if (input.focus && parts.length < MAX_PARTS) {
    parts.push(`Foco: ${input.focus}`)
  }

  // 4. Una señal, solo si todavía hay espacio.
  if (input.topSignal && parts.length < MAX_PARTS) {
    parts.push(`Atención: ${input.topSignal}`)
  }

  if (parts.length === 0) {
    return {
      title: 'Buenos días',
      body: 'Hoy no hay nada urgente. Espacio para lo que elijas.',
    }
  }

  let body = parts.join(' · ')
  if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY - 1).trimEnd() + '…'
  return { title: 'Tu día en SIR', body }
}
