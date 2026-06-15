import { describe, it, expect } from 'vitest'
import { buildAlertCalendar } from './alertHeatmap'
import type { HealthMetric } from '@/types'

function hm(iso: string, value: number): HealthMetric {
  return { id: `shot:hr:${iso}:heart_rate_high_alerts`, type: 'heart_rate_high_alerts', value, unit: 'alertas', timestamp: `${iso}T12:00:00.000Z`, note: '' }
}

describe('buildAlertCalendar', () => {
  const metrics = [hm('2026-06-14', 2), hm('2026-06-08', 5), hm('2026-06-07', 1), hm('2026-06-06', 2), hm('2026-06-01', 1), hm('2026-05-24', 2)]

  it('resumen: días, total y día pico', () => {
    const c = buildAlertCalendar(metrics, '2026-06-15', 12)
    expect(c.summary.totalDays).toBe(6)
    expect(c.summary.totalAlerts).toBe(13)
    expect(c.summary.busiestIso).toBe('2026-06-08')
    expect(c.summary.busiestCount).toBe(5)
  })

  it('grilla = weeks columnas × 7 filas, lunes primero', () => {
    const c = buildAlertCalendar(metrics, '2026-06-15', 12)
    expect(c.weeks.length).toBe(12)
    expect(c.weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('coloca el conteo en el día correcto', () => {
    const c = buildAlertCalendar(metrics, '2026-06-15', 12)
    const all = c.weeks.flat()
    expect(all.find((d) => d.iso === '2026-06-08')?.count).toBe(5)
    expect(all.find((d) => d.iso === '2026-06-09')?.count).toBe(0)
  })

  it('ignora otros tipos de métrica', () => {
    const mixed: HealthMetric[] = [...metrics, { id: 'x', type: 'weight', value: 83, unit: 'kg', timestamp: '2026-06-10T12:00:00.000Z', note: '' }]
    expect(buildAlertCalendar(mixed, '2026-06-15').summary.totalAlerts).toBe(13)
  })
})
