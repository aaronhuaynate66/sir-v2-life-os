import { describe, it, expect } from 'vitest'
import { inferInteractionQuality } from './interactionTone'

describe('inferInteractionQuality', () => {
  it('null cuando no hay señal de sentimiento', () => {
    expect(inferInteractionQuality({ emotionalStates: { user: 'neutral', otherPerson: 'normal' }, summary: 'coordinaron un horario' })).toBeNull()
  })

  it('null con input vacío', () => {
    expect(inferInteractionQuality({})).toBeNull()
  })

  it('positivo fuerte (cumpleaños/agradecido) → 5', () => {
    const r = inferInteractionQuality({
      emotionalStates: { user: 'feliz, agradecido', otherPerson: 'cariñosa' },
      summary: 'Dayana lo felicitó por su cumpleaños con mucho cariño',
    })
    expect(r?.quality).toBe(5)
    expect(r?.emoLabel).toContain('feliz')
  })

  it('positivo leve → 4', () => {
    const r = inferInteractionQuality({
      emotionalStates: { user: 'contento', otherPerson: 'neutral' },
      summary: 'coordinaron el horario',
    })
    expect(r?.quality).toBe(4)
  })

  it('negativo fuerte (conflicto) → 1', () => {
    const r = inferInteractionQuality({
      emotionalStates: { user: 'molesto, frustrado', otherPerson: 'enojada' },
      summary: 'una discusión con reproches',
    })
    expect(r?.quality).toBe(1)
  })

  it('señal mixta → 3', () => {
    const r = inferInteractionQuality({
      emotionalStates: { user: 'feliz', otherPerson: 'molesta' },
    })
    expect(r?.quality).toBe(3)
  })

  it('tolera campos nulos/ausentes', () => {
    const r = inferInteractionQuality({ emotionalStates: { user: 'agradecido', otherPerson: null }, summary: null, topics: null })
    expect(r?.quality).toBeGreaterThanOrEqual(4)
    expect(r?.emoLabel).toBe('agradecido')
  })

  it('insensible a tildes y mayúsculas', () => {
    const r = inferInteractionQuality({ emotionalStates: { user: 'EMOCIÓN', otherPerson: 'Cariñosa' } })
    expect(r?.quality).toBeGreaterThanOrEqual(4)
  })
})
