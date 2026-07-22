import { describe, it, expect } from 'vitest'
import { buildGoalTimingNudge, type GoalTimingCandidate } from './timingNudge'

const c = (o: Partial<GoalTimingCandidate> = {}): GoalTimingCandidate => ({
  personName: 'Dayana Yrribarren',
  goalTitle: 'Marlab factura anual',
  pendingAction: 'pedirle el contacto del proveedor',
  signalDetail: 'anda activa hoy',
  observedAt: '2026-07-22T10:00:00.000Z',
  ...o,
})

describe('buildGoalTimingNudge', () => {
  it('arma el nudge con el primer nombre + acción pendiente + objetivo', () => {
    const n = buildGoalTimingNudge([c()])
    expect(n).toContain('Buen momento con Dayana')
    expect(n).toContain('anda activa hoy')
    expect(n).toContain('pedirle el contacto del proveedor')
    expect(n).toContain('Marlab factura anual')
  })

  it('se queda con la señal MÁS reciente', () => {
    const n = buildGoalTimingNudge([
      c({ personName: 'Ana Vieja', observedAt: '2026-07-20T10:00:00.000Z' }),
      c({ personName: 'Beto Fresco', observedAt: '2026-07-22T09:00:00.000Z' }),
    ])
    expect(n).toContain('Beto')
    expect(n).not.toContain('Ana')
  })

  it('recorta acción y objetivo largos', () => {
    const n = buildGoalTimingNudge([c({
      pendingAction: 'x'.repeat(120),
      goalTitle: 'y'.repeat(80),
    })])
    expect(n).toContain('…')
    expect(n!.length).toBeLessThan(200)
  })

  it('ignora candidatos incompletos; null si no queda ninguno', () => {
    expect(buildGoalTimingNudge([c({ pendingAction: '' })])).toBeNull()
    expect(buildGoalTimingNudge([c({ personName: '  ' })])).toBeNull()
    expect(buildGoalTimingNudge([])).toBeNull()
  })

  it('mezcla válidos e inválidos → toma el válido', () => {
    const n = buildGoalTimingNudge([c({ goalTitle: '' }), c({ personName: 'Carla Buena' })])
    expect(n).toContain('Carla')
  })
})
