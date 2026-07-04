// SIR V2 — Aprender qué regulación te funciona (13·M4). PURO.
//
// Sobre los registros de estrategia aplicada + si ayudó, calcula (POR VOS, no en
// general) qué estrategia tiene mejor tasa de ayuda. Empieza `insufficient` y solo
// afirma cuando el n PERSONAL por estrategia lo sostiene. Riesgo a vigilar
// (explícito en la salida): es un patrón OBSERVADO, no una ley — correlación ≠ causa.

export type RegStrategyKey = 'response_modulation' | 'reappraisal' | 'other'
export type Helped = 'yes' | 'somewhat' | 'no'

export interface RegulationLog {
  id: string
  strategy: RegStrategyKey | string
  helped?: Helped | null
  appliedAt: string
}

const STRATEGY_LABEL: Record<string, string> = {
  response_modulation: 'bajar la activación',
  reappraisal: 'reencuadrar',
  other: 'otra',
}

/** Registros calificados mínimos por estrategia para compararla. */
const MIN_RATED = 3

export interface StrategyStat {
  strategy: string
  label: string
  rated: number
  /** 0-1: yes=1, somewhat=0.5, no=0, promediado sobre los calificados. */
  helpRate: number
}

export interface RegulationSummary {
  stats: StrategyStat[]
  /** La estrategia con mejor tasa (si hay ≥2 comparables), o null. */
  best: StrategyStat | null
  /** Mensaje honesto, o null si aún no hay para afirmar. */
  insight: string | null
}

function helpValue(h: Helped | null | undefined): number | null {
  if (h === 'yes') return 1
  if (h === 'somewhat') return 0.5
  if (h === 'no') return 0
  return null
}

/**
 * Resume qué estrategia te suele ayudar más. Solo compara las que tienen ≥3
 * registros calificados; si no alcanza, `insight` es null. PURO.
 */
export function summarizeRegulation(logs: RegulationLog[]): RegulationSummary {
  const byStrat = new Map<string, number[]>()
  for (const l of logs) {
    const v = helpValue(l.helped ?? null)
    if (v === null) continue
    const arr = byStrat.get(l.strategy) ?? []
    arr.push(v)
    byStrat.set(l.strategy, arr)
  }

  const stats: StrategyStat[] = [...byStrat.entries()]
    .map(([strategy, vals]) => ({
      strategy,
      label: STRATEGY_LABEL[strategy] ?? strategy,
      rated: vals.length,
      helpRate: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
    }))
    .sort((a, b) => b.helpRate - a.helpRate)

  const comparable = stats.filter((s) => s.rated >= MIN_RATED)
  let best: StrategyStat | null = null
  let insight: string | null = null

  if (comparable.length >= 1) {
    best = comparable[0]
    if (comparable.length >= 2 && comparable[0].helpRate - comparable[1].helpRate >= 0.2) {
      insight = `Para vos, ${comparable[0].label} suele ayudar más que ${comparable[1].label} (patrón observado en ${comparable[0].rated} veces — no es una ley).`
    } else if (best.helpRate >= 0.6) {
      insight = `Para vos, ${best.label} viene funcionando (${Math.round(best.helpRate * 100)}% de las veces que la probaste — patrón observado, no ley).`
    }
  }

  return { stats, best, insight }
}
