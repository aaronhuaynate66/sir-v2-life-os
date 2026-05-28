// SIR V2 — SelfMetric → TimelineEvent adapter
import type { SelfMetric, MetricCategory } from '@/types'
import type { TimelineEvent } from '../types'

const CATEGORY_LABEL: Record<MetricCategory, string> = {
  energy: 'Energía',
  mood: 'Ánimo',
  stress: 'Estrés',
  focus: 'Foco',
  motivation: 'Motivación',
  confidence: 'Confianza',
}

export function adaptSelfMetric(m: SelfMetric): TimelineEvent {
  const label = CATEGORY_LABEL[m.category] ?? m.category
  return {
    id: `self_metric:${m.id}`,
    type: 'self_metric',
    occurredAt: m.timestamp,
    title: `${label} ${m.value}/10`,
    body: m.note,
    tags: [label],
    meta: {
      category: m.category,
      value: m.value,
    },
  }
}

export function adaptSelfMetrics(rows: SelfMetric[]): TimelineEvent[] {
  return rows.map(adaptSelfMetric)
}
