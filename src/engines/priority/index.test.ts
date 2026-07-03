// SIR V2 — Tests de la jerarquía de prioridades de dominio.

import { describe, it, expect } from 'vitest'
import {
  PRIORITY_LEVEL, PRIORITY_ORDER, compareDomains, resolveTradeoff, outranks, rankByPriority,
  type PriorityDomain,
} from './index'

describe('jerarquía', () => {
  it('el orden es Paz>Salud>Finanzas>Personal>Relacional>Optimización', () => {
    expect(PRIORITY_ORDER).toEqual(['peace', 'health', 'finance', 'personal', 'relational', 'optimization'])
    // niveles estrictamente crecientes en ese orden
    const levels = PRIORITY_ORDER.map((d) => PRIORITY_LEVEL[d])
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it('compareDomains: menor nivel es más importante', () => {
    expect(compareDomains('peace', 'optimization')).toBeLessThan(0)
    expect(compareDomains('finance', 'health')).toBeGreaterThan(0)
    expect(compareDomains('personal', 'personal')).toBe(0)
  })

  it('resolveTradeoff devuelve el dominio que gana', () => {
    expect(resolveTradeoff('health', 'relational')).toBe('health')
    expect(resolveTradeoff('optimization', 'peace')).toBe('peace')
    expect(resolveTradeoff('finance', 'finance')).toBe('finance')
  })

  it('outranks es estricto', () => {
    expect(outranks('peace', 'health')).toBe(true)
    expect(outranks('health', 'peace')).toBe(false)
    expect(outranks('personal', 'personal')).toBe(false)
  })
})

describe('rankByPriority', () => {
  interface Item { name: string; domain: PriorityDomain; w?: number }
  it('ordena por dominio (Paz primero, Optimización último)', () => {
    const items: Item[] = [
      { name: 'optimizar', domain: 'optimization' },
      { name: 'contactar', domain: 'relational' },
      { name: 'dormir', domain: 'health' },
      { name: 'calma', domain: 'peace' },
    ]
    expect(rankByPriority(items, (i) => i.domain).map((i) => i.name))
      .toEqual(['calma', 'dormir', 'contactar', 'optimizar'])
  })

  it('empate de dominio → rompe por weight (mayor primero), y es estable', () => {
    const items: Item[] = [
      { name: 'a', domain: 'personal', w: 1 },
      { name: 'b', domain: 'personal', w: 3 },
      { name: 'c', domain: 'personal', w: 3 },
    ]
    // b y c tienen w=3 → van antes que a; entre b y c se conserva el orden (estable)
    expect(rankByPriority(items, (i) => i.domain, (i) => i.w ?? 0).map((i) => i.name))
      .toEqual(['b', 'c', 'a'])
  })

  it('no muta el input', () => {
    const items: Item[] = [{ name: 'x', domain: 'optimization' }, { name: 'y', domain: 'peace' }]
    const copy = [...items]
    rankByPriority(items, (i) => i.domain)
    expect(items).toEqual(copy)
  })
})
