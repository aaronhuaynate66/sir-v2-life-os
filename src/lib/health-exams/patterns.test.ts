import { describe, it, expect } from 'vitest'
import { labPatterns, labAlertPushLine, parseRange } from './patterns'
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
  // ⚠️ CAMBIO DE COMPORTAMIENTO DELIBERADO (31-jul-2026).
  //
  // Este test antes esperaba `null` para ESTA MISMA serie, o sea que fijaba el bug
  // con los números REALES de Aaron: su hemoglobina hizo 16.8 → 14.5 → 13.9 entre
  // mayo y julio (−17,3 %) y el push la descartaba por seguir "dentro de rango".
  // Ninguno de sus tres informes la vio tampoco: cada laboratorio leyó su propia
  // planilla y en las tres el valor estaba en verde. Ver `meritaEmpujon`.
  it('un watch con MUCHA deriva sí se empuja: es el caso real de la hemoglobina', () => {
    const watchOnly = labPatterns([
      exam('2026-05-02', [{ name: 'Hemoglobina', value: '16.8', unit: 'g/dl', range: '13 – 19', flag: 'normal' } as never]),
      exam('2026-05-14', [{ name: 'Hemoglobina', value: '14.5', flag: 'normal' } as never]),
      exam('2026-07-03', [{ name: 'Hemoglobina', value: '13.9', flag: 'normal' } as never]),
    ])
    expect(watchOnly[0].severity).toBe('watch')
    expect(watchOnly[0].deltaPct).toBeCloseTo(-17.3, 1)
    const line = labAlertPushLine(watchOnly)
    expect(line).toContain('Hemoglobina')
    expect(line).toContain('bajando')
    expect(line).toContain('17.3')
    // No puede sonar a alarma: sigue en rango y hay que decirlo.
    expect(line).toContain('en rango')
  })

  it('un watch con deriva CHICA se queda en el panel, no empuja', () => {
    const leve = labPatterns([
      exam('2026-01-01', [{ name: 'Urea', value: '40', unit: 'mg/dl', range: '13 – 43', flag: 'normal' } as never]),
      exam('2026-03-01', [{ name: 'Urea', value: '39', flag: 'normal' } as never]),
      exam('2026-05-01', [{ name: 'Urea', value: '38.5', flag: 'normal' } as never]),
    ])
    expect(leve[0].severity).toBe('watch')
    expect(Math.abs(leve[0].deltaPct!)).toBeLessThan(15)
    expect(labAlertPushLine(leve)).toBeNull()
  })

  it('pegado al borde AL QUE SE DIRIGE empuja aunque la deriva sea chica', () => {
    // Baja poco (−6 %) pero queda a 0.3 del piso de un rango de ancho 6.
    const borde = labPatterns([
      exam('2026-01-01', [{ name: 'Hemoglobina', value: '14.2', unit: 'g/dl', range: '13 – 19', flag: 'normal' } as never]),
      exam('2026-03-01', [{ name: 'Hemoglobina', value: '13.7', flag: 'normal' } as never]),
      exam('2026-05-01', [{ name: 'Hemoglobina', value: '13.3', flag: 'normal' } as never]),
    ])
    expect(Math.abs(borde[0].deltaPct!)).toBeLessThan(15)
    expect(borde[0].nearEdge).toBe(true)
    expect(labAlertPushLine(borde)).toContain('borde')
  })

  it('el borde solo cuenta del lado hacia el que se mueve, no del opuesto', () => {
    // SUBE y está cerca del MÍNIMO: se aleja del borde, no debe contar.
    const subiendo = labPatterns([
      exam('2026-01-01', [{ name: 'Hemoglobina', value: '13.2', unit: 'g/dl', range: '13 – 19', flag: 'normal' } as never]),
      exam('2026-03-01', [{ name: 'Hemoglobina', value: '13.5', flag: 'normal' } as never]),
      exam('2026-05-01', [{ name: 'Hemoglobina', value: '13.8', flag: 'normal' } as never]),
    ])
    expect(subiendo[0].nearEdge).toBe(false)
  })

  it('el alert manda sobre el watch aunque el watch se haya movido más', () => {
    const mixto = labPatterns([
      exam('2026-01-01', [
        { name: 'Glucosa', value: '95', range: '70 – 100', flag: 'normal' } as never,
        { name: 'Hemoglobina', value: '18', unit: 'g/dl', range: '13 – 19', flag: 'normal' } as never,
      ]),
      exam('2026-03-01', [
        { name: 'Glucosa', value: '102', flag: 'high' } as never,
        { name: 'Hemoglobina', value: '16', flag: 'normal' } as never,
      ]),
      exam('2026-05-01', [
        { name: 'Glucosa', value: '110', flag: 'high' } as never,
        { name: 'Hemoglobina', value: '14', flag: 'normal' } as never,
      ]),
    ])
    expect(labAlertPushLine(mixto)).toContain('Glucosa')
  })

  it('null cuando no hay patrones', () => {
    expect(labAlertPushLine([])).toBeNull()
  })
})

describe('parseRange — los formatos REALES de los laboratorios peruanos', () => {
  it('rango con guion largo (–), que es el que usan de verdad', () => {
    // Aceptar solo "-" hacía que NINGÚN rango de su data parseara.
    expect(parseRange('13 – 19 (♂)')).toEqual({ min: 13, max: 19 })
    expect(parseRange('150 – 450')).toEqual({ min: 150, max: 450 })
    expect(parseRange('18.5 – 24.9')).toEqual({ min: 18.5, max: 24.9 })
  })
  it('rango con guion corto', () => {
    expect(parseRange('70 - 110')).toEqual({ min: 70, max: 110 })
  })
  it('solo techo o solo piso', () => {
    expect(parseRange('< 200')).toEqual({ min: null, max: 200 })
    expect(parseRange('> 40 (♂)')).toEqual({ min: 40, max: null })
  })
  it('lo que no se puede parsear no revienta', () => {
    expect(parseRange(undefined)).toEqual({ min: null, max: null })
    expect(parseRange('Negativo')).toEqual({ min: null, max: null })
    expect(parseRange('≈ control ± 10')).toEqual({ min: null, max: null })
  })
})
