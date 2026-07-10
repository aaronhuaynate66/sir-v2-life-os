// SIR V2 — buildEntries: cobertura de la fuente `money` en el hilo unificado
// de la Bitácora + el orden cronológico cross-fuente.
import { describe, it, expect } from 'vitest'
import { buildEntries, SOURCE_ORDER } from './bitacoraEntries'
import type { PersonLog } from '@/lib/person-logs/types'
import type { MoneyEntry } from '@/lib/money/types'

const log = (id: string, loggedAt: string): PersonLog => ({
  id, userId: 'u', personId: 'p', kind: 'interaction', value: 4, note: 'charla',
  loggedAt, createdAt: loggedAt,
})

const money = (over: Partial<MoneyEntry>): MoneyEntry => ({
  id: 'm1', personId: 'p', direction: 'out', amount: 500, currency: 'S/',
  concept: null, kind: 'transfer', occurredOn: '2026-07-05', occurredTime: null,
  opRef: null, settled: false, ...over,
})

describe('buildEntries · fuente money', () => {
  it('incluye movimientos con fecha como entries de plata', () => {
    const out = buildEntries([], [], [], [], [money({ concept: 'endoscopia' })])
    expect(out).toHaveLength(1)
    const e = out[0]
    expect(e.source).toBe('money')
    expect(e.label).toBe('Plata')
    expect(e.value).toBe('−S/ 500.00')
    expect(e.detail).toContain('Le pasaste')
    expect(e.detail).toContain('endoscopia')
  })

  it('dirección in → prefijo + y "Te devolvió"; saldado se anota', () => {
    const out = buildEntries([], [], [], [], [money({ direction: 'in', amount: 120, settled: true })])
    expect(out[0].value).toBe('+S/ 120.00')
    expect(out[0].detail).toContain('Te devolvió')
    expect(out[0].detail).toContain('saldado')
  })

  it('descarta movimientos sin fecha (no se pueden ubicar en el hilo)', () => {
    const out = buildEntries([], [], [], [], [money({ occurredOn: null })])
    expect(out).toHaveLength(0)
  })

  it('usa la hora cuando es válida (HH:MM) para posicionar dentro del día', () => {
    const out = buildEntries([], [], [], [], [money({ occurredTime: '14:30' })])
    expect(out[0].at).toBe('2026-07-05T14:30:00')
  })

  it('hora inválida cae a medianoche (sin hora fake)', () => {
    const out = buildEntries([], [], [], [], [money({ occurredTime: 'tarde' })])
    expect(out[0].at).toBe('2026-07-05T00:00:00')
  })

  it('ordena cronológico desc mezclando fuentes (log + plata)', () => {
    const out = buildEntries(
      [log('l1', '2026-07-01T10:00:00Z')],
      [], [], [],
      [money({ id: 'm2', occurredOn: '2026-07-08' })],
    )
    expect(out.map((e) => e.source)).toEqual(['money', 'log'])
  })
})

describe('SOURCE_ORDER', () => {
  it('cubre las cinco fuentes del hilo sin duplicados', () => {
    expect(new Set(SOURCE_ORDER).size).toBe(5)
    expect(SOURCE_ORDER).toContain('money')
  })
})
