import { describe, it, expect } from 'vitest'
import { goalNudgeLine, type GoalForNudge } from './goalNudge'

const NOW = new Date('2026-07-21T12:00:00Z')
const g = (o: Partial<GoalForNudge> & { title: string }): GoalForNudge => ({
  isAnchor: false, progress: 0, targetDate: null, updatedAt: NOW.toISOString(), ...o,
})

describe('goalNudgeLine', () => {
  it('null si no hay señal (norte fresco, sin metas en riesgo)', () => {
    expect(goalNudgeLine([g({ title: 'Norte', isAnchor: true, updatedAt: NOW.toISOString() })], NOW)).toBeNull()
  })

  it('avisa el NORTE estancado (≥14 días sin tocar)', () => {
    const line = goalNudgeLine([g({ title: 'Mundial de bomberos', isAnchor: true, updatedAt: '2026-07-01T12:00:00Z' })], NOW)
    expect(line).toContain('Mundial de bomberos')
    expect(line).toContain('20 días') // 01→21 jul
    expect(line).toMatch(/paso hoy/i)
  })

  it('el norte estancado GANA sobre una meta en riesgo', () => {
    const line = goalNudgeLine([
      g({ title: 'Norte', isAnchor: true, updatedAt: '2026-06-01T12:00:00Z' }),
      g({ title: 'Meta', targetDate: '2026-07-25', progress: 10 }),
    ], NOW)
    expect(line).toContain('Norte')
  })

  it('avisa la meta EN RIESGO más urgente (vence pronto y atrás)', () => {
    const line = goalNudgeLine([
      g({ title: 'Lejana', targetDate: '2026-08-15', progress: 10 }),
      g({ title: 'Urgente', targetDate: '2026-07-24', progress: 20 }),
    ], NOW)
    expect(line).toContain('Urgente')
    expect(line).toContain('vence en 3 días')
    expect(line).toContain('20%')
  })

  it('NO marca en riesgo una meta que ya va bien (≥50%)', () => {
    expect(goalNudgeLine([g({ title: 'Bien', targetDate: '2026-07-25', progress: 80 })], NOW)).toBeNull()
  })

  it('NO marca en riesgo una meta con deadline lejano (>30 días)', () => {
    expect(goalNudgeLine([g({ title: 'Lejos', targetDate: '2026-09-30', progress: 5 })], NOW)).toBeNull()
  })

  it('ignora metas vencidas (du < 0)', () => {
    expect(goalNudgeLine([g({ title: 'Vencida', targetDate: '2026-07-01', progress: 10 })], NOW)).toBeNull()
  })
})
