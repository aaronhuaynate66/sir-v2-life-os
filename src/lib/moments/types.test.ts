import { describe, it, expect } from 'vitest'
import { mapMomentRow } from './types'

const base = {
  id: 'm1',
  person_id: 'p1',
  title: 'Examen médico del seguro',
  detail: 'esperando resultados',
  status: 'abierto',
  occurred_on: '2026-07-01',
  follow_up_on: '2026-07-10',
  resolution: null,
  created_at: '2026-07-01T12:00:00Z',
  updated_at: '2026-07-01T12:00:00Z',
}

describe('mapMomentRow', () => {
  it('mapea snake_case → camelCase del dominio', () => {
    const m = mapMomentRow(base)
    expect(m.personId).toBe('p1')
    expect(m.title).toBe('Examen médico del seguro')
    expect(m.followUpOn).toBe('2026-07-10')
  })

  it('status: solo "resuelto" es resuelto; cualquier otra cosa → abierto', () => {
    expect(mapMomentRow({ ...base, status: 'resuelto' }).status).toBe('resuelto')
    expect(mapMomentRow({ ...base, status: 'abierto' }).status).toBe('abierto')
    expect(mapMomentRow({ ...base, status: 'basura' }).status).toBe('abierto')
    expect(mapMomentRow({ ...base, status: '' }).status).toBe('abierto')
  })

  it('recorta fechas a YYYY-MM-DD (aunque venga timestamptz)', () => {
    const m = mapMomentRow({ ...base, occurred_on: '2026-07-01T00:00:00+00:00', follow_up_on: '2026-07-10T05:30:00Z' })
    expect(m.occurredOn).toBe('2026-07-01')
    expect(m.followUpOn).toBe('2026-07-10')
  })

  it('follow_up_on null → null (no revienta)', () => {
    expect(mapMomentRow({ ...base, follow_up_on: null }).followUpOn).toBeNull()
  })

  it('occurred_on ausente → string vacío, no crash', () => {
    expect(mapMomentRow({ ...base, occurred_on: '' }).occurredOn).toBe('')
  })

  it('resolution_suggested: solo true es true (null/undefined/false → false)', () => {
    expect(mapMomentRow({ ...base, resolution_suggested: true }).resolutionSuggested).toBe(true)
    expect(mapMomentRow({ ...base, resolution_suggested: false }).resolutionSuggested).toBe(false)
    expect(mapMomentRow({ ...base, resolution_suggested: null }).resolutionSuggested).toBe(false)
    expect(mapMomentRow(base).resolutionSuggested).toBe(false) // ausente
  })

  it('evidence/confidence: undefined → null', () => {
    const m = mapMomentRow(base)
    expect(m.resolutionEvidence).toBeNull()
    expect(m.resolutionConfidence).toBeNull()
    const m2 = mapMomentRow({ ...base, resolution_evidence: 'ya llegaron los resultados', resolution_confidence: 'high' })
    expect(m2.resolutionEvidence).toBe('ya llegaron los resultados')
    expect(m2.resolutionConfidence).toBe('high')
  })
})
