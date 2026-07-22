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
