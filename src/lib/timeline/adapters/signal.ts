// SIR V2 — Signal → TimelineEvent adapter
import type { Signal, SignalSource, SignalUrgency } from '@/types'
import type { TimelineEvent } from '../types'

const SOURCE_LABEL: Record<SignalSource, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  calendar: 'Calendario',
  biological: 'Biológica',
  financial: 'Financiera',
  relational: 'Relacional',
  manual: 'Manual',
}

const URGENCY_LABEL: Record<SignalUrgency, string> = {
  immediate: 'inmediata',
  soon: 'pronto',
  monitor: 'monitorear',
  archive: 'archivada',
}

function truncate(s: string, max = 120): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s
}

export function adaptSignal(s: Signal): TimelineEvent {
  const sourceLabel = SOURCE_LABEL[s.source] ?? s.source
  return {
    id: `signal:${s.id}`,
    type: 'signal',
    occurredAt: s.detectedAt,
    title: `${sourceLabel}: ${truncate(s.content)}`,
    body: s.meaning,
    tags: [s.type, URGENCY_LABEL[s.urgency]],
    meta: {
      source: s.source,
      signalType: s.type,
      strength: s.strength,
      urgency: s.urgency,
      resolved: s.resolved,
      actionRequired: s.actionRequired,
      suggestedAction: s.suggestedAction,
    },
  }
}

export function adaptSignals(rows: Signal[]): TimelineEvent[] {
  return rows.map(adaptSignal)
}
