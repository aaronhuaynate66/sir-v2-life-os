// SIR V2 — Señal biológica para el día (Etapa 3 · cerrar loop salud→día).
//
// La data de Apple Health (sleep_records) ya entra a SIR, pero su lectura vivía
// solo en /salud. Esto la convierte en UNA señal calma para el push/briefing de
// la mañana: deuda de sueño acumulada → invitación a bajar el ritmo. PURA.
//
// Filosofía bienestar > culpa: no reprocha; sugiere cuidado. NO es consejo
// clínico (deuda de sueño = aritmética simple sobre 7.5h objetivo, igual que el
// motor biológico de /salud). Sin emoji.

const TARGET_HOURS = 7.5
const MIN_NIGHTS = 2
/** Umbral de deuda (h acumuladas) para que valga nombrarla. ~3h ≈ varias
 *  noches por debajo del objetivo. Por debajo no molestamos. */
const DEBT_THRESHOLD = 3

export interface BodySignalInput {
  /** Duraciones de sueño (horas) de las últimas noches. El orden no importa. */
  recentSleepHours: number[]
}

/** Devuelve UNA línea calma sobre el cuerpo, o null si no hay nada que decir. */
export function bodySignal(input: BodySignalInput): string | null {
  const hours = (input.recentSleepHours ?? []).filter((h) => typeof h === 'number' && h > 0 && h <= 24)
  if (hours.length < MIN_NIGHTS) return null
  const avg = hours.reduce((a, b) => a + b, 0) / hours.length
  const debt = Math.max(0, (TARGET_HOURS - avg) * hours.length)
  if (debt < DEBT_THRESHOLD) return null
  const debtRounded = Math.round(debt)
  return `Venís arrastrando deuda de sueño (~${debtRounded}h en ${hours.length} noches). Si el día lo permite, bajá una marcha.`
}
