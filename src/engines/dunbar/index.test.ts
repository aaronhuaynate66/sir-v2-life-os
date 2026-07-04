// SIR V2 — Tests del mapa de capas de Dunbar (15·1).

import { describe, it, expect } from 'vitest'
import { analyzeDunbar, DUNBAR_LAYERS, type DunbarPerson } from './index'

const NOW = Date.parse('2026-07-03T12:00:00Z')
function daysAgo(n: number): string {
  return new Date(NOW - n * 86_400_000).toISOString().slice(0, 10)
}
function p(id: string, category: DunbarPerson['category'], lastContact?: string | null): DunbarPerson {
  return { id, name: `P${id}`, category, lastContact }
}

describe('analyzeDunbar — estructura', () => {
  it('cuenta por capa y expone las 4 capas siempre', () => {
    const r = analyzeDunbar([p('1', 'inner_circle', daysAgo(1)), p('2', 'close', daysAgo(1)), p('3', 'close', daysAgo(1))], NOW)
    expect(r.layers).toHaveLength(4)
    expect(r.layers.find((l) => l.category === 'inner_circle')?.count).toBe(1)
    expect(r.layers.find((l) => l.category === 'close')?.count).toBe(2)
    expect(r.total).toBe(3)
  })
  it('usa los tamaños de referencia de Dunbar', () => {
    const caps = DUNBAR_LAYERS.map((l) => l.softCap)
    expect(caps).toEqual([5, 15, 50, 150])
  })
})

describe('analyzeDunbar — sub-inversión (stale)', () => {
  it('marca gente del círculo íntimo sin contacto reciente (alta severidad)', () => {
    const r = analyzeDunbar([p('1', 'inner_circle', daysAgo(40))], NOW)
    const a = r.alerts.find((x) => x.kind === 'stale_contact' && x.category === 'inner_circle')
    expect(a?.severity).toBe('high')
    const inner = r.layers.find((l) => l.category === 'inner_circle')!
    expect(inner.staleCount).toBe(1)
  })
  it('contacto reciente NO cuenta como stale', () => {
    const r = analyzeDunbar([p('1', 'inner_circle', daysAgo(5))], NOW)
    expect(r.layers.find((l) => l.category === 'inner_circle')!.staleCount).toBe(0)
  })
  it('sin lastContact = nunca contactado → stale (days -1 en la lista)', () => {
    const r = analyzeDunbar([p('1', 'inner_circle', null)], NOW)
    const inner = r.layers.find((l) => l.category === 'inner_circle')!
    expect(inner.staleCount).toBe(1)
    expect(inner.stalePeople[0].days).toBe(-1)
  })
  it('la periferia tolera mucho más silencio que el círculo íntimo', () => {
    // 60 días: stale para inner (>21) pero NO para periferia (>365)
    const r = analyzeDunbar([p('1', 'peripheral', daysAgo(60))], NOW)
    expect(r.layers.find((l) => l.category === 'peripheral')!.staleCount).toBe(0)
  })
})

describe('analyzeDunbar — sobre-capacidad', () => {
  it('marca capa sobre-poblada vs la referencia', () => {
    const many = Array.from({ length: 8 }, (_, i) => p(`i${i}`, 'inner_circle', daysAgo(1)))
    const r = analyzeDunbar(many, NOW)
    const inner = r.layers.find((l) => l.category === 'inner_circle')!
    expect(inner.overCap).toBe(true)
    expect(r.alerts.some((a) => a.kind === 'over_capacity' && a.category === 'inner_circle')).toBe(true)
  })
  it('dentro de la referencia → sin alerta de capacidad', () => {
    const r = analyzeDunbar([p('1', 'inner_circle', daysAgo(1)), p('2', 'inner_circle', daysAgo(1))], NOW)
    expect(r.alerts.some((a) => a.kind === 'over_capacity')).toBe(false)
  })
})

describe('analyzeDunbar — bordes', () => {
  it('red vacía → sin alertas, sin romper', () => {
    const r = analyzeDunbar([], NOW)
    expect(r.total).toBe(0)
    expect(r.alerts).toHaveLength(0)
  })
  it('círculo íntimo vacío con cercanos → alerta empty_inner', () => {
    const r = analyzeDunbar([p('1', 'close', daysAgo(1))], NOW)
    expect(r.alerts.some((a) => a.kind === 'empty_inner')).toBe(true)
  })
})
