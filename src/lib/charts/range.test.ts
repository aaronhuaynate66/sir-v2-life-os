import { describe, it, expect } from 'vitest'
import { filterPointsByRange } from './series'

const NOW = new Date(2026, 5, 12) // vie 12 jun 2026 (semana lun 8 .. dom 14)
const p = (date: string) => ({ date, value: 1 })

describe('filterPointsByRange', () => {
  it('semana = lun→dom de la semana actual', () => {
    const pts = [p('2026-06-07'), p('2026-06-08'), p('2026-06-12'), p('2026-06-14'), p('2026-06-15')]
    const out = filterPointsByRange(pts, 'semana', NOW).map((x) => x.date)
    expect(out).toEqual(['2026-06-08', '2026-06-12', '2026-06-14'])
  })
  it('mes = mismo año-mes', () => {
    const pts = [p('2026-05-31'), p('2026-06-01'), p('2026-06-30'), p('2026-07-01')]
    const out = filterPointsByRange(pts, 'mes', NOW).map((x) => x.date)
    expect(out).toEqual(['2026-06-01', '2026-06-30'])
  })
})
