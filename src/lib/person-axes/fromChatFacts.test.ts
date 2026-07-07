import { describe, it, expect } from 'vitest'
import { professionalAxisFromFacts } from './fromChatFacts'

describe('professionalAxisFromFacts', () => {
  it('extrae solo facts de trabajo y rotula "Del chat"', () => {
    const r = professionalAxisFromFacts([
      'trabaja en la notaría Rosalía Mejía',
      'horario de 8:30 am a 6:30 pm',
      'tiene dos perros Micky y Logan',
      'es fan de Laura Pausini',
    ])
    expect(r).toContain('Del chat:')
    expect(r).toContain('notaría')
    expect(r).toContain('horario')
    expect(r).not.toContain('perros')
    expect(r).not.toContain('Pausini')
  })

  it('null si no hay facts de trabajo', () => {
    expect(professionalAxisFromFacts(['tiene dos perros', 'le gusta el rock'])).toBeNull()
    expect(professionalAxisFromFacts([])).toBeNull()
    expect(professionalAxisFromFacts(null)).toBeNull()
  })

  it('dedup y tope de 5', () => {
    const many = Array.from({ length: 8 }, (_, i) => `trabajo dato ${i}`)
    const r = professionalAxisFromFacts([...many, 'trabajo dato 0'])!
    expect((r.match(/·/g) || []).length).toBeLessThanOrEqual(4) // ≤5 items = ≤4 separadores
  })
})
