import { describe, it, expect } from 'vitest'
import { dealsForStakeholder } from './stakeholderImpact'
import type { Deal } from '@/types'

function deal(p: Partial<Deal>): Deal {
  return {
    id: p.id ?? 'd1', title: p.title ?? 'Deal', stage: p.stage ?? 'reunion', status: p.status ?? 'open',
    relatedPersons: [], impactTypes: [], internalStakeholders: p.internalStakeholders ?? [],
    createdAt: '2026-06-01T00:00:00Z', updatedAt: p.updatedAt ?? '2026-06-17T00:00:00Z', ...p,
  }
}
const NOW = new Date('2026-06-18T00:00:00Z')

describe('dealsForStakeholder', () => {
  it('devuelve deals abiertos donde la persona es stakeholder interno', () => {
    const r = dealsForStakeholder([
      deal({ id: 'a', internalStakeholders: ['fran'] }),
      deal({ id: 'b', internalStakeholders: ['otro'] }),
    ], 'fran', NOW)
    expect(r.map((x) => x.dealId)).toEqual(['a'])
  })
  it('excluye ganados/perdidos/pausados', () => {
    expect(dealsForStakeholder([deal({ id: 'a', stage: 'ganado', internalStakeholders: ['fran'] })], 'fran', NOW)).toHaveLength(0)
    expect(dealsForStakeholder([deal({ id: 'b', status: 'paused', internalStakeholders: ['fran'] })], 'fran', NOW)).toHaveLength(0)
  })
  it('marca momentum reciente (≤14d)', () => {
    const r = dealsForStakeholder([deal({ internalStakeholders: ['fran'], updatedAt: '2026-06-17T00:00:00Z' })], 'fran', NOW)
    expect(r[0].recentlyActive).toBe(true)
  })
  it('ordena por etapa más avanzada primero', () => {
    const r = dealsForStakeholder([
      deal({ id: 'lead', stage: 'lead', internalStakeholders: ['fran'] }),
      deal({ id: 'prop', stage: 'propuesta', internalStakeholders: ['fran'] }),
    ], 'fran', NOW)
    expect(r.map((x) => x.dealId)).toEqual(['prop', 'lead'])
  })
})
