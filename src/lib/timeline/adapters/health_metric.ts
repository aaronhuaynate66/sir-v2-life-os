// SIR V2 — HealthMetric → TimelineEvent adapter
import type { HealthMetric, HealthMetricType } from '@/types'
import type { TimelineEvent } from '../types'

const TYPE_LABEL: Record<HealthMetricType, string> = {
  weight: 'Peso',
  blood_pressure: 'Presión',
  heart_rate: 'Ritmo cardíaco',
  steps: 'Pasos',
  calories: 'Calorías',
  hydration: 'Hidratación',
  custom: 'Custom',
}

function formatValue(m: HealthMetric): string {
  const v = Number.isInteger(m.value) ? m.value.toString() : m.value.toFixed(1)
  return `${v} ${m.unit}`
}

export function adaptHealthMetric(m: HealthMetric): TimelineEvent {
  const label = TYPE_LABEL[m.type] ?? m.type
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
    },
  }
}

export function adaptHealthMetrics(rows: HealthMetric[]): TimelineEvent[] {
  return rows.map(adaptHealthMetric)
}
