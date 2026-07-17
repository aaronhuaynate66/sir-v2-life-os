import { describe, it, expect } from 'vitest'
import { rowToHealthExam, hasOutOfRange, outOfRangeCount, type ExamValue } from './types'

describe('rowToHealthExam', () => {
  it('mapea fila cruda tolerando nulls/formatos', () => {
    const r = rowToHealthExam({
      id: 'e1', exam_date: '2026-07-03T00:00:00Z', provider: 'Sanna', title: 'Chequeo',
      summary: 'normal', findings: [{ code: 'E67.8', label: 'Sobrepeso' }], values: [], recommendations: ['bajar peso'], storage_path: 'u/exams/x.pdf',
    })
    expect(r.examDate).toBe('2026-07-03')
    expect(r.findings[0].code).toBe('E67.8')
    expect(r.storagePath).toBe('u/exams/x.pdf')
  })
  it('defaults a arrays vacíos si vienen mal', () => {
    const r = rowToHealthExam({ id: 'e2', title: 'x', findings: null, values: 'nope', recommendations: undefined })
    expect(r.findings).toEqual([])
    expect(r.values).toEqual([])
    expect(r.recommendations).toEqual([])
  })
})

describe('hasOutOfRange / outOfRangeCount', () => {
  const vals: ExamValue[] = [
    { name: 'Hemoglobina', value: '13.9', flag: 'normal' },
    { name: 'Basófilos', value: '0.07', flag: 'high' },
    { name: 'VMP', value: '11.9', flag: 'high' },
  ]
  it('detecta y cuenta los fuera de rango', () => {
    expect(hasOutOfRange(vals)).toBe(true)
    expect(outOfRangeCount(vals)).toBe(2)
  })
  it('todo normal → false / 0', () => {
    const ok: ExamValue[] = [{ name: 'x', value: '1', flag: 'normal' }]
    expect(hasOutOfRange(ok)).toBe(false)
    expect(outOfRangeCount(ok)).toBe(0)
  })
})
