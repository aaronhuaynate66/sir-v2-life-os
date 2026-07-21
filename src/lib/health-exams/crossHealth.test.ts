import { describe, it, expect } from 'vitest'
import { crossLabPattern, formatCrossLine, type DailyPoint } from './crossHealth'

// Ventana de un patrón de lab: ene→mar. Salud diaria dentro y fuera.
const daily: DailyPoint[] = [
  { type: 'weight', value: 80, date: '2026-01-05' },
  { type: 'weight', value: 80.4, date: '2026-01-20' },
  { type: 'weight', value: 82.5, date: '2026-03-01' },
  { type: 'weight', value: 82.8, date: '2026-03-10' },
  { type: 'hrv_avg', value: 70, date: '2026-01-06' },
  { type: 'hrv_avg', value: 55, date: '2026-03-08' },
  { type: 'respiratory_rate', value: 16, date: '2026-01-06' },
  { type: 'respiratory_rate', value: 16, date: '2026-03-08' }, // sin cambio → no reporta
  { type: 'weight', value: 90, date: '2025-11-01' }, // FUERA de ventana → ignorado
]

describe('crossLabPattern', () => {
  it('reporta el co-movimiento dentro de la ventana (peso ↑, VFC ↓)', () => {
    const s = crossLabPattern({ from: '2026-01-01', to: '2026-03-31' }, daily)
    const byType = Object.fromEntries(s.map((x) => [x.type, x]))
    expect(byType.weight?.dir).toBe('up')
    expect(byType.weight?.deltaText).toContain('+')
    expect(byType.hrv_avg?.dir).toBe('down')
  })
  it('descarta métricas sin cambio claro (ruido)', () => {
    const s = crossLabPattern({ from: '2026-01-01', to: '2026-03-31' }, daily)
    expect(s.find((x) => x.type === 'respiratory_rate')).toBeUndefined() // 16→16
  })
  it('ignora puntos fuera de la ventana', () => {
    // el weight de nov 2025 (90) no debe inflar el delta
    const s = crossLabPattern({ from: '2026-01-01', to: '2026-03-31' }, daily)
    expect(s.find((x) => x.type === 'weight')?.deltaText).not.toContain('10')
  })
  it('necesita ≥2 puntos en la ventana', () => {
    const s = crossLabPattern({ from: '2026-01-01', to: '2026-03-31' }, [{ type: 'weight', value: 80, date: '2026-02-01' }])
    expect(s).toEqual([])
  })
  it('ventana inválida → []', () => {
    expect(crossLabPattern({ from: '', to: '' }, daily)).toEqual([])
    expect(crossLabPattern({ from: '2026-03-31', to: '2026-01-01' }, daily)).toEqual([])
  })
  it('FC del sueño y FC reposo no se duplican (mismo label)', () => {
    const d: DailyPoint[] = [
      { type: 'sleeping_heart_rate', value: 55, date: '2026-01-05' },
      { type: 'sleeping_heart_rate', value: 62, date: '2026-03-05' },
      { type: 'heart_rate', value: 48, date: '2026-01-05' },
      { type: 'heart_rate', value: 60, date: '2026-03-05' },
    ]
    const s = crossLabPattern({ from: '2026-01-01', to: '2026-03-31' }, d)
    expect(s.filter((x) => x.label === 'FC en reposo')).toHaveLength(1)
  })
})

describe('formatCrossLine', () => {
  it('arma la línea honesta de co-ocurrencia', () => {
    const line = formatCrossLine([
      { type: 'weight', label: 'peso', dir: 'up', deltaText: '+2.5 kg' },
      { type: 'hrv_avg', label: 'VFC', dir: 'down', deltaText: '−15 ms' },
    ])
    expect(line).toBe('En ese mismo período: peso +2.5 kg · VFC −15 ms.')
  })
  it('sin señales → null', () => {
    expect(formatCrossLine([])).toBeNull()
  })
})
