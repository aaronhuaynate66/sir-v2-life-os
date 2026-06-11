// SIR V2 — Evolución del vínculo (Etapa 2: detección estructurada del cambio).
//
// Sobre los snapshots diarios del score relacional (person_score_snapshots),
// detecta los QUIEBRES reales en el tiempo: subidas/bajadas significativas del
// score, con su fecha y magnitud. Es la base de la "línea de evolución del
// vínculo" en la ficha — "se enfrió a fin de mayo, repuntó esta semana".
//
// PURO + determinístico (sin red, `now` inyectable). No inventa: solo reporta
// movimientos del dato real por encima de un umbral (filtra ruido diario).

import type { ScoreSnapshot, ScoreTrend } from '@/lib/people/scoreTrend'
import { computeScoreTrend } from '@/lib/people/scoreTrend'

export interface BondShift {
  /** 'YYYY-MM-DD' del snapshot donde se consolidó el cambio. */
  date: string
  direction: 'up' | 'down'
  /** Score antes y después del tramo. */
  from: number
  to: number
  /** to - from (con signo). */
  delta: number
  /** Días que tomó el tramo. */
  spanDays: number
  /** Frase lista para UI. */
  label: string
}

export interface BondEvolution {
  /** Tendencia global (reusa computeScoreTrend). */
  trend: ScoreTrend
  /** Quiebres significativos, del más reciente al más antiguo. */
  shifts: BondShift[]
}

/** Un cambio cuenta como "quiebre" si el score se movió ≥ esto respecto del
 *  último punto de pivote. < esto es ruido diario y se ignora. */
export const DEFAULT_SHIFT_THRESHOLD = 6

const DAY_MS = 86_400_000

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`), tb = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 0
  return Math.round(Math.abs(tb - ta) / DAY_MS)
}

function relWhen(date: string, now: Date): string {
  const d = daysBetween(date, now.toISOString().slice(0, 10))
  if (d <= 1) return 'esta semana'
  if (d <= 10) return 'esta semana'
  if (d <= 24) return 'hace ~2 semanas'
  if (d <= 45) return 'el mes pasado'
  return 'hace meses'
}

/**
 * Detecta los quiebres del score. Recorre los snapshots ordenados y, partiendo
 * de un pivote, emite un quiebre cada vez que el score se aleja ≥ threshold del
 * pivote; el punto de quiebre pasa a ser el nuevo pivote. Tolera entradas
 * desordenadas/ inválidas (computeScoreTrend ya filtra). PURO.
 */
export function buildBondEvolution(
  snapshots: ScoreSnapshot[],
  now: Date = new Date(),
  threshold: number = DEFAULT_SHIFT_THRESHOLD,
): BondEvolution {
  const trend = computeScoreTrend(snapshots)
  const valid = (snapshots ?? [])
    .filter((s) => s && typeof s.global === 'number' && Number.isFinite(s.global) && typeof s.dateBucket === 'string' && s.dateBucket.length >= 10)
    .sort((a, b) => a.dateBucket.localeCompare(b.dateBucket))

  const shifts: BondShift[] = []
  if (valid.length >= 2) {
    let pivot = valid[0]
    for (let i = 1; i < valid.length; i++) {
      const cur = valid[i]
      const delta = cur.global - pivot.global
      if (Math.abs(delta) >= threshold) {
        const direction: 'up' | 'down' = delta > 0 ? 'up' : 'down'
        const verb = direction === 'up' ? 'subió' : 'bajó'
        shifts.push({
          date: cur.dateBucket,
          direction,
          from: pivot.global,
          to: cur.global,
          delta,
          spanDays: daysBetween(pivot.dateBucket, cur.dateBucket),
          label: `El vínculo ${verb} de ${pivot.global} a ${cur.global} (${relWhen(cur.dateBucket, now)})`,
        })
        pivot = cur
      }
    }
  }
  shifts.reverse() // más reciente primero
  return { trend, shifts }
}
