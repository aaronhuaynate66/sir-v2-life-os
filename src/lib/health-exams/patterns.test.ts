import { describe, it, expect } from 'vitest'
import { labPatterns, labAlertPushLine } from './patterns'
import type { HealthExam } from './types'

function exam(date: string, values: HealthExam['values']): HealthExam {
  return { id: date, examDate: date, provider: null, title: 't', summary: null, findings: [], values, recommendations: [], pdfUrl: null }
}

describe('labPatterns', () => {
  it('tendencia bajando consistente dentro de rango → watch', () => {
    const p = labPatterns([
      exam('2026-05-02', [{ name: 'Hemoglobina', value: '16.8', unit: 'g/dl', range: '13 - 19', flag: 'normal' } as never]),
      exam('2026-05-14', [{ name: 'Hemoglobina', value: '14.5', flag: 'normal' } as never]),
      exam('2026-07-03', [{ name: 'Hemoglobina', value: '13.9', flag: 'normal' } as never]),
    ])
    expect(p).toHaveLength(1)
    expect(p[0].severity).toBe('watch')
    expect(p[0].direction).toBe('down')
    expect(p[0].message).toContain('16.8 → 14.5 → 13.9')
  })
  it('tendencia que termina fuera de rango → alert (va primero)', () => {
    const p = labPatterns([
      exam('2026-01-01', [{ name: 'Glucosa', value: '95', range: '70 - 100', flag: 'normal' } as never, { name: 'X', value: '5', flag: 'normal' } as never]),
      exam('2026-03-01', [{ name: 'Glucosa', value: '102', flag: 'high' } as never, { name: 'X', value: '4', flag: 'normal' } as never]),
      exam('2026-05-01', [{ name: 'Glucosa', value: '110', flag: 'high' } as never, { name: 'X', value: '3', flag: 'normal' } as never]),
    ])
    expect(p[0].name).toBe('Glucosa')
    expect(p[0].severity).toBe('alert')
  })
  it('sin tendencia consistente (solo 2 puntos o no monótona) → nada', () => {
    const p = labPatterns([
      exam('2026-01-01', [{ name: 'Y', value: '10', flag: 'normal' } as never]),
      exam('2026-02-01', [{ name: 'Y', value: '12', flag: 'normal' } as never]),
    ])
    expect(p).toEqual([])
  })
})

describe('labAlertPushLine', () => {
  const alertExams = [
    exam('2026-01-01', [{ name: 'Glucosa', value: '95', range: '70 - 100', flag: 'normal' } as never]),
    exam('2026-03-01', [{ name: 'Glucosa', value: '102', flag: 'high' } as never]),
    exam('2026-05-01', [{ name: 'Glucosa', value: '110', flag: 'high' } as never]),
  ]
  it('devuelve una línea compacta para el patrón alert', () => {
    const line = labAlertPushLine(labPatterns(alertExams))
    expect(line).toContain('Glucosa')
    expect(line).toContain('subiendo')
    expect(line).toMatch(/revisarlo/)
  })
  it('null cuando solo hay patrones watch (nada fuera de rango todavía)', () => {
    const watchOnly = labPatterns([
      exam('2026-05-02', [{ name: 'Hemoglobina', value: '16.8', range: '13 - 19', flag: 'normal' } as never]),
      exam('2026-05-14', [{ name: 'Hemoglobina', value: '14.5', flag: 'normal' } as never]),
      exam('2026-07-03', [{ name: 'Hemoglobina', value: '13.9', flag: 'normal' } as never]),
    ])
    expect(labAlertPushLine(watchOnly)).toBeNull()
  })
  it('null cuando no hay patrones', () => {
    expect(labAlertPushLine([])).toBeNull()
  })
})
