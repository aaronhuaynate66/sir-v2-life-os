import { describe, it, expect } from 'vitest'
import { tallyWorked, mapExperimentRow } from './types'

describe('tallyWorked', () => {
  it('cuenta si/no/parcial e ignora null', () => {
    const t = tallyWorked([
      { worked: 'si' }, { worked: 'si' }, { worked: 'no' }, { worked: 'parcial' }, { worked: null },
    ])
    expect(t).toEqual({ si: 2, no: 1, parcial: 1 })
  })
  it('lista vacía → todo en cero', () => {
    expect(tallyWorked([])).toEqual({ si: 0, no: 0, parcial: 0 })
  })
})

describe('mapExperimentRow worked', () => {
  const base = {
    id: 'x', title: 't', detail: null, source: 'espejo', status: 'hecho',
    week_start: '2026-06-22', result: 'r', created_at: '2026-06-22T00:00:00Z', updated_at: '2026-06-22T00:00:00Z',
  }
  it('mapea worked válido', () => {
    expect(mapExperimentRow({ ...base, worked: 'si' }).worked).toBe('si')
    expect(mapExperimentRow({ ...base, worked: 'parcial' }).worked).toBe('parcial')
  })
  it('worked inválido o null → null', () => {
    expect(mapExperimentRow({ ...base, worked: 'tal vez' }).worked).toBeNull()
    expect(mapExperimentRow({ ...base, worked: null }).worked).toBeNull()
  })
})
