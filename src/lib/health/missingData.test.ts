import { describe, expect, it } from 'vitest'

import { computeMissingHealthData, relativeDayLabel, renderMissingDataBlock, dataFaltanteLine, SLEEP_TYPE, type Reading } from './missingData'

/** Helper: arma lecturas de un día para varios tipos. */
function day(d: string, types: string[]): Reading[] {
  return types.map((type) => ({ type, day: d }))
}

describe('computeMissingHealthData', () => {
  it('sin data → nada', () => {
    const r = computeMissingHealthData([], '2026-07-23')
    expect(r).toEqual({ referenceDay: null, missing: [], habitual: [] })
  })

  it('caso real jul 21-23: báscula y sueño al día, FC/VFC del día faltó en la última subida', () => {
    const scale = ['weight', 'bmi', 'body_fat_percent', 'skeletal_muscle_mass_kg', 'water_percent', 'bone_mass_kg', 'protein_percent', 'visceral_fat_level', 'metabolic_rate_kcal']
    const sleepMetrics = [SLEEP_TYPE, 'sleeping_heart_rate', 'hrv_avg', 'blood_oxygen', 'respiratory_rate']
    const dailyRange = ['heart_rate_min', 'heart_rate_max', 'hrv_min', 'hrv_max']
    const readings: Reading[] = [
      ...day('2026-07-21', dailyRange),
      ...day('2026-07-22', [...scale, ...sleepMetrics, ...dailyRange]),
      ...day('2026-07-23', [...scale, ...sleepMetrics]), // sin rango FC/VFC este día
    ]
    const r = computeMissingHealthData(readings, '2026-07-23')
    expect(r.referenceDay).toBe('2026-07-23')
    // los 3 bundles son habituales (clave presente ≥2 de 3 días)
    expect(r.habitual.sort()).toEqual(['bascula', 'fc_vfc_dia', 'sueno'])
    // solo faltó FC/VFC del día en la última subida
    expect(r.missing.map((m) => m.key)).toEqual(['fc_vfc_dia'])
    expect(r.missing[0].label).toBe('FC y VFC del día')
    expect(r.missing[0].lastSeen).toBe('2026-07-22')
  })

  it('si faltó el peso en la última subida, marca la báscula', () => {
    const scale = ['weight', 'bmi', 'body_fat_percent']
    const readings: Reading[] = [
      ...day('2026-07-21', scale),
      ...day('2026-07-22', scale),
      ...day('2026-07-23', [SLEEP_TYPE]), // hoy solo durmió, no se pesó
      ...day('2026-07-22', [SLEEP_TYPE]),
      ...day('2026-07-21', [SLEEP_TYPE]),
    ]
    const r = computeMissingHealthData(readings, '2026-07-23')
    expect(r.missing.map((m) => m.key)).toContain('bascula')
    expect(r.missing.find((m) => m.key === 'bascula')?.lastSeen).toBe('2026-07-22')
  })

  it('al día → sin faltantes', () => {
    const all = ['weight', SLEEP_TYPE, 'heart_rate_min']
    const readings: Reading[] = [
      ...day('2026-07-21', all),
      ...day('2026-07-22', all),
      ...day('2026-07-23', all),
    ]
    const r = computeMissingHealthData(readings, '2026-07-23')
    expect(r.missing).toEqual([])
  })

  it('un tipo esporádico (1 día) NO es habitual → no molesta', () => {
    const readings: Reading[] = [
      ...day('2026-07-21', ['weight']),
      ...day('2026-07-22', ['weight']),
      ...day('2026-07-23', ['weight']),
      ...day('2026-07-22', ['vo2_max']), // solo una vez → no habitual
    ]
    const r = computeMissingHealthData(readings, '2026-07-23')
    // vo2_max no está en ningún bundle igual, pero validamos que no rompe nada
    expect(r.missing).toEqual([])
  })

  it('relativeDayLabel: hoy / ayer / hace N días / sin registro', () => {
    expect(relativeDayLabel(null, '2026-07-23')).toBe('sin registro')
    expect(relativeDayLabel('2026-07-23', '2026-07-23')).toBe('hoy')
    expect(relativeDayLabel('2026-07-22', '2026-07-23')).toBe('ayer')
    expect(relativeDayLabel('2026-07-20', '2026-07-23')).toBe('hace 3 días')
  })

  it('renderMissingDataBlock: vacío si no falta nada; con contenido lista los bundles', () => {
    expect(renderMissingDataBlock([], '2026-07-23')).toBe('')
    const block = renderMissingDataBlock([{ key: 'bascula', label: 'Báscula (peso y composición)', lastSeen: '2026-07-22' }], '2026-07-23')
    expect(block).toContain('Báscula (peso y composición)')
    expect(block).toContain('ayer')
    expect(block.toLowerCase()).toContain('captura')
  })

  it('ignora lecturas fuera de la ventana', () => {
    const readings: Reading[] = [
      ...day('2026-06-01', ['weight', 'weight']),
      ...day('2026-07-23', ['weight']),
    ]
    const r = computeMissingHealthData(readings, '2026-07-23', 14)
    // solo jul-23 en ventana → 1 día de data, weight presente en referenceDay
    expect(r.referenceDay).toBe('2026-07-23')
    expect(r.missing).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LA LÍNEA DEL BRIEF — el caso REAL del 4/5-ago-2026
//
// Aaron: "hace 3 días que no me subo a la balanza ni le mando esa data de salud a
// SIR, ¿por qué ni me dice nada?". Ese día se le dio al aviso su propio slot; al
// simular el brief del día siguiente apareció el segundo defecto: el detector viejo
// mira la data más reciente DE CUALQUIER TIPO, y como esa tarde él mandó sueño y
// FC/VFC, el gap agregado bajó a 1 día — con el PESO en 5 días.
// ═══════════════════════════════════════════════════════════════════════════

describe('dataFaltanteLine', () => {
  const HOY = '2026-08-05'

  it('el caso real: nombra la báscula Y los rangos del día, con cuánto lleva cada uno', () => {
    const linea = dataFaltanteLine([
      { key: 'bascula', label: 'Báscula (peso y composición)', lastSeen: '2026-07-31' },
      { key: 'fc_vfc_dia', label: 'FC y VFC del día', lastSeen: '2026-08-03' },
    ], HOY)
    expect(linea).toBe('Te falta subir: Báscula (peso y composición) (hace 5 días) y FC y VFC del día (hace 2 días). Mándame la captura y la proceso.')
  })

  it('NOMBRA el grupo: "falta data de salud" no dice qué mandar', () => {
    const l = dataFaltanteLine([{ key: 'bascula', label: 'Báscula (peso y composición)', lastSeen: '2026-07-31' }], HOY)!
    expect(l).toContain('Báscula')
    expect(l).toContain('hace 5 días')
  })

  it('lo de hoy o de ayer NO molesta: un día no es un hueco', () => {
    expect(dataFaltanteLine([{ key: 'sueno', label: 'Sueño', lastSeen: '2026-08-05' }], HOY)).toBeNull()
    expect(dataFaltanteLine([{ key: 'sueno', label: 'Sueño', lastSeen: '2026-08-04' }], HOY)).toBeNull()
  })

  it('lo de hace 2 días sí (es el umbral)', () => {
    expect(dataFaltanteLine([{ key: 'sueno', label: 'Sueño', lastSeen: '2026-08-03' }], HOY)).toContain('Sueño')
  })

  it('habitual y SIN registro en la ventana: eso urge, aunque no haya fecha', () => {
    const l = dataFaltanteLine([{ key: 'bascula', label: 'Báscula (peso y composición)', lastSeen: null }], HOY)!
    expect(l).toContain('sin registro')
  })

  it('tres grupos se enumeran con "y" al final, no "A y B y C"', () => {
    const l = dataFaltanteLine([
      { key: 'a', label: 'A', lastSeen: '2026-08-01' },
      { key: 'b', label: 'B', lastSeen: '2026-08-01' },
      { key: 'c', label: 'C', lastSeen: '2026-08-01' },
    ], HOY)!
    expect(l).toContain('A (hace 4 días), B (hace 4 días) y C (hace 4 días)')
  })

  it('nada que falte, nada que decir', () => {
    expect(dataFaltanteLine([], HOY)).toBeNull()
  })
})
