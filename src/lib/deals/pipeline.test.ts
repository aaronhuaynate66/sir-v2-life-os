import { describe, it, expect } from 'vitest'
import { groupByStage, isOpenDeal, daysSinceUpdate, STAGE_ORDER } from './pipeline'
import type { Deal } from '@/types'

function deal(p: Partial<Deal>): Deal {
  return {
    id: p.id ?? 'd1', title: p.title ?? 'x', stage: p.stage ?? 'lead', status: p.status ?? 'open',
    relatedPersons: [], createdAt: '2026-06-01T00:00:00Z', updatedAt: p.updatedAt ?? '2026-06-10T00:00:00Z', ...p,
  }
}

describe('groupByStage', () => {
  it('agrupa y respeta el orden del pipeline, solo etapas con deals', () => {
    const g = groupByStage([deal({ id: 'a', stage: 'propuesta' }), deal({ id: 'b', stage: 'lead' })])
    expect(g.map((x) => x.stage)).toEqual(['lead', 'propuesta'])
  })
  it('ordena dentro de la etapa por updatedAt desc', () => {
    const g = groupByStage([
      deal({ id: 'old', stage: 'lead', updatedAt: '2026-06-01T00:00:00Z' }),
      deal({ id: 'new', stage: 'lead', updatedAt: '2026-06-09T00:00:00Z' }),
    ])
    expect(g[0].deals.map((d) => d.id)).toEqual(['new', 'old'])
  })
})

describe('isOpenDeal', () => {
  it('ganado/perdido no están abiertos', () => {
    expect(isOpenDeal(deal({ stage: 'ganado' }))).toBe(false)
    expect(isOpenDeal(deal({ stage: 'perdido' }))).toBe(false)
    expect(isOpenDeal(deal({ stage: 'reunion' }))).toBe(true)
  })
})

describe('daysSinceUpdate', () => {
  it('cuenta días', () => {
    expect(daysSinceUpdate(deal({ updatedAt: '2026-06-10T00:00:00Z' }), new Date('2026-06-17T00:00:00Z'))).toBe(7)
  })
})

it('STAGE_ORDER tiene 7 etapas', () => { expect(STAGE_ORDER).toHaveLength(7) })
