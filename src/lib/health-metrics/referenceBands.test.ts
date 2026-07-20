import { describe, it, expect } from 'vitest'
import { evalReference, pct } from './referenceBands'

describe('pct', () => {
  it('mapea a 0–100 con clamp', () => {
    expect(pct(50, [0, 100])).toBe(50)
    expect(pct(-10, [0, 100])).toBe(0)   // clamp bajo
    expect(pct(999, [0, 100])).toBe(100) // clamp alto
  })
  it('escala degenerada → 0', () => {
    expect(pct(5, [10, 10])).toBe(0)
  })
})

describe('evalReference — % grasa (hombres, ACE)', () => {
  it('24% o menos → ok', () => {
    expect(evalReference('body_fat_percent', 17, [])?.status).toBe('ok')
    expect(evalReference('body_fat_percent', 24, [])?.status).toBe('ok')
  })
  it('25.1% (caso real de Aaron) → warn "sobre tu zona"', () => {
    const r = evalReference('body_fat_percent', 25.1, [])
    expect(r?.status).toBe('warn')
    expect(r?.statusLabel).toBe('sobre tu zona')
  })
  it('28%+ → bad', () => {
    expect(evalReference('body_fat_percent', 30, [])?.status).toBe('bad')
  })
})

describe('evalReference — grasa visceral (Tanita)', () => {
  it('≤12 sano, 13–20 elevado, 21+ riesgo', () => {
    expect(evalReference('visceral_fat_level', 11, [])?.status).toBe('ok')
    expect(evalReference('visceral_fat_level', 12, [])?.statusLabel).toBe('sano')
    expect(evalReference('visceral_fat_level', 15, [])?.status).toBe('warn')
    expect(evalReference('visceral_fat_level', 22, [])?.status).toBe('bad')
  })
})

describe('evalReference — IMC (WHO)', () => {
  it('18.5–24.9 normal, 25–29.9 sobrepeso, 30+ obesidad', () => {
    expect(evalReference('bmi', 22, [])?.statusLabel).toBe('normal')
    const r = evalReference('bmi', 26.3, []) // caso de Aaron
    expect(r?.status).toBe('warn'); expect(r?.statusLabel).toBe('sobrepeso')
    expect(evalReference('bmi', 31, [])?.statusLabel).toBe('obesidad')
    expect(evalReference('bmi', 17, [])?.statusLabel).toBe('bajo')
  })
})

describe('evalReference — signos vitales', () => {
  it('SpO₂: ≥95 ok, 90–94 warn', () => {
    expect(evalReference('blood_oxygen', 98, [])?.status).toBe('ok')
    expect(evalReference('blood_oxygen', 92, [])?.status).toBe('warn')
  })
  it('Frecuencia respiratoria: 12–20 normal', () => {
    expect(evalReference('respiratory_rate', 16, [])?.status).toBe('ok')
    expect(evalReference('respiratory_rate', 22, [])?.status).toBe('warn')
  })
  it('FC reposo: <60 "fondo de atleta", ≤100 ok', () => {
    const r = evalReference('heart_rate', 48, []) // caso de Aaron
    expect(r?.status).toBe('ok'); expect(r?.statusLabel).toBe('fondo de atleta')
    expect(evalReference('heart_rate', 105, [])?.status).toBe('warn')
  })
})

describe('evalReference — VFC (baseline personal, no tabla)', () => {
  it('con <3 muestras → null (no hay baseline)', () => {
    expect(evalReference('hrv_avg', 65, [65, 60])).toBeNull()
  })
  it('valor dentro de media±0.7·sd → ok; muy por debajo → warn', () => {
    const serie = [50, 55, 60, 65, 70, 62, 58]
    const dentro = evalReference('hrv_avg', 60, serie)
    expect(dentro?.status).toBe('ok')
    expect(dentro?.statusLabel).toBe('dentro de tu rango')
    const bajo = evalReference('hrv_avg', 30, serie)
    expect(bajo?.status).toBe('warn')
    expect(bajo?.statusLabel).toBe('bajo tu rango')
  })
})

describe('evalReference — sin rango de referencia', () => {
  it('peso / masa muscular → null (solo tendencia, sin banda)', () => {
    expect(evalReference('weight', 81.5, [])).toBeNull()
    expect(evalReference('muscle_mass_kg', 61, [])).toBeNull()
  })
})
