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
//   - Reciprocidad: null (V2 aún no tiene log de interacciones recíprocas).
//   - Confianza (0-100): trust_level (1-10, x10), sin ajuste.
//   - Global: promedio de las dimensiones NO-null (round).
//
// PURA + determinística: `now` se inyecta (igual que el resto de utils de
// fecha del proyecto), así los tests son TZ-independientes.

const DAY_MS = 86_400_000

export interface RelationalScoreInput {
  /** people.importance_score (1-10). Cae a 5 si no es un número válido. */
  importanceScore: number
  /** people.trust_level (1-10). Cae a 5 si no es un número válido. */
  trustLevel: number
  /** observed_at ISO del último whatsapp_chat curado. null si no hay chat. */
  lastChatObservedAt: string | null
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

  // Reciprocidad: guardrail — V2 no tiene log de interacciones recíprocas aún.
  const reciprocidad: number | null = null

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
