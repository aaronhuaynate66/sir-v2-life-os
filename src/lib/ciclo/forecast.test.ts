// SIR V2 — Tests de anticipación de cuidado + ventana de predicción (17·M2 + M5).

import { describe, it, expect } from 'vitest'
import { careAnticipation, predictionWindow } from './forecast'

describe('careAnticipation (M2)', () => {
  it('anticipa cuando faltan pocos días para la ventana PMS', () => {
    // PMS empieza 5 días antes del período; período en 8 días → PMS en 3 días.
    const r = careAnticipation({ daysUntilNextPeriod: 8, isPmsWindow: false, confidence: 'high' })
    expect(r.show).toBe(true)
    expect(r.daysUntilPms).toBe(3)
    expect(r.message).toMatch(/semana más sensible|gesto de presencia/i)
    expect(r.message).toMatch(/no es tratarla distinto/i) // encuadre: lo niega explícitamente
  })

  it('no anticipa si ya está DENTRO de la ventana (lo cubre M1)', () => {
    expect(careAnticipation({ daysUntilNextPeriod: 3, isPmsWindow: true, confidence: 'high' }).show).toBe(false)
  })

  it('no anticipa con confianza baja o insuficiente (ciclo irregular)', () => {
    expect(careAnticipation({ daysUntilNextPeriod: 8, isPmsWindow: false, confidence: 'low' }).show).toBe(false)
    expect(careAnticipation({ daysUntilNextPeriod: 8, isPmsWindow: false, confidence: 'insufficient' }).show).toBe(false)
  })

  it('no anticipa si falta mucho todavía', () => {
    expect(careAnticipation({ daysUntilNextPeriod: 20, isPmsWindow: false, confidence: 'high' }).show).toBe(false)
  })
})

describe('predictionWindow (M5)', () => {
  it('arma la ventana ± banda', () => {
    const w = predictionWindow('2026-07-15', 3)
    expect(w).toEqual({ from: '2026-07-12', to: '2026-07-18' })
  })

  it('banda 0 → sin ventana (no hay incertidumbre que expresar)', () => {
    expect(predictionWindow('2026-07-15', 0)).toBeNull()
  })

  it('fecha inválida → null', () => {
    expect(predictionWindow('no-fecha', 3)).toBeNull()
  })
})
