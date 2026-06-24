import { describe, it, expect } from 'vitest'
import { matchEpisodesToGoal } from './episodeFriction'

const ep = { id: 'e1', title: 'Conflicto por el Mundial de Bomberos', detail: 'tema familiar', status: 'abierto', participantIds: ['a', 'b', 'c'] }

describe('matchEpisodesToGoal', () => {
  it('matchea por tema (Mundial)', () => {
    const m = matchEpisodesToGoal('Ir al Mundial de Bomberos 2025', '', [ep])
    expect(m).toHaveLength(1)
    expect(m[0].participantIds).toHaveLength(3)
  })
  it('ignora episodios resueltos', () => {
    expect(matchEpisodesToGoal('Mundial', '', [{ ...ep, status: 'resuelto' }])).toHaveLength(0)
  })
  it('no matchea temas ajenos', () => {
    expect(matchEpisodesToGoal('Aprender alemán', '', [ep])).toHaveLength(0)
  })
})
