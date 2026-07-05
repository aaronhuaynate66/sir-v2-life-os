// SIR V2 — Tests 12·M5: disparar el WOOP cuando ocurre el "if".

import { describe, it, expect } from 'vitest'
import { activeWoopTriggers, type WoopPlan } from './woopTrigger'

// ms UTC para una hora de pared de Lima (UTC-5).
function limaMs(hh: number): number {
  return Date.parse(`2026-07-06T${String(hh).padStart(2, '0')}:00:00-05:00`)
}

function plan(over: Partial<WoopPlan>): WoopPlan {
  return { goalId: 'g', goalTitle: 'Mudarme con mi perro', planIf: '', planThen: 'hago 10 respiraciones', ...over }
}

describe('activeWoopTriggers', () => {
  it('dispara por franja cuando el "if" nombra la mañana y es de mañana', () => {
    const plans = [plan({ planIf: 'por la mañana, al despertar' })]
    const t = activeWoopTriggers(plans, limaMs(7))
    expect(t.length).toBe(1)
    expect(t[0].planThen).toMatch(/respiraciones/)
    expect(t[0].reason).toMatch(/por la mañana/)
  })

  it('NO dispara si la franja no coincide', () => {
    const plans = [plan({ planIf: 'por la mañana' })]
    expect(activeWoopTriggers(plans, limaMs(22))).toHaveLength(0)
  })

  it('dispara por hora explícita dentro de ±1h', () => {
    const plans = [plan({ planIf: 'a las 19:00 después del trabajo' })]
    expect(activeWoopTriggers(plans, limaMs(19))).toHaveLength(1)
    expect(activeWoopTriggers(plans, limaMs(20))).toHaveLength(1) // borde
    expect(activeWoopTriggers(plans, limaMs(22))).toHaveLength(0)
  })

  it('dispara por estado de estrés solo si el "if" lo menciona y hay estrés alto', () => {
    const plans = [plan({ planIf: 'cuando esté estresado' })]
    expect(activeWoopTriggers(plans, limaMs(15), { stressElevated: true })).toHaveLength(1)
    expect(activeWoopTriggers(plans, limaMs(15), { stressElevated: false })).toHaveLength(0)
  })

  it('NO dispara un "if" no detectable (ambiguo)', () => {
    const plans = [plan({ planIf: 'si me acuerdo de hacerlo' })]
    expect(activeWoopTriggers(plans, limaMs(9))).toHaveLength(0)
  })

  it('ignora planes sin then', () => {
    const plans = [plan({ planIf: 'por la mañana', planThen: '' })]
    expect(activeWoopTriggers(plans, limaMs(7))).toHaveLength(0)
  })
})
