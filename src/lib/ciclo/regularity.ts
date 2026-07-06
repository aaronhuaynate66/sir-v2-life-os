// SIR V2 — Regularidad del ciclo → confianza de la predicción (17·M4).
//
// Base científica: la regularidad del ciclo varía por persona/estrés/sueño/edad;
// cualquier predicción por calendario es probabilística (ver `docs/17`). Este
// motor mide la regularidad REAL desde los inicios de período observados en
// `person_cycles` (las entradas 'bleeding') y deriva una confianza. Es lo que
// vuelve HONESTA toda predicción del ciclo: con pocos datos o mucha varianza,
// SIR baja la confianza y da una banda amplia en vez de una fecha con falsa
// certeza. PURO y determinístico.

const DAY_MS = 86_400_000
/** Gap (días) entre dos días de sangrado por encima del cual asumimos que
 *  arranca un período NUEVO (no la continuación del mismo). */
const NEW_PERIOD_GAP = 10
const MIN_LEN = 15
// Un ciclo real rara vez pasa de ~40 días; por encima de 45, en data auto-reportada
// (p.ej. menciones sueltas en un chat), casi siempre es un período NO registrado en
// el medio, no un ciclo largo real. Contarlo inflaría la irregularidad falsamente.
const MAX_LEN = 45
const REGULAR_STDEV = 2.5
const SOMEWHAT_STDEV = 5

export type CycleRegularity = 'regular' | 'somewhat_regular' | 'irregular' | 'insufficient'
export type PredictionConfidence = 'high' | 'medium' | 'low' | 'insufficient'

export interface RegularityResult {
  regularity: CycleRegularity
  confidence: PredictionConfidence
  /** Cantidad de ciclos COMPLETOS observados (gaps entre inicios de período). */
  observedCycles: number
  /** Largo medio observado (días) o null si insuficiente. */
  meanLengthDays: number | null
  /** Desvío estándar (días, redondeado) o null. */
  spreadDays: number | null
  /** ± días sugerido para predicciones (banda). Alimenta 17·M5. */
  bandDays: number
  note: string
}

function parseDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return null
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * Inicios de período: primer día de sangrado de cada racha (días de sangrado
 * separados por > NEW_PERIOD_GAP). Devuelve timestamps ordenados y únicos.
 */
export function periodStarts(entries: { date: string; phase: string }[]): number[] {
  const days = [...new Set(
    entries.filter((e) => e.phase === 'bleeding').map((e) => parseDay(e.date)).filter((t): t is number => t !== null),
  )].sort((a, b) => a - b)
  const starts: number[] = []
  let prev = -Infinity
  for (const d of days) {
    if ((d - prev) / DAY_MS > NEW_PERIOD_GAP) starts.push(d)
    prev = d
  }
  return starts
}

/** Mide la regularidad del ciclo desde las entradas de `person_cycles`. */
export function computeCycleRegularity(entries: { date: string; phase: string }[]): RegularityResult {
  const starts = periodStarts(entries)
  // Largos observados = gaps entre inicios consecutivos, dentro de rango plausible.
  const lengths: number[] = []
  for (let i = 1; i < starts.length; i++) {
    const len = Math.round((starts[i] - starts[i - 1]) / DAY_MS)
    if (len >= MIN_LEN && len <= MAX_LEN) lengths.push(len)
  }

  if (lengths.length < 2) {
    const mean = lengths.length === 1 ? lengths[0] : null
    return {
      regularity: 'insufficient',
      confidence: 'insufficient',
      observedCycles: lengths.length,
      meanLengthDays: mean,
      spreadDays: null,
      bandDays: 5,
      note: 'Aún no hay suficientes ciclos registrados para medir la regularidad. Registrá algunos inicios de período y la predicción se afina — hasta entonces, es una estimación amplia.',
    }
  }

  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length
  const stdev = Math.sqrt(variance)

  let regularity: CycleRegularity
  let confidence: PredictionConfidence
  if (stdev <= REGULAR_STDEV) { regularity = 'regular'; confidence = 'high' }
  else if (stdev <= SOMEWHAT_STDEV) { regularity = 'somewhat_regular'; confidence = 'medium' }
  else { regularity = 'irregular'; confidence = 'low' }

  const bandDays = Math.max(1, Math.min(14, Math.ceil(stdev)))

  return {
    regularity,
    confidence,
    observedCycles: lengths.length,
    meanLengthDays: Math.round(mean),
    spreadDays: Math.round(stdev),
    bandDays,
    note: noteFor(regularity, Math.round(mean), bandDays, lengths.length),
  }
}

function noteFor(reg: CycleRegularity, mean: number, band: number, n: number): string {
  const base = `Sobre ${n} ciclo${n === 1 ? '' : 's'} observado${n === 1 ? '' : 's'} (~${mean} días de promedio).`
  switch (reg) {
    case 'regular':
      return `${base} Ciclo regular → la predicción del próximo período es confiable (±${band} día${band === 1 ? '' : 's'}).`
    case 'somewhat_regular':
      return `${base} Algo variable → la predicción es orientativa, con una banda de ±${band} días.`
    case 'irregular':
      return `${base} Ciclo irregular → el próximo período es una estimación amplia (±${band} días); tomala con pinzas.`
    default:
      return base
  }
}
