import { describe, it, expect } from 'vitest'
import { buildCommercialPipeline, isCommercialLead } from './commercialPipeline'
import type { Person } from '@/types'

const NOW = new Date('2026-06-16T12:00:00Z')
function p(o: Partial<Person>): Person {
  return { id: 'x', name: 'X', relationship: 'friend', category: 'network', importanceScore: 5, energyImpact: 'neutral', trustLevel: 5, contactFrequency: '', tags: [], notes: '', createdAt: '', updatedAt: '', ...o } as Person
}

describe('commercialPipeline', () => {
  it('detecta leads por tag', () => {
    expect(isCommercialLead(p({ tags: ['amigo', 'marlab'] }))).toBe(true)
    expect(isCommercialLead(p({ tags: ['bomberos'] }))).toBe(false)
  })
  it('ordena por enfriamiento (más frío primero) y marca cooling', () => {
    const list = buildCommercialPipeline([
      p({ id: 'a', name: 'Alejandro', tags: ['comercial'], lastContact: '2026-06-15T00:00:00Z', notes: 'l1\npasarle cotización aurigopharma' }),
      p({ id: 'm', name: 'Miluska', tags: ['marlab'], lastContact: '2026-05-01T00:00:00Z' }),
      p({ id: 'n', name: 'Nadie', tags: ['cliente'] }),
    ], NOW)
    expect(list.map((l) => l.id)).toEqual(['n', 'm', 'a'])
    expect(list.find((l) => l.id === 'a')?.cooling).toBe(false)
    expect(list.find((l) => l.id === 'm')?.cooling).toBe(true)
    expect(list.find((l) => l.id === 'a')?.lastNote).toContain('cotización')
  })
})
