import { describe, it, expect } from 'vitest'
import { resolveKinshipMentions, type SelfLink } from './kinship'

const links: SelfLink[] = [
  { personId: 'esteban', kind: 'padre' },
  { personId: 'mama', kind: 'madre' },
  { personId: 'diana', kind: 'pareja' },
  { personId: 'hermana', kind: 'hermana' },
]

describe('resolveKinshipMentions', () => {
  it('resuelve "mi papá" al vínculo padre', () => {
    expect(resolveKinshipMentions('¿qué me dijo mi papá sobre Logan?', links)).toEqual(['esteban'])
  })
  it('resuelve variantes (viejo, vieja, novia)', () => {
    expect(resolveKinshipMentions('cómo está mi vieja', links)).toEqual(['mama'])
    expect(resolveKinshipMentions('planes con mi novia el finde', links)).toEqual(['diana'])
  })
  it('no matchea si no hay palabra de parentesco', () => {
    expect(resolveKinshipMentions('¿cómo viene el trabajo?', links)).toEqual([])
  })
  it('puede resolver varios a la vez', () => {
    const r = resolveKinshipMentions('mi papá y mi hermana', links)
    expect(r).toContain('esteban')
    expect(r).toContain('hermana')
  })
  it('solo resuelve vínculos que existen (si no hay pareja, no inventa)', () => {
    expect(resolveKinshipMentions('mi novia', [{ personId: 'x', kind: 'padre' }])).toEqual([])
  })
})
