// SIR V2 — Tests del digest determinístico de la capa narrativa (Fase 3c).
//
// summarizeCorrelation NO llama al LLM: produce el texto-entrada a partir de
// los MetricByPhase ya computados. Determinístico → testeable. Verificamos
// que sólo incluye buckets con datos, el delta, y que devuelve '' cuando no
// hay nada que narrar (gate para no invocar al modelo).

import { describe, it, expect } from 'vitest'

import type { MetricByPhase } from './correlation'
import { summarizeCorrelation } from './correlationNarrative'

const metric = (over: Partial<MetricByPhase>): MetricByPhase => ({
  kind: over.kind ?? 'mood',
  buckets: over.buckets ?? [],
  totalSamples: over.totalSamples ?? 0,
  delta: over.delta ?? null,
})

describe('summarizeCorrelation', () => {
  it('sin métricas → cadena vacía (no se debe llamar al LLM)', () => {
    expect(summarizeCorrelation([], [])).toBe('')
  })

  it('incluye sólo buckets con average y agrega el delta', () => {
    const lunar: MetricByPhase[] = [
      metric({
        kind: 'mood',
        totalSamples: 4,
        buckets: [
          { phaseId: 'new', label: 'Luna nueva', count: 2, average: 4.5 },
          { phaseId: 'full', label: 'Luna llena', count: 2, average: 2.0 },
          { phaseId: 'first_quarter', label: 'Cuarto creciente', count: 1, average: null },
        ],
        delta: {
          high: { phaseId: 'new', label: 'Luna nueva', count: 2, average: 4.5 },
          low: { phaseId: 'full', label: 'Luna llena', count: 2, average: 2.0 },
          diff: 2.5,
        },
      }),
    ]
    const out = summarizeCorrelation(lunar, [])
    expect(out).toContain('Fase lunar — Ánimo')
    expect(out).toContain('Luna nueva 4.5 (n=2)')
    expect(out).toContain('Luna llena 2 (n=2)')
    // el bucket sin average no aparece
    expect(out).not.toContain('Cuarto creciente')
    // delta
    expect(out).toContain('Delta: Luna nueva (4.5) vs Luna llena (2), diferencia 2.5')
  })

  it('combina lunar y ciclo en líneas separadas', () => {
    const lunar = [metric({ kind: 'energy', totalSamples: 2, buckets: [{ phaseId: 'new', label: 'Luna nueva', count: 2, average: 3 }] })]
    const cycle = [metric({ kind: 'mood', totalSamples: 2, buckets: [{ phaseId: 'luteal', label: 'Lútea', count: 2, average: 2 }] })]
    const out = summarizeCorrelation(lunar, cycle)
    const lines = out.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Fase lunar — Energía')
    expect(lines[1]).toContain('Fase del ciclo — Ánimo')
  })
})
