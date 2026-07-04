// SIR V2 — Tests de "Eventos que sigo" (18·M3).

import { describe, it, expect } from 'vitest'
import { classifyWatchedEvents, daysUntil, normalizeNode, type WatchedEvent } from './watchedEvents'

const TODAY = '2026-07-03'
function ev(id: string, eventDate: string, over: Partial<WatchedEvent> = {}): WatchedEvent {
  return { id, title: `E${id}`, eventDate, node: 'general', relatedId: null, impact: '', createdAt: '', ...over }
}

describe('daysUntil', () => {
  it('cuenta días hacia adelante y atrás', () => {
    expect(daysUntil('2026-07-10', TODAY)).toBe(7)
    expect(daysUntil('2026-07-03', TODAY)).toBe(0)
    expect(daysUntil('2026-07-01', TODAY)).toBe(-2)
  })
  it('0 si no parsea', () => {
    expect(daysUntil('basura', TODAY)).toBe(0)
  })
})

describe('classifyWatchedEvents', () => {
  it('ordena los próximos por fecha ascendente', () => {
    const out = classifyWatchedEvents([ev('a', '2026-08-01'), ev('b', '2026-07-05'), ev('c', '2026-07-20')], TODAY)
    expect(out.map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })
  it('los pasados (recientes) van al final', () => {
    const out = classifyWatchedEvents([ev('past', '2026-07-02'), ev('soon', '2026-07-06')], TODAY)
    expect(out.map((e) => e.id)).toEqual(['soon', 'past'])
  })
  it('descarta los que pasaron hace más de N días', () => {
    const out = classifyWatchedEvents([ev('old', '2026-06-01')], TODAY, 3)
    expect(out).toHaveLength(0)
  })
  it('etiqueta la banda de proximidad', () => {
    const out = classifyWatchedEvents([ev('today', TODAY), ev('week', '2026-07-08'), ev('month', '2026-07-25'), ev('later', '2026-10-01')], TODAY)
    const byId = Object.fromEntries(out.map((e) => [e.id, e.proximity]))
    expect(byId.today).toBe('today')
    expect(byId.week).toBe('this_week')
    expect(byId.month).toBe('this_month')
    expect(byId.later).toBe('later')
  })
  it('etiquetas legibles (hoy / mañana / en N días)', () => {
    const out = classifyWatchedEvents([ev('t', TODAY), ev('m', '2026-07-04'), ev('n', '2026-07-13')], TODAY)
    const byId = Object.fromEntries(out.map((e) => [e.id, e.whenLabel]))
    expect(byId.t).toBe('hoy')
    expect(byId.m).toBe('mañana')
    expect(byId.n).toBe('en 10 días')
  })
})

describe('normalizeNode', () => {
  it('acepta nodos válidos y cae a general', () => {
    expect(normalizeNode('finanzas')).toBe('finanzas')
    expect(normalizeNode('otro')).toBe('general')
    expect(normalizeNode(undefined)).toBe('general')
  })
})
