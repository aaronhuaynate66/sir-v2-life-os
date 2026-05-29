// SIR V2 — HealthMetric → TimelineEvent adapter
import type { HealthMetric } from '@/types'
import type { TimelineEvent } from '../types'
import { getHealthMetricLabel } from '@/lib/health-metrics/labels'

function formatValue(m: HealthMetric): string {
  const v = Number.isInteger(m.value) ? m.value.toString() : m.value.toFixed(1)
  return `${v} ${m.unit}`
}

export function adaptHealthMetric(m: HealthMetric): TimelineEvent {
  const label = getHealthMetricLabel(m.type)
  return {
    id: `health:${m.id}`,
    type: 'health',
    occurredAt: m.timestamp,
    title: `${label}: ${formatValue(m)}`,
    body: m.note,
    tags: [label],
    meta: {
      metricType: m.type,
      value: m.value,
      unit: m.unit,
      // Confidence se infiere del note "Captura báscula (conf. high)" si
      // existe. groupByCapture lo recoge para el body line del card grouped.
      confidence: extractConfidenceFromNote(m.note),
    },
    captureId: m.captureId,
    captureKind: m.captureType,
  }
}

/** Parsea "Captura báscula (conf. high)" -> "high". Tolera ausencia. */
function extractConfidenceFromNote(note: string | undefined): 'high' | 'medium' | 'low' | undefined {
  if (!note) return undefined
  const match = note.match(/conf\.\s*(high|medium|low)/i)
  return match ? (match[1].toLowerCase() as 'high' | 'medium' | 'low') : undefined
}

export function adaptHealthMetrics(rows: HealthMetric[]): TimelineEvent[] {
  return rows.map(adaptHealthMetric)
}
