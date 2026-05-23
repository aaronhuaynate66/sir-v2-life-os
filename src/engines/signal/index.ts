// SIR V2 — Signal Engine
import type { Signal } from '@/types'

export interface SignalContext {
  activeSignals: Signal[]
  topPrioritySignal?: Signal
  hasImmediateAlert: boolean
}

export function rankSignalsByPriority(signals: Signal[]): Signal[] {
  const urgencyOrder = { immediate: 0, soon: 1, monitor: 2, archive: 3 }
  return [...signals].filter(s => !s.resolved).sort((a, b) => {
    const diff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    return diff !== 0 ? diff : b.strength - a.strength
  })
}

export function buildSignalContext(signals: Signal[]): SignalContext {
  const active = rankSignalsByPriority(signals)
  return {
    activeSignals: active,
    topPrioritySignal: active[0],
    hasImmediateAlert: active.some(s => s.urgency === 'immediate'),
  }
}

export function extractSignalMeaning(signal: Signal): string {
  const meanings: Record<string, string> = {
    opportunity: 'Hay una oportunidad que evaluar',
    warning: 'Algo requiere atencion pronto',
    pattern: 'Patron repetido detectado',
    timing: 'El timing puede ser relevante ahora',
    emotional: 'Carga emocional significativa',
    relational: 'Cambio en relacion importante',
    biological: 'Tu cuerpo esta enviando una senal',
    financial: 'Movimiento financiero relevante',
  }
  return signal.meaning || meanings[signal.type] || 'Senal detectada'
}
