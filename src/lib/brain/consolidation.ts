// SIR V2 — Cerebro · Consolidacion nocturna (handoff §7 "sueño").
//
// Cada noche multiplicamos los deltas aprendidos (edge_weights.weight) por un
// factor < 1 para modelar OLVIDO SALUDABLE: si el mundo cambia y una arista
// que aprendio a pesar mucho ya no se refuerza, su peso decae lentamente en
// vez de quedar sesgando la difusion para siempre.
//
// Puro y determinista. El cron lo ejecuta de madrugada (03am Lima ≈ 08 UTC).
//
// Decay 0.98/día:
//   - Un delta que subio a 3 y no se reciben ↑ mas → cae a 1.5 en ~35 dias.
//   - Un usuario que confirma diariamente mantiene el efecto (multiplico y
//     despues sumo la mag).
//
// Threshold 0.05:
//   - Si el delta cae en valor absoluto por debajo de 0.05, borramos la fila
//     — evita acumulacion infinita de filas con peso ruido. Un delta de
//     magnitud 1 tarda ~150 dias en llegar ahi si no se refuerza.

export const NIGHT_DECAY_FACTOR = 0.98
export const CLEANUP_THRESHOLD = 0.05

export interface DecayResult {
  /** Nuevo peso post-decay. Puede ser null si debe borrarse. */
  weight: number | null
  /** True si esta fila debe eliminarse. */
  shouldDelete: boolean
}

/** Aplica el decay a un peso individual. Puro. */
export function applyNightDecay(
  currentWeight: number,
  opts?: { factor?: number; threshold?: number },
): DecayResult {
  const factor = opts?.factor ?? NIGHT_DECAY_FACTOR
  const threshold = opts?.threshold ?? CLEANUP_THRESHOLD
  if (!Number.isFinite(currentWeight)) {
    return { weight: null, shouldDelete: true }
  }
  const next = currentWeight * factor
  if (Math.abs(next) < threshold) {
    return { weight: null, shouldDelete: true }
  }
  // Redondeo a 4 decimales — evita drift acumulado con muchos ciclos.
  const rounded = Math.round(next * 10000) / 10000
  return { weight: rounded, shouldDelete: false }
}
