import { describe, it, expect } from 'vitest'
import { cleanImportDates } from './dateFilter'
import type { SpecialDate } from '@/types'

const sd = (label: string, date: string, recurring = false): SpecialDate => ({ id: label, label, date, recurring })
let n = 0
const gid = () => `id-${n++}`

describe('cleanImportDates', () => {
  it('deduplica el mismo evento con títulos casi iguales (misma fecha)', () => {
    n = 0
    const out = cleanImportDates([
      { label: 'Viaje a China', date: '2026-04-05' },
      { label: 'Viaje de Nicolle a China', date: '2026-04-05' },
    ], [], null, 'Nicolle', gid)
    expect(out).toHaveLength(1)
  })
  it('deduplica contra las ya guardadas', () => {
    n = 0
    const out = cleanImportDates([{ label: 'Viaje a Madrid', date: '2026-02-19' }], [sd('Viaje a Madrid', '2026-02-19')], null, '', gid)
    expect(out).toHaveLength(0)
  })
  it('descarta genéricas', () => {
    n = 0
    expect(cleanImportDates([{ label: 'Día de la Madre', date: '2026-05-11', recurring: true }], [], null, '', gid)).toHaveLength(0)
  })
  it('no agrega el cumpleaños si ya hay fecha de nacimiento', () => {
    n = 0
    const out = cleanImportDates([{ label: 'Cumpleaños de Nicolle (30 años)', date: '2026-10-17', recurring: true }], [], '1994-10-06', 'Nicolle', gid)
    expect(out).toHaveLength(0)
  })
  it('deja pasar una fecha legítima nueva', () => {
    n = 0
    const out = cleanImportDates([{ label: 'Viaje a Ibiza', date: '2025-10-31' }], [sd('Viaje a Madrid', '2026-02-19')], null, '', gid)
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('Viaje a Ibiza')
  })
})
