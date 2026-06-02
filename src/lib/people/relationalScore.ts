// SIR V2 — Score relacional (lógica pura, extraída de RelationalScore.tsx).
//
// V1 mostraba un número grande (49) + barras (Fuerza / Reciprocidad /
// Confianza) + última conversación. Esta función centraliza ese cómputo para
// que lo consuman BOTH la card "Salud del vínculo" (RelationalScore) y la
// franja de resumen del tope de la ficha (ResumenPersona) — una sola fuente de
// verdad, sin duplicar el mapeo.
//
// MAPEO DE DIMENSIONES (idéntico al histórico de RelationalScore):
//   - Fuerza (0-100): importance_score (1-10, x10) ajustado por recencia del
//     último whatsapp_chat: <14d +10, 14-60d sin ajuste, >60d/null -10.
//   - Reciprocidad (0-100 | null): GEMA C portada de V1. V1 mantenía un score
//     mutable por relación y, en cada interacción registrada, lo movía con un
//     DELTA por CALIDAD ({1:-5, 2:-2, 3:0, 4:+3, 5:+6}). V2 no muta un campo:
//     guarda cada interacción en person_logs (kind='interaction', value 1-5).
//     Acá REPRODUCIMOS el acumulado de V1 reproyectando esos deltas sobre un
//     baseline (50), clamp [0,100]. Sin interacciones registradas → null
//     (datos insuficientes, honesto). Con ≥1 → un número real: así la
//     Reciprocidad deja de salir NULL en V2.
//   - Confianza (0-100): trust_level (1-10, x10), sin ajuste.
//   - Global: promedio de las dimensiones NO-null (round).
//
// PURA + determinística: `now` se inyecta (igual que el resto de utils de
// fecha del proyecto), así los tests son TZ-independientes.

const DAY_MS = 86_400_000

/** Delta de Reciprocidad por CALIDAD de la interacción (1-5). Portado tal cual
 *  de SIR V1 (`apps/web/src/app/(app)/actions.ts:100`): una conversación tensa
 *  resta, una plena suma más de lo que resta una mala. Asimétrico a propósito:
 *  reconstruir confianza cuesta más que romperla, pero un buen encuentro pesa. */
export const QUALITY_DELTA: Record<number, number> = { 1: -5, 2: -2, 3: 0, 4: 3, 5: 6 }

/** Valor de arranque de la Reciprocidad (V1 creaba la relación en 50). */
export const RECIPROCITY_BASELINE = 50

/**
 * Reciprocidad (0-100) a partir del historial de calidades de interacción.
 * `qualities` en orden CRONOLÓGICO (más vieja → más nueva): replicamos la
 * mutación incremental de V1 (cada interacción ajustaba el score guardado),
 * por eso el clamp se aplica paso a paso. V1 movía Reciprocidad con
 * `round(delta * 0.6)` (la fuerza tomaba el delta entero; la reciprocidad,
 * atenuada). Sin interacciones → null (no inventamos un número).
 */
export function computeReciprocity(qualities: number[]): number | null {
  if (!qualities || qualities.length === 0) return null
  let r = RECIPROCITY_BASELINE
  for (const q of qualities) {
    const delta = QUALITY_DELTA[q] ?? 0
    r = clamp(r + Math.round(delta * 0.6), 0, 100)
  }
  return r
}

export interface RelationalScoreInput {
  /** people.importance_score (1-10). Cae a 5 si no es un número válido. */
  importanceScore: number
  /** people.trust_level (1-10). Cae a 5 si no es un número válido. */
  trustLevel: number
  /** observed_at ISO del último whatsapp_chat curado. null si no hay chat. */
  lastChatObservedAt: string | null
  /** Calidades (1-5) de person_logs kind='interaction', en orden CRONOLÓGICO
   *  (más vieja → más nueva). Opcional: si se omite o va vacío, Reciprocidad
   *  queda null (datos insuficientes), preservando el comportamiento previo. */
  interactionQualities?: number[]
}

export interface RelationalScoreBreakdown {
  fuerza: number
  reciprocidad: number | null
  confianza: number
  global: number
  /** Días desde el último whatsapp_chat. null si no hay chat (o fecha futura). */
  daysSinceLastChat: number | null
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function computeRelationalScore(
  input: RelationalScoreInput,
  now: Date = new Date(),
): RelationalScoreBreakdown {
  const importance = clamp(Number(input.importanceScore) || 5, 1, 10)
  const trust = clamp(Number(input.trustLevel) || 5, 1, 10)

  let daysSinceLastChat: number | null = null
  if (input.lastChatObservedAt) {
    const t = new Date(input.lastChatObservedAt).getTime()
    if (!Number.isNaN(t) && t <= now.getTime()) {
      daysSinceLastChat = Math.floor((now.getTime() - t) / DAY_MS)
    }
  }

  // Fuerza con ajuste de recencia.
  let fuerza = importance * 10
  if (daysSinceLastChat === null) {
    fuerza -= 10
  } else if (daysSinceLastChat < 14) {
    fuerza += 10
  } else if (daysSinceLastChat > 60) {
    fuerza -= 10
  }
  fuerza = clamp(fuerza, 0, 100)

  // Reciprocidad: GEMA C — reproyecta los deltas por calidad del historial de
  // interacciones (person_logs). null sólo si no hay ninguna registrada.
  const reciprocidad: number | null = computeReciprocity(input.interactionQualities ?? [])

  const confianza = trust * 10

  const known = [fuerza, confianza, ...(reciprocidad !== null ? [reciprocidad] : [])]
  const global = Math.round(known.reduce((a, b) => a + b, 0) / known.length)

  return { fuerza, reciprocidad, confianza, global, daysSinceLastChat }
}

export interface HealthBand {
  /** Banda: 'solid' | 'care' | 'risk'. */
  id: 'solid' | 'care' | 'risk'
  /** Color del arco/acento (hex). */
  color: string
  /** Variante suave (hex) para texto. */
  soft: string
  label: string
}

/** Banda de salud → color semántico. El vínculo es estado, así que el color
 *  significa (no es decorativo): sólido / a cuidar / en riesgo. */
export function healthBand(score: number): HealthBand {
  if (score >= 70) return { id: 'solid', color: '#2dd4a7', soft: '#7fe9cf', label: 'Sólido' }
  if (score >= 40) return { id: 'care', color: '#e0a93b', soft: '#f0cd8a', label: 'A cuidar' }
  return { id: 'risk', color: '#e5564c', soft: '#f0a09a', label: 'En riesgo' }
}
