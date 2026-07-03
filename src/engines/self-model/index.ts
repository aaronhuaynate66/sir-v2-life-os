// SIR V2 — Modelo del self DINÁMICO (A7). PURO.
//
// La auditoría notó que el modelo del usuario era determinístico/ESTÁTICO. Esto
// lo hace dinámico: infiere "cómo venís" AHORA a partir de hacia dónde se mueven
// tus series (las proyecciones de A5) + la tendencia de tu paz (A6). No es config
// fija: evoluciona con los datos. Determinístico (sin LLM), componible.

export interface SelfSignal {
  label: string
  direction: 'rising' | 'falling' | 'flat'
  /** true si "subir" es BUENO para esa métrica (energía sí; FC en reposo NO). */
  goodWhenRising: boolean
}

export interface DynamicSelfState {
  momentum: 'rising' | 'stable' | 'declining' | 'insufficient'
  /** Métricas que están mejorando (para el bienestar). */
  improving: string[]
  /** Métricas que están empeorando. */
  worsening: string[]
  /** Frase corta del estado actual. */
  summary: string
}

/** ¿Esta señal está mejorando el bienestar? (rising+bueno, o falling+malo). null si flat. */
function isImproving(s: SelfSignal): boolean | null {
  if (s.direction === 'flat') return null
  const rising = s.direction === 'rising'
  return rising === s.goodWhenRising
}

const MOM_LABEL: Record<DynamicSelfState['momentum'], string> = {
  rising: 'en subida', stable: 'estable', declining: 'en bajada', insufficient: 'sin datos suficientes',
}

/**
 * Deriva el estado dinámico del self. `peaceTrend` (A6) suma un voto ponderado.
 * insufficient si no hay señales ni tendencia de paz. PURO.
 */
export function deriveDynamicSelf(
  signals: SelfSignal[],
  peaceTrend?: 'improving' | 'stable' | 'declining',
): DynamicSelfState {
  const improving: string[] = []
  const worsening: string[] = []
  for (const s of signals) {
    const imp = isImproving(s)
    if (imp === true) improving.push(s.label)
    else if (imp === false) worsening.push(s.label)
  }

  if (signals.length === 0 && !peaceTrend) {
    return { momentum: 'insufficient', improving, worsening, summary: 'Todavía no hay suficiente serie para leer tu momento.' }
  }

  let net = improving.length - worsening.length
  if (peaceTrend === 'improving') net += 1
  else if (peaceTrend === 'declining') net -= 1

  const momentum: DynamicSelfState['momentum'] = net > 0 ? 'rising' : net < 0 ? 'declining' : 'stable'

  const parts: string[] = [`Venís ${MOM_LABEL[momentum]}`]
  if (improving.length) parts.push(`mejora: ${improving.join(', ')}`)
  if (worsening.length) parts.push(`atención: ${worsening.join(', ')}`)
  const summary = parts.join(' · ') + '.'

  return { momentum, improving, worsening, summary }
}
