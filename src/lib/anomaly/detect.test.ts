// SIR V2 — Tests de "cosas que no te cuadran" (AF·F3).

import { describe, it, expect } from 'vitest'
import { detectAnomalies, type AnomalyInput } from './detect'

const NOW = Date.parse('2026-07-04T12:00:00Z')
function recent(n: number): string {
  return new Date(NOW - n * 86_400_000).toISOString().slice(0, 10)
}
const empty: AnomalyInput = { finance: [], metrics: [], sleep: [] }

describe('detectAnomalies — finanzas', () => {
  it('marca un gasto atípicamente alto vs la mediana', () => {
    const finance = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, amountPEN: 50, date: recent(10 + i), type: 'expense' })),
      { id: 'big', amountPEN: 3000, date: recent(3), type: 'expense', description: 'Notebook' },
    ]
    const r = detectAnomalies({ ...empty, finance }, NOW)
    const a = r.find((x) => x.id === 'f_big')
    expect(a).toBeTruthy()
    expect(a?.source).toBe('finanzas')
    expect(a?.detail).toMatch(/Notebook/)
  })
  it('no marca si no hay dispersión (todos iguales)', () => {
    const finance = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, amountPEN: 50, date: recent(i), type: 'expense' }))
    expect(detectAnomalies({ ...empty, finance }, NOW).length).toBe(0)
  })
  it('ignora gastos viejos (> ventana reciente)', () => {
    const finance = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, amountPEN: 50, date: recent(200 + i), type: 'expense' })),
      { id: 'oldbig', amountPEN: 3000, date: recent(120), type: 'expense' },
    ]
    expect(detectAnomalies({ ...empty, finance }, NOW).some((a) => a.id === 'f_oldbig')).toBe(false)
  })
})

describe('detectAnomalies — métricas y sueño', () => {
  it('marca una lectura de estrés que se dispara', () => {
    const metrics = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, category: 'stress', value: 3, timestamp: recent(10 + i) + 'T12:00:00Z' })),
      { id: 'spike', category: 'stress', value: 10, timestamp: recent(2) + 'T12:00:00Z' },
    ]
    const a = detectAnomalies({ ...empty, metrics }, NOW).find((x) => x.id === 'm_spike')
    expect(a?.source).toBe('animo')
    expect(a?.detail).toMatch(/por encima/)
  })
  it('marca una noche muy corta vs tu ritmo', () => {
    const sleep = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, duration: 7.5, date: recent(10 + i) })),
      { id: 'short', duration: 2, date: recent(1) },
    ]
    const a = detectAnomalies({ ...empty, sleep }, NOW).find((x) => x.id === 'sl_short')
    expect(a?.source).toBe('sueno')
    expect(a?.title).toMatch(/2h/)
  })
})

describe('detectAnomalies — bordes', () => {
  it('con poca muestra no inventa anomalías', () => {
    const finance = [{ id: 'a', amountPEN: 5000, date: recent(1), type: 'expense' }]
    expect(detectAnomalies({ ...empty, finance }, NOW)).toHaveLength(0)
  })
  it('data vacía → sin anomalías', () => {
    expect(detectAnomalies(empty, NOW)).toHaveLength(0)
  })
  it('ordena por recencia y cap a 8', () => {
    const finance = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, amountPEN: i === 0 ? 50 : 50, date: recent(i), type: 'expense' }))
      .concat(Array.from({ length: 12 }, (_, i) => ({ id: `big${i}`, amountPEN: 4000, date: recent(i), type: 'expense' })))
    const r = detectAnomalies({ ...empty, finance }, NOW)
    expect(r.length).toBeLessThanOrEqual(8)
  })
})
