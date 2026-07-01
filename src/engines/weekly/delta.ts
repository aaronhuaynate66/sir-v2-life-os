// SIR V2 — Weekly Delta: comparación semana a semana del WeeklyScore.
//
// El P2 del inventario Aaron OS pedía "Weekly score S/A/B/C/D con TENDENCIA
// semanal". Este helper cierra ese pedazo: dado el score de la semana actual
// y el de la anterior, devuelve la lectura corta ("subiste 8 pts vs semana
// pasada" / "bajaste de B a C").
//
// Puro. Fail-safe: si alguna semana está en calibrating, no hay comparación.

import type { WeeklyScore, WeeklyTier } from './index'

const TIER_RANK: Record<WeeklyTier, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 }

export type WeeklyDeltaDirection = 'up' | 'down' | 'flat' | 'no_comparison'

export interface WeeklyDelta {
  direction: WeeklyDeltaDirection
  /** current.score - previous.score. null si no hay comparación. */
  scorePoints: number | null
  /** Cambio de tier (rank up/down/mismo). null si no hay comparación. */
  tierChange: 'up' | 'down' | 'same' | null
  currentTier: WeeklyTier | null
  previousTier: WeeklyTier | null
  /** Copy corto ("Subiste 8 pts", "De B a C", "Sostuviste el tier"). */
  label: string
}

export function computeWeeklyDelta(current: WeeklyScore, previous: WeeklyScore): WeeklyDelta {
  if (current.status !== 'scored' || previous.status !== 'scored') {
    return {
      direction: 'no_comparison',
      scorePoints: null,
      tierChange: null,
      currentTier: current.status === 'scored' ? current.tier : null,
      previousTier: previous.status === 'scored' ? previous.tier : null,
      label: 'Sin comparación (faltan datos de una semana).',
    }
  }

  const scorePoints = Math.round(current.score - previous.score)
  const curRank = TIER_RANK[current.tier]
  const prevRank = TIER_RANK[previous.tier]
  const tierChange: 'up' | 'down' | 'same' = curRank > prevRank ? 'up' : curRank < prevRank ? 'down' : 'same'

  // Umbral chico (±2 pts) es "flat" — evita el ruido semana a semana.
  const direction: WeeklyDeltaDirection =
    scorePoints > 2 ? 'up' : scorePoints < -2 ? 'down' : 'flat'

  let label: string
  if (tierChange === 'up') {
    label = `Subiste de ${previous.tier} a ${current.tier}.`
  } else if (tierChange === 'down') {
    label = `Bajaste de ${previous.tier} a ${current.tier}.`
  } else if (direction === 'up') {
    label = `Subiste ${scorePoints} pts dentro del tier.`
  } else if (direction === 'down') {
    label = `Bajaste ${Math.abs(scorePoints)} pts dentro del tier.`
  } else {
    label = `Sostuviste el tier ${current.tier}.`
  }

  return {
    direction,
    scorePoints,
    tierChange,
    currentTier: current.tier,
    previousTier: previous.tier,
    label,
  }
}
