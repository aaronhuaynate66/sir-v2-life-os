import { describe, expect, it } from 'vitest'

import { learnedWeightsFromRows } from './weights'

describe('brain/weights · learnedWeightsFromRows', () => {
  it('devuelve Map vacio con input vacio', () => {
    const m = learnedWeightsFromRows([])
    expect(m.size).toBe(0)
  })

  it('convierte weights de tipo numero directamente', () => {
    const m = learnedWeightsFromRows([
      { edge_key: 'person:a:person:b:family', weight: 2.5 },
    ])
    expect(m.get('person:a:person:b:family')).toBe(2.5)
  })

  it('convierte weights de tipo string (supabase numeric)', () => {
    const m = learnedWeightsFromRows([
      { edge_key: 'goal:g1:step:s1:goal_step', weight: '1.75' },
    ])
    expect(m.get('goal:g1:step:s1:goal_step')).toBe(1.75)
  })

  it('descarta filas con weight no finito', () => {
    const m = learnedWeightsFromRows([
      { edge_key: 'ok:1:ok:2:family', weight: 3 },
      { edge_key: 'bad:1:bad:2:family', weight: 'abc' },
      { edge_key: 'nan:1:nan:2:family', weight: Number.NaN },
    ])
    expect(m.size).toBe(1)
    expect(m.has('ok:1:ok:2:family')).toBe(true)
    expect(m.has('bad:1:bad:2:family')).toBe(false)
    expect(m.has('nan:1:nan:2:family')).toBe(false)
  })

  it('deja la ultima escritura si hay claves duplicadas', () => {
    const m = learnedWeightsFromRows([
      { edge_key: 'k', weight: 1 },
      { edge_key: 'k', weight: 5 },
    ])
    expect(m.get('k')).toBe(5)
  })
})
