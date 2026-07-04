// SIR V2 — Tests del timeline unificado (AF·F1).

import { describe, it, expect } from 'vitest'
import { buildUnifiedTimeline, dayLabel, type TimelineItem } from './unified'

const TODAY = '2026-07-04'
function it_(id: string, date: string, source: TimelineItem['source'], title = id): TimelineItem {
  return { id, date, source, title }
}

describe('dayLabel', () => {
  it('hoy / ayer / fecha corta', () => {
    expect(dayLabel('2026-07-04', TODAY)).toBe('hoy')
    expect(dayLabel('2026-07-03', TODAY)).toBe('ayer')
    expect(dayLabel('2026-06-28', TODAY)).toBe('28 jun')
  })
})

describe('buildUnifiedTimeline', () => {
  const items: TimelineItem[] = [
    it_('a', '2026-07-04', 'finanzas'),
    it_('b', '2026-07-04', 'animo'),
    it_('c', '2026-07-03', 'sueno'),
    it_('d', '2026-07-01', 'evento'),
  ]

  it('agrupa por día y ordena desc', () => {
    const t = buildUnifiedTimeline(items, { todayKey: TODAY })
    expect(t.days.map((d) => d.dayKey)).toEqual(['2026-07-04', '2026-07-03', '2026-07-01'])
    expect(t.days[0].items).toHaveLength(2)
    expect(t.total).toBe(4)
  })

  it('reduce timestamps ISO al día de Lima', () => {
    // 03:00 UTC del 4-jul = 22:00 (Lima, -5) del 3-jul.
    const t = buildUnifiedTimeline([{ id: 'x', date: '2026-07-04T03:00:00Z', source: 'salud', title: 'x' }], { todayKey: TODAY })
    expect(t.days[0].dayKey).toBe('2026-07-03')
  })

  it('lista las fuentes presentes (para el filtro)', () => {
    const t = buildUnifiedTimeline(items, { todayKey: TODAY })
    expect(t.sources).toEqual(['animo', 'evento', 'finanzas', 'sueno'])
  })

  it('filtra por fuente pero conserva la lista completa de fuentes', () => {
    const t = buildUnifiedTimeline(items, { todayKey: TODAY, only: ['finanzas'] })
    expect(t.total).toBe(1)
    expect(t.days).toHaveLength(1)
    // sources sigue reflejando TODO el set (para no perder los toggles del filtro)
    expect(t.sources).toContain('animo')
  })

  it('respeta maxDays (los más recientes)', () => {
    const t = buildUnifiedTimeline(items, { todayKey: TODAY, maxDays: 2 })
    expect(t.days.map((d) => d.dayKey)).toEqual(['2026-07-04', '2026-07-03'])
  })

  it('descarta fechas inparseables sin romper', () => {
    const t = buildUnifiedTimeline([it_('bad', 'basura', 'salud')], { todayKey: TODAY })
    expect(t.total).toBe(0)
  })
})
