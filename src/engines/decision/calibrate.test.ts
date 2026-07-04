// SIR V2 — Tests del calibrador de decisión (14·M3 + 14·M4).

import { describe, it, expect } from 'vitest'
import { evaluateDecision } from './index'
import { calibrateDecision } from './calibrate'

function assess(scores: Record<string, number>) {
  return evaluateDecision({
    title: 't',
    scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { score: v }])) as never,
  })
}

describe('calibrateDecision — reversibilidad (M3)', () => {
  it('reversible → puerta de dos vías, decidí rápido', () => {
    const c = calibrateDecision(assess({ reversibility: 2, peace: 1 }))
    expect(c.doorType).toBe('two_way')
    expect(c.effortGuidance).toMatch(/dos vías|no la sobre-pienses|ajustá/i)
  })

  it('irreversible → puerta de una vía, tomate el tiempo', () => {
    const c = calibrateDecision(assess({ reversibility: -2, peace: 1 }))
    expect(c.doorType).toBe('one_way')
    expect(c.effortGuidance).toMatch(/una vía|tomarte el tiempo/i)
  })

  it('sin reversibilidad evaluada → unclear', () => {
    const c = calibrateDecision(assess({ peace: 1 }))
    expect(c.doorType).toBe('unclear')
  })
})

describe('calibrateDecision — modo (M4)', () => {
  it('irreversible + valores fuertes → maximizar', () => {
    const c = calibrateDecision(assess({ reversibility: -2, values: 2, peace: 1 }))
    expect(c.mode).toBe('maximize')
    expect(c.modeGuidance).toMatch(/maximizar/i)
  })

  it('reversible → satisficer (aunque los valores pesen)', () => {
    const c = calibrateDecision(assess({ reversibility: 2, values: 2 }))
    expect(c.mode).toBe('satisfice')
    expect(c.modeGuidance).toMatch(/suficientemente buena|paradoja/i)
  })

  it('irreversible pero valores neutros → satisficer', () => {
    const c = calibrateDecision(assess({ reversibility: -2, values: 0, financial: 1 }))
    expect(c.mode).toBe('satisfice')
  })
})

describe('calibrateDecision — flags (M6 / M2)', () => {
  it('valores en contra → valuesTension', () => {
    const c = calibrateDecision(assess({ values: -2, peace: 1, reversibility: 1 }))
    expect(c.valuesTension).toBe(true)
  })

  it('premortem recomendado en irreversible o veredicto no-go', () => {
    expect(calibrateDecision(assess({ reversibility: -2, peace: 1 })).premortemRecommended).toBe(true)
    // veredicto hold (ponderado muy negativo)
    expect(calibrateDecision(assess({ peace: -2, financial: -2 })).premortemRecommended).toBe(true)
  })

  it('reversible + go claro → sin premortem forzado', () => {
    const c = calibrateDecision(assess({ reversibility: 2, peace: 2, values: 2, financial: 2 }))
    expect(c.premortemRecommended).toBe(false)
  })
})
