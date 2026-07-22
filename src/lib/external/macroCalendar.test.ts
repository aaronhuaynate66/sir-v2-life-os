// SIR V2 — Tests 18·M5: calendario macro (feriados + quincena).

import { describe, it, expect } from 'vitest'
import { buildMacroCalendar } from './macroCalendar'
import type { PeruHoliday } from '@/data/peruHolidays'

// Fiestas Patrias 2026: 28 (mar) y 29 (mié) jul. No forma finde largo por sí solo.
// Usamos un caso limpio: un feriado en LUNES crea Sáb-Dom-Lun.
const holidays: PeruHoliday[] = [
  { date: '2026-07-06', name: 'Feriado de Prueba' }, // 2026-07-06 es LUNES
  { date: '2026-07-28', name: 'Fiestas Patrias' },
  { date: '2026-07-29', name: 'Fiestas Patrias' },
]

describe('buildMacroCalendar — feriado largo', () => {
  it('detecta un finde largo cuando el feriado cae lunes (Sáb-Dom-Lun)', () => {
    const now = new Date(2026, 6, 1) // 1 jul 2026
    const hits = buildMacroCalendar({ holidays, personalGoals: ['Mudarme con mi perro'] }, now)
    const lw = hits.find((h) => h.kind === 'long_weekend')
    expect(lw).toBeDefined()
    expect(lw!.spanDays).toBeGreaterThanOrEqual(3)
    expect(lw!.hint).toMatch(/Mudarme con mi perro/)
    expect(lw!.hint).toMatch(/finde largo/)
  })

  it('sin objetivo personal, usa un hint genérico', () => {
    const now = new Date(2026, 6, 1)
    const hits = buildMacroCalendar({ holidays }, now)
    const lw = hits.find((h) => h.kind === 'long_weekend')
    expect(lw).toBeDefined()
    expect(lw!.hint).toMatch(/ti, tu gente o un pendiente tuyo/)
  })

  it('no muestra el puente si su inicio queda fuera del lead', () => {
    const now = new Date(2026, 6, 1) // mié 1 jul; el finde largo arranca sáb 4 jul (a 3 días)
    const hits = buildMacroCalendar({ holidays, leadDays: 2 }, now)
    expect(hits.find((h) => h.kind === 'long_weekend')).toBeUndefined()
  })
})

describe('buildMacroCalendar — payday', () => {
  it('avisa la quincena con nota honesta de patrón', () => {
    const now = new Date(2026, 6, 12) // 12 jul → quincena (15) a 3 días
    const hits = buildMacroCalendar({ holidays: [] }, now)
    const pd = hits.find((h) => h.kind === 'payday')
    expect(pd).toBeDefined()
    expect(pd!.title).toBe('Quincena')
    expect(pd!.hint).toMatch(/PATRÓN habitual, no una regla/)
  })

  it('avisa el fin de mes', () => {
    const now = new Date(2026, 6, 30) // 30 jul; fin de mes = 31 jul
    const hits = buildMacroCalendar({ holidays: [] }, now)
    const pd = hits.find((h) => h.kind === 'payday')
    expect(pd).toBeDefined()
    expect(pd!.title).toBe('Fin de mes')
  })

  it('no inventa payday si no hay quincena/fin de mes cerca', () => {
    const now = new Date(2026, 6, 5) // 5 jul; quincena a 10 días (> horizonte 8)
    const hits = buildMacroCalendar({ holidays: [] }, now)
    expect(hits.find((h) => h.kind === 'payday')).toBeUndefined()
  })
})
