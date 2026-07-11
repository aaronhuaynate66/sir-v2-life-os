// SIR V2 — Saludo contextual + resumen del día para /panel (Mission Control).
//
// Idea tomada de Rimu (análisis 2026-07-11): en vez de un header técnico frío
// ("Mission Control"), un saludo cálido por franja horaria + un resumen
// cuantificado en lenguaje natural. Adaptado a la filosofía de SIR: RELACIONAL
// y de bienestar, no de productividad; sin gamificación ni presión. PURO.

export interface TimeGreeting {
  greeting: string
  phrase: string
}

/**
 * Saludo por franja horaria (hora local 0-23) + una frase sobria de bienestar
 * (fija por franja: nada de coach cursi ni rachas). Determinístico.
 */
export function timeGreeting(hour: number): TimeGreeting {
  const h = Number.isFinite(hour) ? ((Math.floor(hour) % 24) + 24) % 24 : 12
  if (h >= 5 && h < 12) return { greeting: 'Buenos días', phrase: 'Un día nuevo para estar presente.' }
  if (h >= 12 && h < 19) return { greeting: 'Buenas tardes', phrase: 'El ritmo del día, a tu tiempo.' }
  if (h >= 19 && h < 24) return { greeting: 'Buenas noches', phrase: 'Cerrá el día con calma.' }
  return { greeting: 'Buenas madrugadas', phrase: 'La noche también es tuya — cuidá el descanso.' }
}

export interface DayCounts {
  /** Vínculos que piden atención (alertas relacionales). */
  care: number
  /** Cumpleaños próximos. */
  birthdays: number
  /** Señales activas. */
  signals: number
  /** Objetivos críticos en curso. */
  criticalGoals: number
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Resumen del día en lenguaje natural, priorizando lo RELACIONAL. Solo nombra lo
 * que existe (>0). Si no hay nada, un mensaje calmo (bienestar, no vacío ansioso).
 */
export function daySummary(c: DayCounts): string {
  const parts: string[] = []
  if (c.care > 0) parts.push(plural(c.care, 'vínculo que cuidar', 'vínculos que cuidar'))
  if (c.birthdays > 0) parts.push(plural(c.birthdays, 'cumpleaños', 'cumpleaños'))
  if (c.signals > 0) parts.push(plural(c.signals, 'señal activa', 'señales activas'))
  if (c.criticalGoals > 0) parts.push(plural(c.criticalGoals, 'objetivo crítico', 'objetivos críticos'))

  if (parts.length === 0) return 'Todo tranquilo — nada urgente hoy. 🌿'
  if (parts.length === 1) return `Hoy: ${parts[0]}.`
  const last = parts.pop() as string
  return `Hoy: ${parts.join(', ')} y ${last}.`
}
