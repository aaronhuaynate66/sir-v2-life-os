import { describe, it, expect } from 'vitest'
import { buildLabTrends } from './trend'
import type { HealthExam } from './types'

function exam(date: string, values: HealthExam['values']): HealthExam {
  return { id: date, examDate: date, provider: null, title: 't', summary: null, findings: [], values, recommendations: [], pdfUrl: null }
}

describe('buildLabTrends', () => {
  const exams = [
    exam('2026-07-03', [{ name: 'Hemoglobina', value: '13.9', unit: 'g/dl', range: '13 - 19', flag: 'normal', category: 'HEMATOLOGÍA' } as never]),
    exam('2026-05-02', [{ name: 'Hemoglobina', value: '16.8', flag: 'normal', category: 'HEMATOLOGÍA' } as never, { name: 'Colesterol', value: '190', flag: 'normal', category: 'BIOQUÍMICA' } as never]),
    exam('2026-05-14', [{ name: 'Hemoglobina', value: '14.5', flag: 'normal', category: 'HEMATOLOGÍA' } as never]),
  ]
  const t = buildLabTrends(exams)

  it('ordena las fechas cronológicamente', () => {
    expect(t.dates).toEqual(['2026-05-02', '2026-05-14', '2026-07-03'])
  })
  it('pivota hemoglobina a través de las 3 fechas y detecta tendencia bajando + consistente', () => {
    const hema = t.byCategory.find((c) => c.category === 'HEMATOLOGÍA')!
    const hb = hema.trends.find((x) => x.name === 'Hemoglobina')!
    expect(hb.points.map((p) => p?.value ?? null)).toEqual(['16.8', '14.5', '13.9'])
    expect(hb.direction).toBe('down')
    expect(hb.consistent).toBe(true) // 3 mediciones, siempre bajando → patrón
    // hereda unit/range aunque solo estén en un examen
    expect(hb.unit).toBe('g/dl')
    expect(hb.range).toBe('13 - 19')
  })
  it('un analito medido una sola vez → sin dirección, no consistente, con hueco', () => {
    const bio = t.byCategory.find((c) => c.category === 'BIOQUÍMICA')!
    const col = bio.trends.find((x) => x.name === 'Colesterol')!
    expect(col.direction).toBeNull()
    expect(col.consistent).toBe(false)
    expect(col.points).toEqual([expect.objectContaining({ value: '190' }), null, null])
  })
})
